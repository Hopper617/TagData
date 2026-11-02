# Review JSON v3 / 审核 JSON v3

Frames are zero-based integers; every interval is **[start, end)**. Times shown by the UI are frame / FPS.

帧号从 0 开始，使用整数；所有区间为 **[start, end)**，包含起点、不包含终点。网页秒数等于帧号除以 FPS。

```json
{
  "schema_version": 3,
  "project_id": "example-dataset-v1",
  "fps": 30,
  "overall_prompt": "Complete the tabletop task",
  "training_subtask_definitions": [
    {"id": 0, "text": "Put the can into the trash bin"},
    {"id": 5, "text": "put down all tools"}
  ],
  "annotation_labels": [
    {"id": 0, "text": "Put the can into the trash bin"},
    {"id": 5, "text": "put down all tools"},
    {"id": -1, "text": "Unclear purpose / waiting / transition"}
  ],
  "not_training_ready": true,
  "episodes": [{
    "episode_index": 0,
    "length": 120,
    "video_paths": {
      "base": "media/episode_000000_base.mp4",
      "left_wrist": "media/episode_000000_left_wrist.mp4",
      "right_wrist": "media/episode_000000_right_wrist.mp4"
    },
    "segments": [
      {"id": 0, "start": 0, "end": 50, "reviewed": true},
      {"id": 5, "start": 60, "end": 120, "reviewed": false}
    ],
    "deleted_intervals": [
      {"id": -1, "start": 50, "end": 60, "deleted": true, "excluded": true, "reviewed": true, "excluded_before_delete": true}
    ]
  }]
}
```

- The global map contains **every class in the project**. This tiny example has two global classes; a six-class project must retain all six even when an episode contains only task 5. Task text is canonical and validated. Optional `zh` is a UI label.
- `segments` contains retained intervals, including explicitly unknown/excluded ones. `deleted_intervals` contains reversible deletion records. Their sorted union must cover exactly `[0, length)` without overlaps, gaps, or zero-length intervals.
- A `deleted` record is always excluded. `excluded_before_delete` preserves the prior setting for restoration. Restoring clears `reviewed`; `-1` remains excluded regardless of that prior setting.
- Optional segment fields include `review_note`, `reason`, `evidence` (text references), `evidence_links` (`{path,label}`), `thumbnail`, `boundary_uncertainty_frames`, and machine probabilities/statistics. Unknown fields are preserved. Uncertainty is a visual-review estimate, not a measured classifier confidence.
- Internally, the editor interleaves retained and deleted intervals to preserve full source coverage; exports separate the two arrays again. No source videos, timestamps or frame numbers are rewritten.
- The workbench accepts the original candidate format using `subtasks` for the global map. It preserves previous v3 review state. Unsupported schemas or inconsistent bounds are rejected.
- Fully confirmed means every retained interval is checked; deletions are already explicit decisions. Confirmation does **not** override `excluded` or make `-1` a training class.
- Same-project imports keep video paths from the loaded project. The import dialog chooses between an existing local draft and the incoming review; it never silently merges competing revisions.

中文说明：全局映射包含项目全部类别，不能按某条 Episode 的任务子集重建。`segments` 和 `deleted_intervals` 的并集必须完整覆盖原始 Episode；未知、排除、删除有不同含义，但都不进入动作监督。导入保留审核和删除状态，视频地址使用当前项目的地址。已确认不等于可直接训练，训练端仍需处理专家动作掩码和完整动作窗口。

The JSONL button exports only episode objects, one per line. Use the full JSON as input to `prepare_training.py` so FPS and the full task map remain available.

JSONL 按钮只输出逐条 Episode 记录。整理训练包请使用完整 JSON，保留 FPS 和完整全局映射。
