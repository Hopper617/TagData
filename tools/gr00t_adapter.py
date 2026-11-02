"""Reference sparse-subtask masks. Call per episode before GR00T sampling."""

import numpy as np


def runs(mask):
    mask = np.asarray(mask, dtype=bool)
    return [
        (int(a), int(b))
        for a, b in zip(
            np.flatnonzero(mask & ~np.r_[False, mask[:-1]]),
            np.flatnonzero(mask & ~np.r_[mask[1:], False]) + 1,
        )
    ]


def retained_groups(episode):
    groups = []
    for s in sorted(episode["segments"], key=lambda s: s["start"]):
        if s.get("deleted") or s.get("excluded") or s["id"] < 0:
            continue
        if groups and groups[-1]["id"] == s["id"] and groups[-1]["end"] == s["start"]:
            groups[-1]["end"] = s["end"]
        else:
            groups.append({k: s[k] for k in ("id", "start", "end", "text")})
    return groups


def make_masks(episode, expert, horizon=30, history=4):
    if (
        type(horizon) is not int
        or type(history) is not int
        or horizon < 1
        or history < 1
    ):
        raise ValueError("Horizon and history must be positive integers")
    length = episode["length"]
    expert = np.asarray(expert, dtype=bool)
    if expert.shape != (length,):
        raise ValueError("Expert mask length differs from source episode")
    labels = np.full(length, -100, dtype=np.int64)
    groups = retained_groups(episode)
    for s in groups:
        if not 0 <= s["start"] < s["end"] <= length or np.any(
            labels[s["start"] : s["end"]] != -100
        ):
            raise ValueError("Invalid/overlapping retained intervals")
        labels[s["start"] : s["end"]] = s["id"]
    retained = labels >= 0
    expert_retained = retained & expert
    starts = np.zeros(length, dtype=bool)
    training_intervals = []
    for s in groups:
        for a, b in runs(expert_retained[s["start"] : s["end"]]):
            a, b = a + s["start"], b + s["start"]
            training_intervals.append(dict(id=s["id"], start=a, end=b))
            if b - a >= horizon:
                starts[a : b - horizon + 1] = True
    cumulative = np.r_[0, np.cumsum(~retained)]
    frame = np.arange(length)
    planner = retained & (
        (cumulative[frame + 1] - cumulative[np.maximum(0, frame - history + 1)]) == 0
    )
    return (
        dict(
            subtask_id=labels,
            retained_frame_mask=retained,
            expert_retained_frame_mask=expert_retained,
            action_sample_start_mask=starts,
            planner_sample_mask=planner,
        ),
        groups,
        training_intervals,
    )
