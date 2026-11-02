#!/usr/bin/env python3
"""Offline DINOv2 + existing BiGRU head candidates. No training or dataset edits.

Bundle layout matches the original planner_config.json, head/best.pt and local
backbone/ snapshot. Centered probability smoothing is offline, not causal.
"""

import argparse
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from torch import nn
from torchcodec.decoders import VideoDecoder
from transformers import Dinov2Model

from annotations import check, read_json, read_jsonl, video_path, write_json


class BiGRUHead(nn.Module):
    def __init__(self, feature_dim=2304, hidden_dim=256, num_classes=6):
        super().__init__()
        self.temporal = nn.GRU(
            feature_dim, hidden_dim, batch_first=True, bidirectional=True
        )
        self.head = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, x):
        return self.head(self.temporal(x)[0][:, -1])


def preprocess(frames, size):
    images = []
    for frame in frames:
        h, w = frame.shape[:2]
        canvas = Image.new("RGB", (max(h, w), max(h, w)), 0)
        canvas.paste(Image.fromarray(frame), (0, 0))
        image = canvas.resize((size, size), Image.Resampling.BILINEAR)
        images.append(
            torch.from_numpy(np.asarray(image, dtype=np.float32).copy()).permute(
                2, 0, 1
            )
            / 255
        )
    return torch.stack(images)


