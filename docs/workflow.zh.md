# 从候选标注到人工审核

[English](workflow.md)

## 1. 保留全局任务映射

参考 `subtask_map.example.json`，补充部分 Episode 时，沿用原来的 ID 和英文任务文本。可选 `zh` 字段只用于网页展示。总任务描述和子任务 prompt 用途不同，切换网页语言不会修改训练 prompt。

参考 DINO 脚本要求完整、连续的分类编号、三视角及原模型训练时的预处理；网页本身也支持全局编号不连续的映射。

## 2. DINO 预标注（可选）

使用已有、可信的规划器模型包：

```text
bundle/
  planner_config.json
  subtask_map.json
  backbone/              # 本地 Hugging Face DINOv2 模型
  head/best.pt           # 训练好的 BiGRU state_dict
```

原配置采用 DINOv2-base，每路图像 768 维，4 帧历史窗口，隐藏层 256 的单层双向 GRU，输出六类任务。双向 GRU 只处理当前及过去 4 帧，不在 Episode 之间传递隐藏状态；起始不足 4 帧时重复第一帧。图像使用 RGB，右侧／下侧补黑到正方形，双线性缩放到 224，再做 ImageNet 归一化。

在 ML 环境中安装 `requirements-dino.txt`，按自己的平台匹配 PyTorch、torchcodec 和 FFmpeg 版本。依赖文件不是完整的 GPU 环境锁定文件。

```bash
python tools/preannotate_dino.py \
  --dataset /path/to/lerobot-dataset \
  --bundle /path/to/bundle \
  --output-dir reports/dino-candidates \
  --device cuda:0
```

默认对分类概率做 15 帧居中平滑。这会使用未来帧，是**离线预处理**，不代表在线规划器的行为。脚本保留原始概率、平滑概率及特征，并在 `summary.json` 中输出待审核区间，不设置人工确认，也不重新训练模型。默认使用 CPU，使用 GPU 时请明确指定空闲设备。

## 3. 助手查看录像

先查看覆盖整条 Episode 的粗采样截图，再对有疑问的边界做密集检查，必要时播放中间录像：

```bash
python tools/make_sheets.py \
  --dataset /path/to/lerobot-dataset --episodes 0 \
  --step 2 --output-dir reports/sheets-ep0

python tools/make_sheets.py \
  --dataset /path/to/lerobot-dataset --episodes 0 \
  --start 10 --end 15 --step 0.25 \
  --output-dir reports/boundary-ep0
```

脚本使用 FFmpeg 精确选择解码帧，通过 Pillow 将三视角并排并标注时间、帧号。截图有助于定位边界，但不能证明未采样部分也属于同一任务。提示词模板见[助手协作](assistant.md)。

DINO 输出单独保留。助手生成另一份候选 JSON，继续沿用全局映射及原始帧号，使用 `annotation_method` 说明来源。在人工检查前，所有 `reviewed` 保持 false。通过 `reason`、`evidence`、`evidence_links` 和 `boundary_uncertainty_frames` 记录依据与不确定性。模型分类置信度不等于视觉判断的确定程度。

## 4. 网页人工审核

按 README 使用 `tools/build_review.py`，可传入 DINO `summary.json` 或完整 v3 审核结果。

点击片段行或时间轴可跳到起点。播放片段、查看各路相机，再调整整数帧边界。调整后，相邻保留片段至少剩一帧，其确认状态会被取消。混合活动应切分，避免一个标签跨越多个子任务。

目的不明确、等待、过渡标为 `id=-1`，排除训练。明确的子任务也可以单独勾选排除。删除后，从保留片段中移除，但在原位置保留删除记录，不扩展相邻任务。与删除区间相邻的边界被锁定，恢复后才能移动。点击斜线时间轴或勾选“显示已删除片段”可恢复；恢复后需要重新确认。

保存修改并逐段确认。编辑区的确认勾选会同时保存当前修改，表格勾选只确认对应行。进度统计保留片段，另行显示删除数量；整条删除的 Episode 也能导出并恢复。

## 5. 备份与续审

浏览器草稿与当前地址、浏览器和项目绑定，并不是服务器保存，也可能被清理。请定期导出完整 JSON。在同一数据集的报告中导入，可恢复审核；存在本地草稿时，弹窗明确选择保留哪个版本。

导入检查 FPS、全局 ID／文本、Episode 编号和长度；两边都带项目 ID 时，ID 必须一致。旧导出没有项目 ID，只能通过上述结构检查，请自行核对数据来源。

完整 JSON 包含全局定义，是训练整理脚本的输入。已确认 Episode 的 JSONL 便于单独使用，但没有全局映射和 FPS，应与完整 JSON 一起保留。

## 6. 整理训练数据

按 [GR00T 接入说明](gr00t.zh.md)操作。人工审核确定的是语义标签，不代表机器人动作都是专家示教。DAgger 动作监督还要与接管掩码取交集；规划器训练则可以使用未接管期间、但标签有效的保留图像。
