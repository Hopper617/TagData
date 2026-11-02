# GR00T integration: sparse labels and expert action windows

[中文](gr00t.zh.md)

## Package confirmed annotations

After installing `requirements.txt`, use the full review JSON:

```bash
python tools/prepare_training.py \
  --review /path/to/subtask-review.json \
  --dataset /path/to/lerobot-dataset \
  --output-dir reports/training-package \
  --horizon 30 --history 4
```

The reference DAgger preparer requires `intervention.valid` and `intervention.mode` Parquet columns. A missing column is an error; there is no fallback treating every action as expert. For ordinary demonstrations without intervention metadata, an explicit different expert-data policy is needed before using the adapter.

The command rejects unconfirmed retained intervals and inconsistent FPS, IDs, text or frame bounds. It keeps the source review bytes and their SHA-256, writes normalized episode metadata, the complete map, per-frame masks and aggregate counts. Source Parquet and MP4 files remain untouched. The output is an input package, **not a complete LeRobot dataset**.

State/action representation conversion (for example, joint space to end-effector space) remains part of your existing GR00T preparation pipeline. The converted data must preserve the source frame count and alignment. Skip episodes with no valid action starts when building a policy sampler.

## Consumer responsibilities

`tools/gr00t_adapter.py` is independent reference code. The original workflow used a custom Isaac-GR00T fork based on `d2b7e75b937e3ec9aa5dbc798f08b89692c49734`. That fork already had subtask-aware prompts and a custom sampler. This repository does not patch a fresh upstream checkout automatically.

Integrate the package at these points:

1. **Episode loader:** fill a label array with `-100`, then assign only exact retained `[start,end)` bounds. Never extend one task to the next task's start across a deleted/unknown gap. Use the full map to resolve the current task prompt. Keep the overall prompt separately. For sparse reviewed labels, apply no legacy 15-frame prompt advance.
2. **Action sampler:** load `action_sample_start_mask` and sample only true starts. For a start `t`, retrieve source frames `t:t+30` from the original data. Never pad, clamp, wrap or truncate an invalid tail into a valid window. Do not concatenate time across deletion gaps.
3. **Planner dataset (optional):** use `subtask_id` and `planner_sample_mask`. Retained non-expert images may supervise task classification. Its four-frame context cannot include deleted, unknown or excluded frames. Episode-start padding repeats the first source frame; it does not jump across a gap.
4. **Normalization:** decide separately which source data contributes to normalization statistics. These masks constrain action supervision and do not automatically recompute GR00T statistics.

At inference, the existing planner can predict the original global ID and select its matching subtask prompt. Training this action package does not retrain that planner. Train and validate the planner separately when desired.

## What the masks mean

| Array | Meaning |
|---|---|
| `subtask_id` | Original global ID for retained named tasks; `-100` otherwise |
| `retained_frame_mask` | Named, nondeleted, nonexcluded label |
| `expert_retained_frame_mask` | Retained label AND valid intervention AND mode in `{2,3}` |
| `action_sample_start_mask` | Every target frame in the full horizon is expert and in the same retained task |
| `planner_sample_mask` | Retained label with a valid retained-image history |

Adjacent, touching intervals of the same class can merge. A deleted/excluded gap cannot be bridged even if both sides have the same ID. Different task IDs cannot share an action window. Exactly 30 valid frames yield one start; 29 yield none.

For example: task 3 `[100,150)`, deletion `[150,160)`, task 3 `[160,220)`. The two task-3 intervals stay separate. With all retained frames expert and horizon 30, starts are `[100,121)` and `[160,191)`. No target window crosses the deleted frames.

Policy learning samples windows, not entire episodes in order. A new partial episode can teach a weak subtask as long as its source observations, actions, prompt and valid windows are consistent. It does not need to invent the missing earlier or later subtasks.
