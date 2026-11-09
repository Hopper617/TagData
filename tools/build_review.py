#!/usr/bin/env python3
"""Build a portable local review report without modifying a LeRobot v2 dataset."""

from __future__ import annotations

import argparse
import hashlib
from itertools import groupby
import json
from pathlib import Path
import shutil
import warnings

from annotations import (
    check,
    export_review,
    normalize,
    read_json,
    read_jsonl,
    video_path,
    write_json,
)

VIEWS = ("base", "left_wrist", "right_wrist")
TAKEOVER_COLUMNS = ("intervention.valid", "intervention.mode")
TAKEOVER_MODES = {2: "free", 3: "grasp"}


def takeover_intervals(dataset, info, episode):
    """Read takeover ranges on the same frame grid as the review videos."""
    if "data_path" not in info:
        return []
    index = episode["episode_index"]
    relative = info["data_path"].format(
        episode_index=index, episode_chunk=index // info.get("chunks_size", 1000)
    )
    source = (dataset / relative).resolve()
    check(source.is_relative_to(dataset), "Parquet outside source root")
    if not source.is_file():
        return []
    try:
        import pyarrow.parquet as pq
    except ModuleNotFoundError as error:
        if error.name != "pyarrow":
            raise
        if set(TAKEOVER_COLUMNS) <= info.get("features", {}).keys():
            warnings.warn("Install pyarrow to include DAgger takeover signals")
        return []

    with pq.ParquetFile(source) as parquet:
        names = set(parquet.schema_arrow.names)
        if not set(TAKEOVER_COLUMNS) <= names:
            return []
        check(
            parquet.metadata.num_rows == episode["length"],
            f"Episode {index}: intervention/video frame count mismatch",
        )
        columns = list(TAKEOVER_COLUMNS)
        if "frame_index" in names:
            columns.append("frame_index")
        table = parquet.read(columns=columns)
    if "frame_index" in columns:
        check(
            all(i == f for i, f in enumerate(table["frame_index"].to_pylist())),
            f"Episode {index}: Parquet frame indices are not in source order",
        )
    valid, mode = (table[key].to_pylist() for key in TAKEOVER_COLUMNS)
    modes = (TAKEOVER_MODES.get(m) if v is True else None for v, m in zip(valid, mode))
    intervals = []
    start = 0
    for takeover_mode, frames in groupby(modes):
        end = start + sum(1 for _ in frames)
        if takeover_mode is not None:
            intervals.append(dict(start=start, end=end, mode=takeover_mode))
        start = end
    return intervals


