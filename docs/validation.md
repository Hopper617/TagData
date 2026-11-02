# Validation / 验证记录

Data/CPU checks: 2026-11-02. Publication/browser checks: 2026-11-03 (Asia/Shanghai).

数据／CPU 验证：2026-11-02；发布／浏览器验收：2026-11-03，中国标准时间。

## Automated checks / 自动化检查

- **23 JavaScript tests**: frame-interval validation; first/middle/last/single/all deletion and restoration; no movement across a deleted neighbor; boundary edits and splitting invalidate affected confirmations; full review round trips; global-map and project compatibility; reviewed-only export. A lightweight DOM mock additionally exercises UI event handlers, language/camera switching, autosave/reload, import conflict choice and export. The DOM test does not launch a browser or decode video.
- **10 Python tests**: expert-only full-horizon masks; task/deletion/unknown/nonexpert gaps; same-class merging without crossing a gap; exact-horizon and all-deleted cases; report building and training packaging with unchanged-source checks; HTTP GET/HEAD, byte ranges, invalid ranges and path/symlink access restrictions.
- **Original data consistency**: the portable preparer reproduced 27,508 retained frames, 12,768 retained expert frames, 11,018 valid action starts and 27,472 valid planner samples from the 12-episode confirmed review. All **60 mask arrays** matched the original archived preparation package element for element. Real data and test outputs were kept outside this repository.
- **DINO CPU smoke**: existing DINOv2/BiGRU weights processed a five-frame synthetic episode with three camera views, producing finite probabilities and a candidate summary. No training run or GPU inference was launched for this check.
- **Media**: all six synthetic MP4 files are H.264, yuv420p, 720 frames at 30 FPS (24 seconds each); combined size is under 1 MB. A decoded frame was visually inspected for the synthetic watermark and legible timestamps. The FFmpeg contact-sheet path was also exercised on the synthetic fixture.

中文：测试覆盖了状态逻辑、页面事件、数据整理和 HTTP 服务；真实 12 条数据的 60 个掩码数组与原包逐元素一致。DINO 在 CPU 上使用合成短片跑通。DOM 模拟测试不等于真实浏览器播放验收。

## Publication and browser checks / 发布与浏览器验收

The public repository is [Hopper617/TagData](https://github.com/Hopper617/TagData), and the synthetic workbench is live at [GitHub Pages](https://hopper617.github.io/TagData/). The [Checks](https://github.com/Hopper617/TagData/actions/workflows/test.yml) and [Deploy demo](https://github.com/Hopper617/TagData/actions/workflows/pages.yml) workflows passed. Publication used the verified Hopper617 connection; the uploaded source tree matched the local verified snapshot.

公开仓库和合成 Demo 已上线，测试与部署工作流通过。发布使用已核验的 Hopper617 连接，上传文件树与本地版本一致。

The following were exercised in a real browser on the published synthetic demo:

- All six camera recordings loaded with 24-second durations. Timeline seeking worked, camera switches preserved playback position, and selected-interval playback stopped at the last included frame.
- Task and integer-boundary edits updated the neighboring intervals correctly. Notes and confirmations survived a page reload; splitting preserved notes and cleared both confirmations.
- First, middle and last intervals could be deleted and restored without extending adjacent tasks. Shared boundaries next to deletions were locked. Restoring an unknown interval retained its exclusion.
- An all-deleted episode retained eight deletion records covering exactly its original 720 frames, exported successfully and could be restored.
- Full-review JSON downloads and file-chooser imports worked. Both explicit draft-conflict choices were tested. Downloaded JSON was parsed independently to check exact bounds, unchanged canonical prompts, notes and confirmation states.
- Confirmed-only JSONL included the fully confirmed episode and excluded the unfinished one. An explicitly all-deleted episode was also exportable with an empty retained array.
- English/Chinese switching and desktop layouts were inspected; preview screenshots are included in the READMEs. Narrow-layout DOM bounds had no horizontal overflow. No browser console errors or warnings were recorded during these checks.

中文：在已上线网页中验证了六路录像、定位和片段停止、相机切换、标签／边界编辑、切分、刷新恢复、各位置删除与恢复、整条删除、文件导出导入和两种冲突选择。导出文件另行解析，核对了帧边界、原始英文 prompt、备注和确认状态。双语桌面界面已检查；窄布局通过 DOM 边界检查，未发现横向溢出。

The browser draft was restored to the original synthetic baseline after testing, and the temporary viewport override was reset. The repository's demo metadata was never modified by these UI tests.

测试后已将浏览器草稿恢复为原始合成示例，并清除临时视口设置。网页测试没有修改仓库中的示例元数据。

Local real-recording browser playback remains a manual check because the local-preview origin was blocked by browser permissions. Its HTTP Range/path tests and all 60 original-data mask comparisons passed. Physical mobile devices were not tested.

本地真实录像的浏览器播放仍需人工核对，原因是本地预览地址受到浏览器权限限制；HTTP Range／路径检查以及真实数据的 60 个掩码数组比对已通过。尚未使用真实手机测试。