def smooth(probabilities, window):
    check(
        type(window) is int and window > 0 and window % 2 == 1,
        "Smoothing window must be positive and odd",
    )
    padded = np.pad(
        probabilities.astype(np.float64),
        ((window // 2, window // 2), (0, 0)),
        mode="edge",
    )
    sums = np.vstack([np.zeros((1, probabilities.shape[1])), padded.cumsum(axis=0)])
    return ((sums[window:] - sums[:-window]) / window).astype(np.float32)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dataset", type=Path, required=True)
    p.add_argument("--bundle", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--episodes", type=int, nargs="+")
    p.add_argument("--device", default="cpu")
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--smoothing-window", type=int, default=15)
    a = p.parse_args()
    check(
        a.batch_size > 0 and a.smoothing_window > 0 and a.smoothing_window % 2 == 1,
        "Invalid batch/smoothing size",
    )
    dataset = a.dataset.resolve(strict=True)
    check(not a.output_dir.exists(), "Use a new output directory")
    check(
        not a.output_dir.resolve().is_relative_to(dataset)
        and not dataset.is_relative_to(a.output_dir.resolve()),
        "Output must be separate from source",
    )
    config = read_json(a.bundle / "planner_config.json")
    check(
        config["head_type"] == "bigru"
        and config["view_order"] == ["base", "left_wrist", "right_wrist"],
        "This reference supports the three-view BiGRU bundle",
    )
    check(
        config["history_length"] > 0 and config["image_color_order"] == "RGB",
        "Unsupported history/color configuration",
    )
    check(
        config["letter_box"]["image_anchor"] == "top_left"
        and config["letter_box"]["fill"] == 0,
        "Unsupported letterbox configuration",
    )
    check(
        config["pixel_scale"] == "divide_by_255"
        and config["resize"] == "PIL.Image.Resampling.BILINEAR",
        "Unsupported scaling/resize configuration",
    )
    info = read_json(a.dataset / "meta/info.json")
    check(
        info["fps"] == config["training_source_fps"],
        "FPS differs from planner training",
    )
    mapping = read_json(a.bundle / config["subtask_map_path"])
    tasks = sorted(mapping["subtasks"], key=lambda x: x["id"])
    check(
        [s["id"] for s in tasks] == list(range(config["num_subtasks"])),
        "Head classes must match the complete global mapping",
    )
    metadata = read_jsonl(a.dataset / "meta/episodes.jsonl")
    selected = [
        e for e in metadata if a.episodes is None or e["episode_index"] in a.episodes
    ]
    check(
        selected
        and (
            a.episodes is None
            or {e["episode_index"] for e in selected} == set(a.episodes)
        ),
        "Unknown/empty episode selection",
    )
    device = torch.device(a.device)
    torch.set_num_threads(4)
    feature_dim = len(config["view_order"]) * config["feature_dim_per_view"]
    head = BiGRUHead(feature_dim, config["hidden_dim"], config["num_subtasks"])
    head.load_state_dict(
        torch.load(
            a.bundle / config["head_path"], map_location="cpu", weights_only=True
        ),
        strict=True,
    )
    head = head.float().to(device).eval()
    backbone = (
        Dinov2Model.from_pretrained(
            a.bundle / config["backbone_path"], local_files_only=True
        )
        .float()
        .to(device)
        .eval()
    )
    backbone.requires_grad_(False)
    check(
        backbone.config.hidden_size == config["feature_dim_per_view"],
        "Backbone dimension mismatch",
    )
    mean = torch.tensor(config["pixel_mean"], device=device).view(1, 3, 1, 1)
    std = torch.tensor(config["pixel_std"], device=device).view(1, 3, 1, 1)
    a.output_dir.mkdir(parents=True)
    result = dict(
        schema_version=3,
        status="machine_preannotation_pending_human_review",
        annotation_method="dino_bigru_offline",
        fps=info["fps"],
        overall_prompt=mapping.get("overall_prompt", ""),
        subtasks=tasks,
        episodes=[],
        method=dict(
            history=config["history_length"],
            smoothing_window=a.smoothing_window,
            causal_smoothing=False,
            config_sha256=hashlib.sha256(
                (a.bundle / "planner_config.json").read_bytes()
            ).hexdigest(),
        ),
    )
    for ep in selected:
        index, length = ep["episode_index"], ep["length"]
        features = np.empty(
            (length, 3, config["feature_dim_per_view"]), dtype=np.float16
        )
        for v, view in enumerate(config["view_order"]):
            decoder = VideoDecoder(
                str(video_path(a.dataset, info, index, view)), num_ffmpeg_threads=2
            )
            check(
                int(decoder.metadata.num_frames) == length,
                "Video/metadata frame count mismatch",
            )
            for start in range(0, length, a.batch_size):
                end = min(length, start + a.batch_size)
                frames = (
                    decoder.get_frames_in_range(start, end)
                    .data.numpy()
                    .transpose(0, 2, 3, 1)
                )
                images = preprocess(frames, config["image_size"]).to(device)
                with torch.inference_mode():
                    cls = backbone(
                        pixel_values=(images - mean) / std
                    ).last_hidden_state[:, 0]
                check(bool(torch.isfinite(cls).all()), "Non-finite DINO features")
                features[start:end, v] = cls.cpu().numpy().astype(np.float16)
            del decoder
        chunks = []
        for start in range(0, length, 512):
            indices = np.maximum(
                0,
                np.arange(start, min(start + 512, length))[:, None]
                + np.arange(1 - config["history_length"], 1)[None, :],
            )
            sequence = (
                features[indices]
                .astype(np.float32)
                .reshape(-1, config["history_length"], feature_dim)
            )
            with torch.inference_mode():
                chunks.append(
                    head(torch.from_numpy(sequence).to(device))
                    .softmax(-1)
                    .cpu()
                    .numpy()
                )
        probabilities = np.concatenate(chunks)
        check(np.isfinite(probabilities).all(), "Non-finite class probabilities")
        smoothed = smooth(probabilities, a.smoothing_window)
        labels = smoothed.argmax(1)
        bounds = np.r_[0, np.flatnonzero(labels[1:] != labels[:-1]) + 1, length]
        segments = [
            dict(
                id=int(labels[s]),
                start=int(s),
                end=int(e),
                text=tasks[labels[s]]["text"],
                reviewed=False,
                mean_confidence=float(probabilities[s:e, labels[s]].mean()),
                reason="Machine candidate; visually verify both boundaries.",
            )
            for s, e in zip(bounds[:-1], bounds[1:])
        ]
        np.savez_compressed(
            a.output_dir / f"episode_{index:06d}.npz",
            features=features,
            probabilities=probabilities,
            smoothed_probabilities=smoothed,
        )
        result["episodes"].append(
            dict(episode_index=index, length=length, segments=segments)
        )
        write_json(a.output_dir / "summary.json", result)
        print(f"episode {index}: {len(segments)} candidate intervals", flush=True)


if __name__ == "__main__":
    main()