def build(
    dataset,
    mapping_path,
    output,
    annotations=None,
    episode_ids=None,
    evidence_root=None,
):
    dataset, output = dataset.resolve(strict=True), output.resolve()
    check(not output.exists(), "Output already exists; choose a new report directory")
    check(
        not output.is_relative_to(dataset) and not dataset.is_relative_to(output),
        "Report and source dataset must use separate directories",
    )
    info = read_json(dataset / "meta/info.json")
    metadata = read_jsonl(dataset / "meta/episodes.jsonl")
    mapping = read_json(mapping_path)
    if annotations:
        payload = read_json(annotations)
        if "training_subtask_definitions" not in payload:
            payload["subtasks"] = mapping["subtasks"]
        payload = normalize(payload)
        check(payload["fps"] == info["fps"], "Annotation/source FPS mismatch")
        check(
            {s["id"]: s["text"] for s in payload["training_subtask_definitions"]}
            == {s["id"]: s["text"] for s in mapping["subtasks"] if s["id"] >= 0},
            "Global task mapping mismatch",
        )
        candidates = {e["episode_index"]: e for e in payload["episodes"]}
    else:
        payload = dict(fps=info["fps"], subtasks=mapping["subtasks"])
        candidates = {
            e["episode_index"]: dict(
                e,
                segments=e.get("sub_tasks") or [dict(id=-1, start=0, end=e["length"])],
            )
            for e in metadata
        }
    originals = {e["episode_index"]: e for e in metadata}
    selected = set(candidates) if episode_ids is None else set(episode_ids)
    check(
        selected and selected <= set(candidates) and selected <= set(originals),
        "Unknown or empty episode selection",
    )
    payload["episodes"] = [candidates[i] for i in sorted(selected)]
    for ep in payload["episodes"]:
        check(
            ep["length"] == originals[ep["episode_index"]]["length"],
            "Annotation/source length mismatch",
        )
    payload["fps"] = info["fps"]
    payload["overall_prompt"] = mapping.get("overall_prompt", "")
    payload["source_dataset"] = dataset.name
    payload["synthetic"] = False
    # Hash the root to isolate browser drafts; do not expose workstation paths.
    payload["project_id"] = (
        "local-"
        + hashlib.sha256(
            json.dumps(
                [
                    str(dataset),
                    info["fps"],
                    [(e["episode_index"], e["length"]) for e in metadata],
                    mapping["subtasks"],
                ],
                sort_keys=True,
            ).encode()
        ).hexdigest()[:24]
    )
    payload = normalize(payload)
    assets = {}
    if annotations:
        evidence_root = (evidence_root or annotations.parent).resolve(strict=True)

        def evidence_asset(path):
            candidate = Path(path)
            candidate = (
                candidate if candidate.is_absolute() else evidence_root / candidate
            ).resolve()
            if (
                not candidate.is_relative_to(evidence_root)
                or not candidate.is_file()
                or candidate.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp")
            ):
                return None
            relative = (
                "evidence/"
                + hashlib.sha256(candidate.read_bytes()).hexdigest()[:20]
                + candidate.suffix.lower()
            )
            assets[relative] = candidate
            return relative

        for ep in payload["episodes"]:
            for s in ep["segments"]:
                thumbnail = (
                    evidence_asset(s.pop("thumbnail")) if s.get("thumbnail") else None
                )
                if thumbnail:
                    s["thumbnail"] = thumbnail
                links = []
                for link in s.get("evidence_links", []):
                    asset = evidence_asset(link["path"])
                    if asset:
                        links.append(
                            dict(label=link.get("label", "Evidence"), path=asset)
                        )
                s["evidence_links"] = links
    applied = {}
    review_path = dataset / "meta/intervention_review.json"
    if review_path.is_file():
        review = read_json(review_path)
        check(
            review["schema_version"] == 1 and review["fps"] == info["fps"],
            "Applied intervention review schema or FPS mismatch",
        )
        applied = {e["episode_index"]: e for e in review["episodes"]}
    links = []
    takeovers = {}
    for ep in payload["episodes"]:
        i = ep["episode_index"]
        intervals = takeover_intervals(dataset, info, ep)
        saved = applied.get(i)
        if saved:
            check(
                saved["length"] == ep["length"]
                and (not intervals or intervals == saved["effective_takeovers"]),
                f"Episode {i}: applied intervention review does not match the dataset",
            )
            # Keep recorded anchors so a review export can still be reapplied.
            intervals = saved["recorded_takeovers"]
            ep.setdefault("takeover_edits", saved["takeover_edits"])
        if intervals:
            takeovers[i] = intervals
        ep["video_paths"] = {}
        for view in VIEWS:
            source = video_path(dataset, info, ep["episode_index"], view).resolve(
                strict=True
            )
            check(
                source.is_relative_to((dataset / "videos").resolve()),
                "Video must be under the dataset video root",
            )
            relative = Path("media") / f"episode_{ep['episode_index']:06d}_{view}.mp4"
            links.append((relative, source))
            ep["video_paths"][view] = relative.as_posix()
    # Outputs contain only their own metadata/static files and links to read-only videos.
    output.mkdir(parents=True)
    frontend = Path(__file__).resolve().parents[1] / "web"
    for name in ("index.html", "style.css", "model.js", "app.js"):
        shutil.copyfile(frontend / name, output / name)
    (output / "media").mkdir()
    for relative, source in links:
        (output / relative).symlink_to(source)
    if assets:
        (output / "evidence").mkdir()
        for relative, source in assets.items():
            shutil.copyfile(source, output / relative)
    project = export_review(payload)
    project.pop("takeovers", None)
    if takeovers:
        project["takeovers"] = takeovers
    write_json(output / "project.json", project)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--subtask-map", type=Path, required=True)
    parser.add_argument(
        "--annotations",
        type=Path,
        help="DINO summary or v3 review JSON; confirmation states are preserved",
    )
    parser.add_argument("--episodes", type=int, nargs="+")
    parser.add_argument(
        "--evidence-root",
        type=Path,
        help="Copy referenced images only from this root (defaults to annotation file directory)",
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    print(
        build(
            args.dataset,
            args.subtask_map,
            args.output_dir,
            args.annotations,
            args.episodes,
            args.evidence_root,
        )
    )
    print(
        "Serve with: python tools/serve.py --directory REPORT --video-root DATASET/videos"
    )


if __name__ == "__main__":
    main()
