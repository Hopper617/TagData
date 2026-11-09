# Agent 初标与人工复核

Agent 负责查看机器人示教、拟定子任务区间并生成候选。标注员使用现有网页逐段检查，修正边界与标签，确认后导出完整审核 JSON。

## 1. 确定输入和全局分类

| 输入 | 要求 |
|---|---|
| LeRobot v2 数据集 | `meta/info.json` 提供 `fps` 和视频路径模板，`meta/episodes.jsonl` 提供 `episode_index` 与 `length` |
| 同步视频 | 每条 Episode 有 `base`、`left_wrist`、`right_wrist` 三路 MP4，按原始帧同步，视频位于数据集的 `videos/` 内 |
| 全局子任务映射 | 使用 `overall_prompt` 和 `subtasks`，每类包含唯一非负整数 `id`、固定的英文 `text` 和可选中文展示文本 `zh` |
| 范围 | 明确要处理的源 Episode ID。某条缺少某类、重复某类或顺序变化时，沿用全局映射 |

新任务先看代表性录像，提出分类表。每类写明可见动作、起始条件、结束条件和容易混淆的情形。任务负责人确认后再批量标注；例如，插花项目应使用自己的映射。以下是 [CleanTable 示例映射](subtask_map.example.json) 的边界参考。

| ID | 固定英文文本 | 可见边界参考 |
|---|---|---|
| 0 | Put the can into the trash bin | 开始有明确的拿罐投放动作，至释放罐子完成投放 |
| 1 | pick up the broom with the right hand | 右手开始拿取扫把，至扫把被稳定抓住并抬离支撑面 |
| 2 | pick up the dustpan with the left hand | 左手开始拿取簸箕，至簸箕被稳定抓住并抬离支撑面 |
| 3 | sweep the debris into the dustpan | 开始用扫把把碎屑推向簸箕，至最后一次清扫结束 |
| 4 | empty the dustpan into the trash bin | 开始朝垃圾桶执行倾倒动作，至倒屑动作结束 |
| 5 | put down all tools | 开始放回工具，至工具得到支撑、双手松开 |
| -1 | 系统保留的未知标签 | 等待、过渡、失败后恢复、视角遮挡或无法可靠判断目的。保留时间区间并交给人工检查 |

## 2. 查看录像并输出候选

先看整条 Episode，再对照双腕和头部画面定位抓取、释放、接触及方向变化。可先用 `tools/make_sheets.py` 生成概览，在不确定处加密抽帧或播放原视频。DINO 候选可选，单独保存。标注以录像中可见的动作和已确认的类别定义为依据。

候选使用 [Review JSON v3](format.md)。写入 `schema_version: 3`、源 `fps`、`overall_prompt`、完整的 `training_subtask_definitions` 和 `episodes`。每条 Episode 带 `episode_index`、`length`、`segments` 和空的 `deleted_intervals`。每个片段包含 `id`、`start`、`end` 和 `reviewed: false`，可附 `reason`、`evidence`、`evidence_links`、`boundary_uncertainty_frames`。文本字段可由构建器按 ID 补齐。视频路径由构建器根据源数据生成。

帧号从零开始，`[start,end)` 包含起点、不包含终点。按起点排序后，第一段从 0 开始，每段的起点等于上一段的终点，最后一段的终点等于 `length`。区间必须非空，标签必须来自全局映射或为 `-1`。证据建议记为“相机名 + 源帧号 + 看到的动作”，不确定边界写明需要复看的范围。未知帧保持 `-1`，由工具自动排除出训练监督。

## 3. 构建并交给人工复核

从仓库根目录运行。把下面的路径换成实际数据集、全局映射和 Agent 候选文件。

```bash
python3 tools/build_review.py \
  --dataset /path/to/lerobot-dataset \
  --subtask-map /path/to/subtask_map.json \
  --annotations reports/agent-candidates.json \
  --output-dir reports/agent-review

python3 tools/serve.py \
  --directory reports/agent-review \
  --video-root /path/to/lerobot-dataset/videos \
  --port 8765
```

构建器检查映射、帧率、Episode ID、长度、区间覆盖及视频路径，生成可直接打开的复核项目。Agent 交付候选 JSON、复核目录、本机地址 `http://127.0.0.1:8765/` 和需要重点检查的区间。截图不在候选文件目录下时，构建时用 `--evidence-root` 指定其根目录。

构建 DAgger 复核页时，在安装了 `pyarrow` 的环境中运行构建器。它从 Parquet 读取有效的 FREE 和 GRASP 接管帧。有接管区间的 Episode 会在子任务时间轴下显示接管轨道，点击色块可跳到起始帧。轨道随视频播放显示当前帧的接管状态，供对照回看。

点击色块后，可填写起始帧和结束帧，也可直接取当前播放帧。取当前帧作为末帧时，界面会将下一帧填入结束帧。保存的调整随浏览器草稿和完整审核 JSON 保存，可按区间恢复录制时间。训练打包工具从原始 Parquet 读取专家帧。

标注员在网页切换视角并播放片段，可调整标签和边界、切分、排除、删除或恢复。逐段确认后导出完整 JSON。复审时可导入该文件继续。训练整理使用这份人工导出的完整 JSON，步骤见 [训练接入示例](gr00t.zh.md)。

需要补上一段子任务时，先选中它前面的片段，在编辑区点击“在后方加入子任务”，选择已有任务类别并填写预留区间的起止帧。新范围必须位于紧随其后的保留片段内；界面会保留该片段前后剩余的标注，不移动其他任务。可以先切分并将预留区间标为“目的不明确／等待／过渡”，其完整范围会自动填入；下一片段已有标签时，需要手动填写结束帧。新增片段保持待审核，并随浏览器草稿及完整 JSON 保存。
