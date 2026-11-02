#!/usr/bin/env python3
"""Package confirmed sparse labels and expert-only sampling masks; never edit source data."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

from annotations import check, normalize, read_json, read_jsonl, write_json
from gr00t_adapter import make_masks


def prepare(review_path, dataset, output, horizon=30, history=4):
    check(not output.exists(), "Output exists; use a new directory")
    dataset = dataset.resolve(strict=True)
    check(
        not output.resolve().is_relative_to(dataset)
        and not dataset.is_relative_to(output.resolve()),
        "Output and source dataset must be separate",
    )
    review_bytes = review_path.read_bytes()
    review = normalize(json.loads(review_bytes))
    info = read_json(dataset / "meta/info.json")
    originals = {
        e["episode_index"]: e for e in read_jsonl(dataset / "meta/episodes.jsonl")
    }
    check(review["fps"] == info["fps"], "Source/review FPS mismatch")
    result, masks, totals = (
        [],
        [],
        dict(
            original_frames=0,
            retained_frames=0,
            expert_retained_frames=0,
            action_sample_starts=0,
            planner_sample_frames=0,
        ),
    )
    for ep in review["episodes"]:
        check(
            ep["episode_index"] in originals
            and ep["length"] == originals[ep["episode_index"]]["length"],
            "Source/review episode mismatch",
        )
        check(
            all(s["deleted"] or s["reviewed"] for s in ep["segments"]),
            "A retained interval still needs human review",
        )
        relative = info["data_path"].format(
            episode_index=ep["episode_index"],
            episode_chunk=ep["episode_index"] // info.get("chunks_size", 1000),
        )
        source = (dataset / relative).resolve(strict=True)
        check(source.is_relative_to(dataset), "Parquet outside source root")
        table = pq.read_table(
            source, columns=["intervention.valid", "intervention.mode"]
        )
        valid = table["intervention.valid"].combine_chunks()
        modes = table["intervention.mode"].combine_chunks()
        check(
            valid.null_count == modes.null_count == 0,
            "Expert columns contain null values",
        )
        expert = valid.to_numpy(zero_copy_only=False).astype(bool) & np.isin(
            modes.to_numpy(zero_copy_only=False), [2, 3]
        )
        arrays, groups, intervals = make_masks(ep, expert, horizon, history)
        masks.append((ep["episode_index"], arrays))
        result.append(
            dict(
                episode_index=ep["episode_index"],
                length=ep["length"],
                tasks=[review.get("overall_prompt", "")],
                sub_tasks=groups,
                training_intervals=intervals,
                annotation_layout="sparse_human_subtasks",
                frame_masks=f"frame_masks/episode_{ep['episode_index']:06d}.npz",
            )
        )
        counts = dict(
            original_frames=ep["length"],
            retained_frames=int(arrays["retained_frame_mask"].sum()),
            expert_retained_frames=int(arrays["expert_retained_frame_mask"].sum()),
            action_sample_starts=int(arrays["action_sample_start_mask"].sum()),
            planner_sample_frames=int(arrays["planner_sample_mask"].sum()),
        )
        for key, value in counts.items():
            totals[key] += value
    output.mkdir(parents=True)
    (output / "frame_masks").mkdir()
    for index, arrays in masks:
        np.savez_compressed(output / f"frame_masks/episode_{index:06d}.npz", **arrays)
    (output / "source_review.json").write_bytes(review_bytes)
    (output / "episodes.normalized.jsonl").write_text(
        "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in result),
        encoding="utf-8",
    )
    write_json(
        output / "subtasks.json",
        dict(
            overall_prompt=review.get("overall_prompt", ""),
            subtasks=review["training_subtask_definitions"],
        ),
    )
    manifest = dict(
        status="confirmed_annotation_package",
        requires_consumer_adapter=True,
        source_dataset_modified=False,
        review_sha256=hashlib.sha256(review_bytes).hexdigest(),
        action_horizon=horizon,
        planner_history=history,
        expert_rule="intervention.valid AND intervention.mode in {2,3}",
        totals=totals,
    )
    write_json(output / "manifest.json", manifest)
    return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--review", type=Path, required=True)
    p.add_argument("--dataset", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--horizon", type=int, default=30)
    p.add_argument("--history", type=int, default=4)
    a = p.parse_args()
    print(prepare(a.review, a.dataset, a.output_dir, a.horizon, a.history))
