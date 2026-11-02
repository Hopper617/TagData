# The original 12-episode review / 最初 12 条数据的案例

The workflow began with DINO candidates for a long tabletop-cleaning task, followed by a separate assistant visual pass and interactive human review. The human requested explicit unknown intervals and then a way to delete unnecessary intervals. Those interactions shaped this workbench's unknown, exclusion, deletion and restoration controls.

最初先用 DINO 给长程清理桌面任务生成候选，再独立查看录像、生成助手候选，最后通过网页逐段人工审核。用户提出要单独标记没有明确目的的活动，并增加删除不需要片段的选项，由此形成现在的未知、排除、删除和恢复交互。

The complete global mapping stayed fixed:

| ID | Training text | 中文含义 |
|---|---|---|
| 0 | Put the can into the trash bin | 把易拉罐放进垃圾桶 |
| 1 | pick up the broom with the right hand | 右手拿起扫把 |
| 2 | pick up the dustpan with the left hand | 左手拿起簸箕 |
| 3 | sweep the debris into the dustpan | 把碎屑扫进簸箕 |
| 4 | empty the dustpan into the trash bin | 把簸箕里的碎屑倒进垃圾桶 |
| 5 | put down all tools | 放下所有工具 |

Verified aggregate results / 核对后的汇总：

| Item / 项目 | Count / 数量 |
|---|---:|
| Episodes / 条数 | 12 |
| FPS | 30 |
| Original frames / 原始帧数 | 29,270 |
| Human-confirmed retained intervals / 人工确认的保留片段 | 105 |
| Deleted intervals / 删除片段 | 14 |
| Deleted frames / 删除帧 | 1,762 |
| Retained labeled frames / 保留标签帧 | 27,508 |
| Normalized touching same-class groups / 合并接触同类片段后 | 71 |
| Retained expert action frames / 保留专家动作帧 | 12,768 |
| Valid 30-step action starts / 30 步动作窗口起点 | 11,018 |
| Valid 4-frame planner samples / 4 帧规划器样本 | 27,472 |

An episode missing task 0 after review continued to use IDs 1–5 and the full six-class map. Normalization merged touching same-class fragments; it did not fill deleted gaps. Human confirmation of the final outstanding interval was recorded explicitly rather than inferred from a training script.

有一条 Episode 审核后没有任务 0，仍然保留原来的 1–5 和完整六类映射。归一只合并接触的同类片段，不填补删除空隙。最后遗漏的确认由用户明确补充，不由训练脚本推测。

The portable preparation tool reproduces the original retained-frame, expert-frame, action-start and planner-sample counts. This validates data handling, not downstream task success. No claim of improved real-robot success is made here. DINO's earlier classifier validation accuracy is not the accuracy of these DAgger annotations.

新整理脚本复现了原流程的保留帧、专家帧、动作窗口和规划器样本数量。这验证的是数据处理一致性，并不能证明机器人成功率提高；原分类器的验证准确率也不能当作这些 DAgger 标注的准确率。

Only aggregate counts and the procedure are published. The original recordings, individual annotations, robot trajectories, caches and trained weights remain outside this repository.

仓库仅包含汇总数字和流程说明，真实录像、逐条审核标注、机器人轨迹、特征缓存和训练权重留在仓库外。
