"""Validated v3 review I/O; no robot/ML dependencies."""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path

UNKNOWN = "Unclear purpose / waiting / transition"


def check(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value):
    return type(value) is int


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_jsonl(path):
    return [
        json.loads(line)
        for line in Path(path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def write_json(path, value):
    Path(path).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def normalize(value):
    data = copy.deepcopy(value)
    check(
        type(data.get("fps")) in (float, int)
        and math.isfinite(data["fps"])
        and data["fps"] > 0,
        "Invalid fps",
    )
    check(data.get("schema_version") in (None, 2, 3), "Unsupported schema version")
    definitions = data.get(
        "training_subtask_definitions",
        [s for s in data.get("subtasks", []) if s["id"] >= 0],
    )
    check(
        isinstance(definitions, list) and definitions, "Missing global task definitions"
    )
    texts = {}
    for item in definitions:
        check(
            integer(item["id"])
            and item["id"] >= 0
            and item["id"] not in texts
            and isinstance(item.get("text"), str)
            and item["text"].strip(),
            "Invalid global task definition",
        )
        texts[item["id"]] = item["text"]
    data["training_subtask_definitions"] = definitions
    data["annotation_labels"] = copy.deepcopy(definitions) + [dict(id=-1, text=UNKNOWN)]
    check(isinstance(data.get("episodes"), list) and data["episodes"], "No episodes")
    seen = set()
    for ep in data["episodes"]:
        check(
            integer(ep.get("episode_index"))
            and ep["episode_index"] >= 0
            and ep["episode_index"] not in seen,
            "Invalid/duplicate episode ID",
        )
        seen.add(ep["episode_index"])
        check(integer(ep.get("length")) and ep["length"] > 0, "Invalid episode length")
        check(isinstance(ep.get("segments"), list), "Missing segments")
        check(
            isinstance(ep.get("deleted_intervals", []), list),
            "Invalid deletion records",
        )
        deleted = [
            dict(s, deleted=True, excluded=True)
            for s in ep.pop("deleted_intervals", [])
        ]
        ep["segments"] = sorted(ep["segments"] + deleted, key=lambda s: s["start"])
        cursor = 0
        for s in ep["segments"]:
            check(
                integer(s.get("start"))
                and integer(s.get("end"))
                and s["start"] == cursor < s["end"] <= ep["length"],
                "Intervals must cover the episode without gaps/overlaps",
            )
            check(
                integer(s.get("id")) and (s["id"] == -1 or s["id"] in texts),
                "Unknown task ID",
            )
            text = texts.get(s["id"], UNKNOWN)
            check(
                s["id"] == -1 or s.get("text", text) == text,
                "Task text differs from global mapping",
            )
            s["text"] = text
            s["deleted"] = s.get("deleted") is True
            s["excluded"] = s["deleted"] or s["id"] == -1 or s.get("excluded") is True
            s["reviewed"] = s.get("reviewed") is True
            cursor = s["end"]
        check(cursor == ep["length"], "Intervals do not cover the episode")
    data["schema_version"] = 3
    return data


def export_review(data):
    output = copy.deepcopy(data)
    output["schema_version"] = 3
    output["not_training_ready"] = True
    for ep in output["episodes"]:
        all_segments = ep["segments"]
        ep["segments"] = [s for s in all_segments if not s["deleted"]]
        ep["deleted_intervals"] = [s for s in all_segments if s["deleted"]]
        ep["retained_frames"] = sum(s["end"] - s["start"] for s in ep["segments"])
    return output


def video_path(dataset, info, episode, view):
    template = info.get(
        "video_path",
        "videos/chunk-{episode_chunk:03d}/{video_key}/episode_{episode_index:06d}.mp4",
    )
    return Path(dataset) / template.format(
        episode_index=episode,
        episode_chunk=episode // info.get("chunks_size", 1000),
        video_key=f"observation.images.{view}",
    )
