# Native 启动与切换画面：准备完成再上屏

## 原因

用户反馈青绿色异常出现在启动或切换画面的短暂阶段。实际代码有两处相互叠加的问题：

1. `real_device/texture/placeholder.rs` 为缺失图片生成由资源名哈希决定的、不透明的 2×2 彩色纹理。不同图片会产生不同颜色，其中包括青绿等与美术无关的颜色。
2. 窗口创建时立即可见，异步图片解码、mipmap 和 GPU 上传尚未完成；产品循环仍把带占位纹理的帧提交给窗口。真实图片准备后再替换，所以用户能看到加载过程。

这与此前 hover 的 `rgba(...,1.0000)` 解析错误是两条独立链路。调整主题或仅把占位色换黑，不能解决不完整帧提前显示的问题。

## 行为修正

- 缺失图片的 GPU fallback 改为全透明，不再合成调试颜色。
- 当前画面所有请求的图片完成 GPU 驻留、字体及 atlas 同步无错误，才允许窗口提交该帧。准备过程中返回 `PreparingResources`，屏幕保留上一张完整画面；异步解码、上传、pipeline readiness 仍继续工作。
- 首次启动先创建隐藏窗口，第一张完整帧准备好后才显示。隐藏窗口通过定时器和 worker 唤醒继续准备，不能依赖 macOS 可能不派发的 `RedrawRequested`。
- 未上屏的投影不接受剧情点击、键盘或 IME 输入；关闭、调整尺寸和资源准备照常响应。CDP/E2E 输入、截图也等待完整帧。
- 只等当前投影资源，不等后续剧情的推测性预加载，不增加任意固定延迟，不把游戏状态放进 renderer。有限窗口测试只把完整帧计入完成与关闭条件。
- 必需图片或字体失败时明确报告错误并终止失败窗口；不无限维持不可见加载状态。

## 主菜单调整

保留 Web/Native 同一份 TSX/QSS：宋体标题分出轻重层次，左侧六项菜单保持一致大小和间距，移除横线表格感，减淡背景遮罩，使用暖灰文字、透明底和细金色 hover 标记。继续保持此前移除的英文装饰、广播站介绍和操作提示为空。

## 验证

- Native renderer：890 项通过，包含透明 fallback 与此前 hover 中间帧回归。
- Native app：312 项单元测试、14 项 CLI 集成测试通过。新增延迟图片上传、推测性预加载不阻塞首屏、必需资源缺失的回归。
- Demo TypeScript、2 项 UI/导航测试、Web 生产构建通过。
- Web/Native 菜单尺寸和等距排列一致；45 张 Native hover 截图的有效标签像素检查通过。
- 真实 Native 导航通过：自动渲染第一句、返回标题、续读、重新开始、点击存档卡片读取。开始/续读约 0.85 秒，返回标题约 0.22–0.28 秒（本机采样，不是性能保证）。
- 冷启动采样：窗口保持隐藏到约 1.12 秒的完整首屏；第一张剧情预加载图约 1.50 秒完成。说明标题显示不等待整个预加载队列。
- 真实 Electron Native 嵌入验证通过：标题图、缩放后点击、遮挡恢复、shader 过渡、弹出窗口、全屏、重新停靠、热重载和停止；无页面错误。已检查 OS 窗口截图中的嵌入标题画面。
- 完整 Native E2E 单独重跑，标题菜单和开场通过，在 `story-mara` 因 `OccludedAfterRetry` 未通过 OS 窗口呈现门禁。保留失败产物，不将 WGPU/readback 通过等同于完整 OS 窗口验收。

本机截图：`demo/.generated/qa/title-hover/`、`demo/.generated/qa/navigation/`、`.codex-tmp/editor-native-embedding/`。E2E 产物：`demo/dist/native/dev/e2e-checkpoints/`。

复查命令（仓库环境加 `rtk proxy` 前缀）：

```sh
cargo test --manifest-path packages/native/Cargo.toml -p quajs_wgpu_renderer --features real-wgpu-noop
cargo test --manifest-path packages/native/Cargo.toml -p quajs_native_app --features native-window,native-audio-rodio,javascriptcore
QUA_PARITY_WEB_URL=http://127.0.0.1:4188 node demo/scripts/title-hover-smoke.mjs
node demo/scripts/navigation-smoke.mjs --native
node packages/editor/electron/scripts/native-embedding-smoke.mjs
```

窗口验收任务应依次执行，避免不同应用互相抢占前台影响可见性判断。标题/导航脚本要求 Native 初始位于标题页。
