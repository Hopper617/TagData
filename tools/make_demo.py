#!/usr/bin/env python3
"""Rebuild the checked-in synthetic, watermark-labelled H.264 demo."""

import math
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont

from annotations import normalize, export_review, write_json

ROOT = Path(__file__).resolve().parents[1]
TASKS = [
    ("Put the can into the trash bin", "把易拉罐放进垃圾桶"),
    ("pick up the broom with the right hand", "右手拿起扫把"),
    ("pick up the dustpan with the left hand", "左手拿起簸箕"),
    ("sweep the debris into the dustpan", "把碎屑扫进簸箕"),
    ("empty the dustpan into the trash bin", "把簸箕里的碎屑倒进垃圾桶"),
    ("put down all tools", "放下所有工具"),
]
INTERVALS = [
    (0, 0, 90),
    (-1, 90, 105),
    (1, 105, 195),
    (2, 195, 285),
    (3, 285, 465),
    (4, 465, 555),
    (-1, 555, 600),
    (5, 600, 720),
]


def draw_frame(index, frame, view, font):
    image = Image.new("RGB", (640, 360), "#111b17")
    d = ImageDraw.Draw(image)
    task, start, end = next(s for s in INTERVALS if s[1] <= frame < s[2])
    phase = (frame - start) / (end - start)
    d.text((18, 13), "SYNTHETIC DEMO / NOT ROBOT DATA", font=font, fill="#c6ed9b")
    d.text(
        (18, 37),
        f"EP {index:03d} | {view} | {frame / 30:05.2f}s | frame {frame:03d}",
        fill="#a6b3a8",
    )
    d.rounded_rectangle(
        (30, 70, 610, 310), 16, fill="#28362c", outline="#506248", width=2
    )
    # Illustrative tabletop and tools, with different camera crops/orientations.
    shift = {"base": 0, "left_wrist": -48, "right_wrist": 48}[view]
    binx = 520 + shift // 3
    d.rounded_rectangle(
        (binx - 35, 120, binx + 35, 210), 7, fill="#4e6954", outline="#92b49b", width=3
    )
    d.ellipse(
        (binx - 35, 110, binx + 35, 132), fill="#101e14", outline="#92b49b", width=3
    )
    canx = 150 + shift
    cany = 150
    if task == 0:
        canx = int(canx + (binx - canx) * phase)
        cany = int(150 - 65 * math.sin(phase * math.pi))
    if task in (-1, 1, 2, 3, 4, 5):
        canx = binx
        cany = 180
    d.rounded_rectangle((canx - 11, cany - 18, canx + 11, cany + 18), 4, fill="#e8ac84")
    bx = 350 + shift + int(65 * math.sin(frame / 14)) * (task == 3)
    by = 220 - int(80 * phase) * (task == 1)
    if task == 5:
        by = 140 + int(80 * phase)
    d.line((bx, 90, bx - 25, by), fill="#e5c997", width=8)
    d.polygon(
        [(bx - 50, by), (bx, by - 5), (bx + 12, by + 25), (bx - 48, by + 30)],
        fill="#cfac70",
    )
    px = 275 + shift
    py = 245 - int(65 * phase) * (task in (2, 4))
    d.polygon(
        [(px - 35, py), (px + 35, py), (px + 45, py + 30), (px - 45, py + 30)],
        fill="#9dbddd",
    )
    d.line((px, py, px - 25, py - 65), fill="#9dbddd", width=6)
    for i in range(9):
        x = 170 + i * 20 + shift
        y = 245 + (i % 3) * 10
        if task == 3:
            x = int(x + (px - x) * phase)
            y = int(y + (py + 15 - y) * phase)
        if task in (4, 5):
            x = binx + (i % 3) * 3
            y = 180 + (i // 3) * 3
        d.ellipse((x, y, x + 4, y + 4), fill="#d9da9f")
    for hand, origin in [("left", (80, 295)), ("right", (560, 295))]:
        target = (px, py - 50) if hand == "left" else (bx, 170)
        d.line(
            [origin, ((origin[0] + target[0]) // 2, 265), target],
            fill="#7fa89b" if hand == "left" else "#9fae93",
            width=12,
        )
        d.ellipse(
            (target[0] - 9, target[1] - 9, target[0] + 9, target[1] + 9), fill="#c6ed9b"
        )
    name = "Unclear / waiting / transition" if task < 0 else TASKS[task][0]
    d.text((18, 330), f"{task}  {name}", fill="#e9eee7")
    return image


def main():
    media = ROOT / "web/media"
    media.mkdir(exist_ok=True)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    episodes = []
    for index in range(2):
        paths = {}
        for view in ("base", "left_wrist", "right_wrist"):
            relative = f"media/episode_{index:06d}_{view}.mp4"
            command = [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-f",
                "rawvideo",
                "-pixel_format",
                "rgb24",
                "-video_size",
                "640x360",
                "-framerate",
                "30",
                "-i",
                "pipe:0",
                "-an",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                "-preset",
                "fast",
                "-crf",
                "26",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(ROOT / "web" / relative),
            ]
            process = subprocess.Popen(command, stdin=subprocess.PIPE)
            try:
                for frame in range(720):
                    process.stdin.write(draw_frame(index, frame, view, font).tobytes())
            finally:
                process.stdin.close()
            if process.wait():
                raise RuntimeError("FFmpeg failed")
            paths[view] = relative
        segments = [
            dict(
                id=task,
                start=start,
                end=end,
                reviewed=index == 1 and task >= 0,
                reason="Synthetic candidate. Inspect both boundaries; these are not measured robot actions.",
                boundary_uncertainty_frames=8,
            )
            for task, start, end in INTERVALS
        ]
        if index == 1:
            segments[1].update(deleted=True, excluded=True, excluded_before_delete=True)
        episodes.append(
            dict(episode_index=index, length=720, video_paths=paths, segments=segments)
        )
    project = normalize(
        dict(
            schema_version=3,
            project_id="synthetic-clean-table-v1",
            synthetic=True,
            fps=30,
            source_dataset="synthetic-demo",
            overall_prompt="Clean the tabletop: dispose of the can, pick up tools, sweep, empty the dustpan, then put the tools down.",
            subtasks=[
                dict(id=i, text=text, zh=zh) for i, (text, zh) in enumerate(TASKS)
            ],
            episodes=episodes,
        )
    )
    write_json(ROOT / "web/project.json", export_review(project))
    write_json(
        ROOT / "docs/subtask_map.example.json",
        dict(
            overall_prompt=project["overall_prompt"],
            fps=30,
            subtasks=project["training_subtask_definitions"],
        ),
    )
    print("Built 2 synthetic episodes, 3 views each, 24s @ 30 FPS")


if __name__ == "__main__":
    main()
