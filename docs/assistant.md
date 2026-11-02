# Assistant-assisted visual annotation / 助手协作标注

This is a documented interaction workflow, not an embedded model service. Use an assistant that can inspect your permitted local images/videos. The browser workbench calls no model API and sends no recording to a hosted service.

这是交互流程说明，不是网页内置模型。使用能够查看你允许访问的本地图像／录像的助手。工作台本身不调用模型 API，也不向远程服务上传录像。是否把素材提供给外部助手，由使用者自行决定。

## Prompt 1: independent visual pass / 第一次：独立视觉标注

```text
Inspect this episode using all three camera views and the supplied global
subtask map. Preserve the source recording and original frame indices.

First inspect the whole episode, then inspect uncertain boundaries densely
and watch the intervening video where screenshots are insufficient.
Do not label one interval across two different subtasks. Split it.
Mark waiting, recovery, transitions or unclear-purpose activity as id=-1
unless the task definition clearly covers that behavior. Do not force every
frame into one of the named tasks. Do not invent missing task occurrences.

Produce a separate candidate JSON with complete source coverage, using
integer [start,end) bounds, the original global IDs and exact task texts.
Preserve DINO candidates separately. For every decision provide a short
reason, evidence references, and boundary uncertainty in frames if needed.
Keep reviewed=false. Human confirmation must come from the reviewer.
```

```text
使用三路相机和提供的全局子任务映射，查看这一条 Episode。
保留源录像和原始帧号，先看整条过程，再对疑难边界密集检查；
截图不足时播放中间录像。

一个区间不能跨越两个不同子任务，应当切分。
等待、恢复、过渡或目的不明确的活动标为 id=-1，除非任务定义明确覆盖。
不要强行把全部帧塞进已有任务，也不要补出录像中没有发生的任务。

生成单独候选 JSON，完整覆盖源 Episode，使用整数 [start,end) 区间，
沿用原始全局 ID 和准确的任务文本。DINO 结果另外保留。
记录简短理由、视觉依据和必要的边界不确定帧数。
reviewed 保持 false，人工确认必须来自审核者。
```

## Prompt 2: targeted correction / 第二次：针对局部修改

```text
Recheck episode {episode}, frames [{start}, {end}) across all views.
The current boundary may mix {task_a} and {task_b}. Inspect the interval
before and after it, identify the last frame of the earlier activity and
first frame of the later activity, and isolate any unclear transition.
Return only a proposed correction and its evidence. Keep all frame indices
in the original source coordinate system. Do not confirm on the user's behalf.
```

```text
重新查看 Episode {episode} 的 [{start}, {end})，对照全部视角。
目前可能把 {task_a} 和 {task_b} 混在一起。查看前后片段，确定前一活动
的最后一帧和后一活动的第一帧；如有不明确的过渡，单独列出。
仅返回建议修改和依据，保留源数据的帧号，不替用户勾选人工确认。
```

## Human interaction loop / 人工交互

1. Load the separate assistant candidate report. Select a segment and play it in each camera view.
2. Correct labels and boundaries. Split mixed activity. Unknown activity stays `-1`; keep or exclude it according to your data policy.
3. Delete unwanted intervals with the reversible control. Do not splice the remaining video or renumber source frames.
4. Confirm retained segments after inspection; export the complete review and verify the progress count.
5. Give the assistant the export to validate consistency and prepare a **separate** training package. Missing confirmation is a pending decision, never permission to silently mark a segment checked.

中文：载入助手候选 → 播放三视角 → 修改边界／切分混合活动 → 独立标记未知片段 → 删除不需要的区间 → 逐段确认 → 导出 → 校验并另建训练包。遗漏确认时，应回到用户核对，不能擅自填成已确认。

Example evidence record / 依据记录示例：

```json
{
  "id": 3,
  "start": 300,
  "end": 450,
  "reason": "The broom repeatedly moves debris toward the held dustpan.",
  "evidence": ["boundary sheet: frames 285, 300, 315; compare both wrists"],
  "evidence_links": [{"path": "sheets/episode_000000_page_001.jpg", "label": "Boundary sheet"}],
  "boundary_uncertainty_frames": 8,
  "reviewed": false
}
```

The example is synthetic. An uncertainty estimate should prompt inspection, not automatically expand or trim an interval. DINO confidence and visual evidence describe different things.

示例为合成说明。不确定范围用于提示复查，不用于自动扩展或裁剪区间；DINO 分类概率与视觉依据不能互相替代。
