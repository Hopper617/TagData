#!/usr/bin/env python3
"""Timestamped three-view contact sheets for assistant/human visual inspection."""

import argparse
import io
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw

from annotations import check, read_json, read_jsonl, video_path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dataset", type=Path, required=True)
    p.add_argument("--episodes", type=int, nargs="+", required=True)
    p.add_argument("--start", type=float, default=0)
    p.add_argument("--end", type=float)
    p.add_argument("--step", type=float, default=2)
    p.add_argument("--output-dir", type=Path, required=True)
    a = p.parse_args()
    check(
        a.start >= 0
        and math.isfinite(a.start)
        and math.isfinite(a.step)
        and a.step > 0,
        "Invalid sampling range",
    )
    info = read_json(a.dataset / "meta/info.json")
    episodes = {
        e["episode_index"]: e for e in read_jsonl(a.dataset / "meta/episodes.jsonl")
    }
    check(not a.output_dir.exists(), "Use a new output directory")
    dataset = a.dataset.resolve(strict=True)
    check(
        not a.output_dir.resolve().is_relative_to(dataset)
        and not dataset.is_relative_to(a.output_dir.resolve()),
        "Output must be separate from source",
    )
    a.output_dir.mkdir(parents=True)
    for index in a.episodes:
        ep = episodes[index]
        stop = min(
            a.end if a.end is not None else ep["length"] / info["fps"],
            ep["length"] / info["fps"],
        )
        check(math.isfinite(stop) and stop > a.start, "Empty sampling range")
        frames = sorted(
            {
                min(ep["length"] - 1, round((a.start + i * a.step) * info["fps"]))
                for i in range(math.ceil((stop - a.start) / a.step))
            }
        )
        for page, offset in enumerate(range(0, len(frames), 12)):
            selected = frames[offset : offset + 12]
            sheet = Image.new("RGB", (960, len(selected) * 198), "#141a16")
            draw = ImageDraw.Draw(sheet)
            for row, frame in enumerate(selected):
                for col, view in enumerate(("base", "left_wrist", "right_wrist")):
                    # Select exact decoded frame indices (no keyframe-seek approximation).
                    result = subprocess.run(
                        [
                            "ffmpeg",
                            "-v",
                            "error",
                            "-i",
                            str(video_path(a.dataset, info, index, view)),
                            "-vf",
                            f"select=eq(n\\,{frame}),scale=312:174:force_original_aspect_ratio=decrease",
                            "-frames:v",
                            "1",
                            "-f",
                            "image2pipe",
                            "-vcodec",
                            "png",
                            "-threads",
                            "1",
                            "pipe:1",
                        ],
                        check=True,
                        stdout=subprocess.PIPE,
                    )
                    image = Image.open(io.BytesIO(result.stdout)).convert("RGB")
                    x, y = col * 320, row * 198
                    sheet.paste(image, (x + (320 - image.width) // 2, y + 22))
                    draw.text(
                        (x + 5, y + 4),
                        f"{view} | frame {frame} | {frame / info['fps']:.2f}s",
                        fill="#e5eddf",
                    )
            sheet.save(
                a.output_dir / f"episode_{index:06d}_page_{page:03d}.jpg", quality=90
            )


if __name__ == "__main__":
    main()
