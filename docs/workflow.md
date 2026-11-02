# From candidates to human-reviewed labels

[中文](workflow.zh.md)

## 1. Keep a global task map

Use `subtask_map.example.json` as a starting point. Keep the original IDs and English task texts when adding partial episodes. The optional `zh` field is display-only. The overall task prompt and each subtask prompt have distinct purposes. Changing the interface language never translates or changes the training prompt.

The reference DINO head expects the original consecutive class IDs, three camera views and the same preprocessing used in its training. The reviewer itself supports a global map with nonconsecutive IDs.

## 2. Generate DINO candidates (optional)

Use your existing, trusted planner bundle:

```text
bundle/
  planner_config.json
  subtask_map.json
  backbone/              # local Hugging Face DINOv2 snapshot
  head/best.pt           # the trained BiGRU state_dict
```

The original configuration uses DINOv2-base, 768 features per camera, a four-frame history, hidden size 256, a bidirectional one-layer GRU and a six-class head. The GRU sees only a four-frame past window; it does not carry hidden state between episodes. At episode start, the first frame is repeated as padding. Images use RGB, black padding on bottom/right, bilinear resize to 224 and ImageNet normalization.

Install `requirements-dino.txt` in an ML environment. Choose matching PyTorch, torchcodec and FFmpeg versions for your platform. This tool was exercised with the existing environment; the dependency file is not a GPU environment lockfile.

```bash
python tools/preannotate_dino.py \
  --dataset /path/to/lerobot-dataset \
  --bundle /path/to/bundle \
  --output-dir reports/dino-candidates \
  --device cuda:0
```

Default centered smoothing averages class probabilities over 15 frames. This uses future frames and is **offline preprocessing**, not an online planner policy. The tool preserves raw and smoothed probabilities and feature arrays, writes pending-review intervals to `summary.json`, and never sets human confirmation. It does not retrain the backbone or head. CPU is the default device; specify a free GPU deliberately.

## 3. Inspect the recording with an assistant

Start with full-episode sheets at a coarse interval, then inspect ambiguous boundaries with denser sampling and video playback:

```bash
python tools/make_sheets.py \
  --dataset /path/to/lerobot-dataset --episodes 0 \
  --step 2 --output-dir reports/sheets-ep0

python tools/make_sheets.py \
  --dataset /path/to/lerobot-dataset --episodes 0 \
  --start 10 --end 15 --step 0.25 \
  --output-dir reports/boundary-ep0
```

This uses FFmpeg and Pillow, selecting exact decoded frame indices. Three views are timestamped side by side. Sheets help locate boundaries but do not prove that unsampled frames belong to the same task. Watch the intervening video where needed. See [assistant prompts](assistant.md).

Preserve machine candidates separately. An assistant may produce a second candidate JSON using the same global mapping and source frame coordinates. Set `annotation_method` to describe its provenance; keep all `reviewed` values false until the human checks them. Use `reason`, `evidence`, `evidence_links` and `boundary_uncertainty_frames` to explain uncertain decisions. Do not copy a DINO confidence score into a claim of visual certainty.

## 4. Review in the web workbench

Build the report using `tools/build_review.py` as shown in the README. The builder accepts either `summary.json` or a complete v3 review export.

Select a row or timeline interval to seek to its start. Play the selected interval and compare all cameras. Adjust the integer frame bounds; a neighboring retained interval must remain at least one frame long. Moving a boundary invalidates the neighboring confirmation. Use a split to isolate mixed activity instead of assigning one task across it.

Unknown activity uses `id=-1` and is excluded from training. A named interval may also be excluded without deletion. Delete removes an interval from retained exports while preserving a tombstone at its original coordinates. A deleted neighbor's shared boundary is locked until restoration. To restore, click the hatched timeline interval or enable “Show deleted”. Restoration clears confirmation.

Save edits and check each retained interval. Checking the editor's confirmation also saves its current edits; the table checkboxes confirm their corresponding rows. Progress counts retained intervals, with deletions counted separately. All-deleted episodes can be exported and restored.

## 5. Back up and resume

Browser storage is specific to this origin, browser and project. It is not a server-side save and may be cleared by the browser. Export the full JSON regularly. Import it in a report for the same dataset to resume. If a local draft exists, the dialog explicitly chooses which source to keep. Import validates FPS, global IDs/texts and source episode IDs/lengths; conflicting project IDs are rejected. Older exports without a project ID use those structural checks, so verify the source dataset yourself.

The complete JSON includes global definitions and is the input to training preparation. The confirmed-episode JSONL is a convenient subset of episode records; keep the full JSON alongside it, because the JSONL alone has no global map or FPS.

## 6. Prepare training inputs

Follow [GR00T integration](gr00t.md). Human review establishes semantic labels, not whether actions were expert demonstrations. DAgger action supervision must additionally use the intervention mask. Planner training can use retained labeled images even when the robot was not under expert control.
