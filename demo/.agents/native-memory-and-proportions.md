# Native 人物比例与内存检查（2026-09-10）

## 人物变形的原因与修复

立绘的 authored box 为640×1280；例如 Mara 位于(640,110)，下边缘在1390，正常情况下部分身体会超出1080高的舞台。旧渲染把裁切后的970高矩形当成整张图片的绘制范围，将完整UV压入其中，所以人物被纵向压扁。

现在图片、角色和视频的顶点使用完整、有符号的物理坐标矩形，裁切独立通过scissor处理。角色按解码图片比例contain；不通过改剧本坐标或拉伸素材补偿错误。回归同时检查执行计划的坐标传递，以及顶点、UV和裁切范围。

实机截图：`../.generated/qa/native-sync/final-character.png`。同目录的`mara.png`是修复前截图，不可作为当前效果。

## 内存控制

- 字体解析结果与shaping字体共享复用，不在每次图集重建时复制并重新解析整份字体。
- 完整对白预热只进入实际对白字号/字体；富文本按各run准备字形，不再把所有对白放进标题和菜单图集。
- 历史字形按字号估算16MiB的留存预算，字符数量限制在16—2048之间；当前帧所需文字完整保留，因此这是历史缓存预算，并非图集或进程的硬上限。无字形的度量桶只分配1×1纹理；既有每字体最多8个字号桶的淘汰机制继续生效。
- 内存host副本共享不可变资源的Arc字节，存储和API返回的可变字节仍各自独立。
- GPU提交加入背压，提交第三批时等待最早一批完成，避免遮挡窗口/离屏路径无限积压。窗口提前收到重绘事件时遵守帧截止时间。
- 合成临时目标预算计算包含主目标、嵌套目标、resolve和MSAA附件，并使用饱和计算。默认1x；4x必须显式启用。256MiB检查针对合成目标，不代表整个GPU内存预算。

## 验证与测量边界

- Renderer测试885项通过；native app286项与CLI14项通过；native runtime83项通过。包括离屏人物比例、MSAA预算、字形回收、预热隔离及host副本共享。
- 实际QPK/QuickJS/WGPU E2E覆盖主菜单、序章、选择、菜单返回、设置和章节；纹理上传、字体及关闭清理均无错误。最新运行数字见`native-ui-sync.md`。
- `final-cycles.mjs`执行六轮面板切换并等待；约97秒采样见`final-memory-samples.json`。RSS早期约618MiB，期间峰值约655MiB，随后回落并在末段约451MiB；这不是严格的修复前后对照。
- 同次运行的macOS `vmmap`记录空闲physical footprint约531MiB、峰值约770MiB。RSS、footprint、GPU共享内存不可混作同一指标。QPK和字体常驻、驱动及分配器高水位仍构成显著基础开销。
- 这些是短程实机结果，不能证明完整长篇运行无泄漏或所有场景都达到固定内存上限。后续新素材与多角色演出仍应测量峰值和回落，不能仅根据QPK压缩体积估算运行内存。

UI同步、实机路径与未覆盖的环境光/纸纹效果见`native-ui-sync.md`。本次不改美术原图或故事坐标。

## 全面泄漏复核（2026-09-10）

本轮又检查了 renderer 的 decoded texture、bind group、compositor/shadow target、字体 atlas、GIF frame queue、rodio track、QuickJS namespace/step handle、projection worker 和 host bridge。发现并修正了两类队列竞态：字体 atlas 重建与释放、视频帧发布与流释放之间，释放前会取消尚未上传的旧对象；同一资源的待上传项只保留最新一份。NativeHostPlugin 的卸载记录和清理错误也改为最近64条，避免诊断本身无限增长。

新增检查：native app 288 项与 CLI 14 项通过，engine-native 111 项和 typecheck 通过。18轮记录/菜单切换并等待约165秒，RSS 运行后稳定在约435–538MiB，末段约436MiB，没有随轮次持续增长。`leaks` 工具受 macOS 调试权限限制，只能观察系统 XPC 对象，报告约19.7KiB系统对象泄漏，不能归因于 QuaEngine；不能据此宣称零泄漏。QuickJS worker 有明确 Drop/join，module namespace release 会清理 namespace、step run/resume 和 pipeline listener handles。

仍需保留的边界：QPK 解包字节、字体常驻、Metal/WGPU 驱动和 macOS 分配器高水位会造成较高基础占用；这不是应用对象泄漏。长时间完整路线、多视频并发和 rodio 真实音轨仍应单独压测。
