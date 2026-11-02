# Validation / 验证记录

Validated on 2026-11-02 (Asia/Shanghai). / 验证日期：2026-11-02，中国标准时间。

## Automated checks / 自动化检查

- **23 JavaScript tests**: frame-interval validation; first/middle/last/single/all deletion and restoration; no movement across a deleted neighbor; boundary edits and splitting invalidate affected confirmations; full review round trips; global-map and project compatibility; reviewed-only export. A lightweight DOM mock additionally exercises UI event handlers, language/camera switching, autosave/reload, import conflict choice and export. The DOM test does not launch a browser or decode video.
- **10 Python tests**: expert-only full-horizon masks; task/deletion/unknown/nonexpert gaps; same-class merging without crossing a gap; exact-horizon and all-deleted cases; report building and training packaging with unchanged-source checks; HTTP GET/HEAD, byte ranges, invalid ranges and path/symlink access restrictions.
- **Original data consistency**: the portable preparer reproduced 27,508 retained frames, 12,768 retained expert frames, 11,018 valid action starts and 27,472 valid planner samples from the 12-episode confirmed review. All **60 mask arrays** matched the original archived preparation package element for element. Real data and test outputs were kept outside this repository.
- **DINO CPU smoke**: existing DINOv2/BiGRU weights processed a five-frame synthetic episode with three camera views, producing finite probabilities and a candidate summary. No training run or GPU inference was launched for this check.
- **Media**: all six synthetic MP4 files are H.264, yuv420p, 720 frames at 30 FPS (24 seconds each); combined size is under 1 MB. A decoded frame was visually inspected for the synthetic watermark and legible timestamps. The FFmpeg contact-sheet path was also exercised on the synthetic fixture.

中文：测试覆盖了状态逻辑、页面事件、数据整理和 HTTP 服务；真实 12 条数据的 60 个掩码数组与原包逐元素一致。DINO 在 CPU 上使用合成短片跑通。DOM 模拟测试不等于真实浏览器播放验收。

## Remaining browser and deployment checks / 待完成验收

The browser approval gate refused access to the local preview during implementation. Therefore real-browser video playback/seek, responsive appearance, file chooser/download behavior, and full UI interaction still require verification. Unit tests are not reported as browser end-to-end tests.

实现时浏览器审批拒绝访问本地预览，因此真实浏览器的视频播放／跳转、响应式外观、文件选择／下载及完整交互仍待验收，不将单元测试写成浏览器端到端验证。

GitHub publication and Pages verification require a publishing session for **Hopper617**. Verify the repository owner before publishing; a different connected account must not be used. The included workflows are ready for execution but are not proof that a remote deployment has run.

发布及 Pages 验证需要 **Hopper617** 的授权。应先核对账号，不能用当前连接的其他账号代发。仓库中的工作流配置不代表已经在远程运行成功。

Manual acceptance / 人工验收清单：

1. Open the served demo, play/seek, switch all cameras, and verify clip-end stopping.
2. Change a label, edit a boundary, split, confirm, refresh and verify draft recovery.
3. Delete/restore first, middle, last and all intervals; check that deleted time is not assigned to neighbors.
4. Export/import JSON; try both choices in a draft conflict; verify reviewed-only JSONL.
5. Switch languages and inspect desktop/mobile layouts.
6. Open a local real-data report using its authorized video root; verify all three recordings.
7. After publishing, verify the public README, successful test/deploy workflows and the Pages URL with the same synthetic interactions.

中文：打开演示检查播放／跳转和相机；修改、切分、确认后刷新；逐类验证删除恢复；导出导入并检查两种草稿冲突选择；检查双语与手机布局；验证本地真实录像；发布后再核对仓库、工作流与在线演示。
