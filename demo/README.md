# 明天，请再一次呼唤我

QuaEngine 的日系近未来科幻悬疑视觉小说 demo，现处于故事重开发阶段。

2047 年初夏，神代凛来到青叶市，为即将搬迁的海岸台整理声音档案。她与录音员 Mara 在共事中逐渐亲近，直到一条监听线路传来尚未制作完成的次日节目。

## 当前状态

- 世界观、人物、时间通信规则、完整因果链、感情铺垫、序章分场和美术需求已经整理在 [.agents/README.md](.agents/README.md)。文档包含完整剧透。
- 旧故事、旧分支、背景、立绘、CG、配乐和故事专用生成器已删除。
- 14个QuaScript模块贯通序章、七章共同线、尾声和三种结局。人物入口、广播来历、跨夜揭露和新结局已实际写入QS。完整结局单次正文90,205—90,288汉字，提前交接71,034—71,110字，已到9万字的篇幅下限，114,500字分场预算与完整演出仍未完成。详见 [实际实施状态](.agents/manuscript-status.md)；运行 `python3 scripts/story-length.py` 可重算。
- 序章已扩为约1.49万字，研究租用、普通信号对照与两人工作日先行，晚八点再导入首次异常。见 [序章实施](.agents/prologue.md)。
- [89场主线与3场短结局](.agents/scene-plan.md) 的114,500字主线预算继续作为扩写目标。当前正文不能视为全量分场成稿。

- 主菜单区分继续阅读／从头开始，提供读档、章节选择和设置。已读章节可恢复章首状态重读；未读章节隐藏内容。手动存档带章节与时间、覆盖确认；Web 阅读设置独立持久化。图库入口随美术统一制作暂缓开放。
- 保留 Web/Vue 与原生共用的引擎、UI、存档、设置、回看、字体与 Quack 构建基础。内部demo未公开发布，不考虑旧代码、旧接口、旧步骤或旧存档兼容，不添加迁移或稿次分库；见 [开发规范](AGENTS.md)。
- 已修复生产版 SRI 与 QPK 输出／加载链路，实际生产预览已跑通主线。完整验证与未完成项见[开发交接](.agents/implementation-plan.md)。

## 开发

从仓库根目录执行：

```sh
pnpm --filter demo dev
pnpm --filter demo typecheck
pnpm --filter demo assets:build
pnpm --filter demo build
pnpm --filter demo exec vite build --config vite.native-jsc.config.ts
pnpm dev:native
```

当前 Web 界面采用统一的暖白纸面与海绿色，设计记录见 [.agents/ui-design.md](.agents/ui-design.md)。界面截图与交互检查可运行 `pnpm --filter demo test:ui`。

Web 故事与 UI 冒烟回归：先运行 `pnpm --filter demo exec vite preview --port 4178`，再运行 `pnpm --filter demo test:story`。需要仓库的 Playwright 和本机 Chrome；可用 `QUA_STORY_URL` 指定预览地址。脚本检查开场推进、刷新读档、标题续读、覆盖确认、回看与不同窗口尺寸；结果位于 `.generated/qa/story/`。此命令不证明全部分支和结局通过。

旧 `assets:generate` / `assets:regenerate*` 命令已移除。首批角色参考及背景提示词已经整理为 [.agents/prologue-art.json](.agents/prologue-art.json)。用户已要求所有图片后续统一制作，当前不再等待生成方式确认。没有新生成图片，也未注册计划中的素材路径。

`pnpm native:e2e` 仍要求正式美术、声音、图库及原生端完整演出，当前文字回归不能替代该门禁。统一制作媒体并接入后，更新真实选项与断言并运行该命令，不能删掉交互检查。

## 工程边界

| 位置                               | 用途                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `.agents/`                         | 版本化创作档案和实施交接                                                |
| `src/game/story/prologue-state.ts` | Web／原生共用剧情插件，接收 pipeline 导航意图、执行全文、恢复存档与章节 |
| `src/game/scenes/`                 | 14 个 QuaScript 文件，覆盖完整主线与三种结局                            |
| `src/game/settings-storage.ts`     | Web 阅读偏好存储适配器，与剧情存档分离                                  |
| `src/game/content/`                | 已实现内容的图库、章节定义                                              |
| `src/game/runtime*.ts`             | 共用插件与 Web 平台适配                                                 |
| `src/game/ui/`                     | Web / Native 共用的 TSX、QSS、插件皮肤与导航会话                        |
| `src/game/bootstrap.ts`            | Vue 舞台与共享 QUI Web 适配器接线                                       |
| `src/targets/native/`              | Native 帧投影、宿主接线与 JavaScriptCore 入口                           |
| `src/targets/cocos/`               | Creator 宿主、Cocos 平台服务与共享 QUI 接线                             |
| `assets/`                          | 发布资源，目前仅通用字体；原生脚本由构建生成                            |
| `scripts/`                         | 运行与验证工具                                                          |

游戏与叙事状态由 engine/store 持有，界面只投影并通过 pipeline 发出意图。静态素材走 Quack 主包，后续运行期增量内容走 Runtime QPK。保留 1920×1080 逻辑舞台和现有目标隔离约束。

## Cocos Creator 工作区

本机使用 Creator 3.8.8。以下命令从仓库根目录执行：

```sh
pnpm exec turbo run build --filter=demo^...
VITE_QUA_PARITY=1 pnpm --filter demo build
pnpm --filter demo build:cocos
node demo/scripts/cocos-build.mjs mac --no-generate
node demo/scripts/cocos-build.mjs web-desktop --no-generate
open demo/dist/cocos/workspace/build/mac/proj/Debug/CocosGame.app
pnpm --filter demo test:cocos
pnpm --filter demo test:cocos:mac
# 关闭已启动的测试应用后，生命周期测试自行启动、退出并重启应用
pnpm --filter demo test:cocos:lifecycle
open demo/dist/cocos/workspace/build/mac/proj/Debug/CocosGame.app
pnpm --filter demo test:cocos:parity
pnpm --filter demo test:cocos:surfaces
```

工作区位于 `demo/dist/cocos/workspace`，包含构建后的 ESM、共享 TSX/QSS、剧情、QPK 与 Creator 原生媒体，不链接仓库源码。工作区可以复制到仓库外打开与构建。`COCOS_CREATOR` 可指定 Creator，`QUA_COCOS_WORKSPACE` 可指定独立工作区；Creator CLI 的成功退出码为 36，macOS 构建还执行 `stage=make`。`pnpm --filter demo build:cocos:mac` 会重新生成整个工作区再构建原生应用；要保留另一平台的构建，请使用上面的 `--no-generate` 命令。测试前实际启动 `build/mac/proj/Debug/CocosGame.app`；mac 测试使用本机 Debug 的 6086 调试接口。生命周期测试可通过 `QUA_COCOS_NATIVE_APP` 指定应用，验证退出进程、重启继续阅读、记录按钮及滚轮导航、章节跳转和真实截图中的舞台裁剪。

在 Cocos Dashboard 选择导入项目目录，打开该工作区的 `assets/main.scene`，点击编辑器播放按钮即可预览原 demo。工作区不需要安装 QuaEngine npm 包；游戏代码已经使用包的公开 `dist` 入口编译，只有 `cc` 由 Creator 提供。原生应用与独立预览可以从同一工作区分别构建。

Web 构建通过 `emptyOutDir: false` 保留其他目标的输出；更换剧情或资源后，需重建参与对比的各端并核对构建身份。完整接入与媒体能力说明见[工作区指南](../docs/content/docs/platforms/cocos.md)和[媒体一致性](../docs/content/docs/platforms/cocos-media.md)。

`test:cocos:parity` 使用生产 Web、Creator web-desktop 与已启动 macOS 应用，以真实浏览器输入和 Creator 原生输入绑定推进。默认验证各选择分支和结局；`--quick` 仅检查开场。画面、投影、布局误差和覆盖结果写入 `demo/dist/cocos/review/parity/`；运行失败会保留失败报告，不应视作验收通过。macOS 画面来自 GPU 读回，原生输入绑定不等于系统鼠标键盘自动化。剧情没有使用音频或视频；另外提供确定性的 QA 媒体夹具，不能把空剧情当成播放、结束或解锁验证。图库和成就目录仍为空。原生存档写入 Creator 可写目录，预览存档写入独立 IndexedDB 字节文件库。生成的独立预览启动配置会启用 Creator 的窗口尺寸更新，适配纵向与横向黑边。

三端面板对比由 `test:cocos:surfaces` 执行。测试浏览器使用 `demo/.generated/cocos-parity` 下的独立持久化 QA 配置和固定本机端口，保留真实 IndexedDB 存档；这些目录不属于交付工作区。面板测试复用完整剧情测试的浏览器档案及相同端口来源（Web 46181、Creator 46182），确保三端章节解锁状态一致。锁定和解锁章节有意使用不同标题高度，不能将不同解锁状态作为相同布局比较。`QUA_COCOS_PARITY_PROFILE` 可指定档案目录；存档和设置数据差异仍会写入面板报告。

同一构建产物的完整剧情测试失败后，可使用 `test:cocos:parity --resume` 从实际保存的选择检查点恢复。报告保留失败原因和已验证前缀，并重新通过真实输入执行检查点之后的剧情；不会修改引擎状态来跳过剧情。修改剧情、引擎或内容资源后必须重新执行完整测试。只修改投影实现时，可以保留完整剧情基线，并在校验编译产物差异后执行覆盖变化的回归；报告必须分别记录基线和最终构建的 SHA，不得把旧画面标为最终构建结果。原生测试输入等待 Creator 帧派发完成，避免调试轮询抢在键盘事件处理前重复按键。

完整剧情测试会在报告中记录原生堆内存采样。Cocos 存储事务只为本次修改的记录创建磁盘备份，提交后清理；不会把全部旧存档读入内存。此机制支持异常回滚，不承诺进程崩溃或断电时的事务原子性。

## Godot 工作区

先构建工作区依赖，再导出独立的 Godot 4.7 项目：

```sh
pnpm exec turbo run build --filter=demo^...
pnpm --dir demo build:godot
pnpm --dir demo run:godot
pnpm --dir demo edit:godot
pnpm --dir demo test:godot:native
pnpm --dir demo test:godot:package
```

在 Godot 中打开 `demo/dist/godot/workspace/project.godot`。生成目录包含本机 GDExtension、QuickJS 剧情包、QPK 和 Rust 源码，运行时不需要 Node、WebView 或源码仓库。需要 Rust/Cargo、C 编译器；视频转换需要带 libtheora/libvorbis 的 FFmpeg，macOS 可安装 `ffmpeg-full`。生成器只替换自己标记的输出目录，失败时保留之前的项目。

`run:godot` 直接运行游戏，`edit:godot` 打开编辑器。双击 `project.godot` 只打开编辑器；在编辑器中用右上角运行项目按钮启动主场景。`GODOT_BIN` 可指定 Godot 可执行文件，macOS 默认使用 `/Applications/Godot.app/Contents/MacOS/Godot`，Windows/Linux 默认从 PATH 查找 `godot`。

Cocos/Godot 的业务入口共用 `src/targets/scene/main.ts`，引擎、QuaScript 与 QUI/QSS 和 Web 共用。macOS 为首批验证平台；Windows/Linux 的宿主构建路径已实现，仍需在对应系统实测。原生媒体测试读取 QPK 内的确定性夹具，不能替代全剧情、全部分支和主观听感验收。完整 API、现有功能差异和调试入口见 [Godot host 指南](../packages/platform/godot-host/README.md)。

## Copyright

The demo game is proprietary demo content. Its story, scenario scripts,
characters, artwork, generated images, CGs, UI presentation assets, icons,
audio, prompts, masks, and other creative materials are fully copyrighted and
are not distributed under the repository's open-source package license unless a
separate written license says otherwise.

You may download and run the demo only to evaluate or demonstrate QuaEngine. Do
not copy, redistribute, modify, extract, reuse, train on, sell, publish, or
include the demo content in another game, engine, dataset, product, template,
asset pack, or public distribution.

Engine source packages outside `demo/` keep their own package licenses.

QuaEngine names, logos, icons, badges, and related brand assets are not licensed
for reuse. See `../TRADEMARKS.md`.

## 场景叠图与截图模式

阅读工具条的“截图”或 H 键隐藏全部 UI，保留背景、角色与场景图片。按 H、Esc 或点击画面恢复；恢复点击不会推进剧情。进入时停止自动阅读/快进，退出后手动继续。截图模式用于系统截图，不会自动导出文件。

任意位置叠图使用 `BackgroundPlugin.addLayer({ id, assetName, x, y, width, height, fit: 'contain', zIndex })`，或 QuaScript 的 `@BackgroundLayer(id, asset, options)`。坐标使用逻辑舞台单位，横屏为 1920×1080，原点在左上。多个图片可同时显示，位于角色后方；`zIndex` 决定图片之间的顺序。清除图层保留原背景。详见 [背景插件文档](../packages/plugins/background/README.md)。

叠图可以通过 `backgroundLayer:<素材ID>` 接入现有动画时间轴，支持位置、尺寸、缩放、旋转和透明度；播放完成后默认保留最终状态。截图模式下场景动画继续播放。TypeScript 与 QuaScript 示例见 [背景插件文档](../packages/plugins/background/README.md#animate-placed-images)。

运行 Demo 开发服务器后，`QUA_STORY_URL=http://127.0.0.1:4186/ node demo/scripts/scene-screenshot-smoke.mjs`（从仓库根目录）检查实际图片解码、指定坐标、动画中间帧与最终状态、暂停/恢复、截图模式下播放和 UI 恢复。证据写入 `.codex-tmp/scene-screenshot/`。

## 共享 UI

Demo 的标题菜单、阅读工具条、章节选择、存读档、确认框、设置与记录面板统一由 `src/game/ui` 定义。各目标使用同一份 TSX/QSS、逻辑坐标和导航意图；Web 用可选的 `@quajs/renderer-web/qui` DOM 适配器，Cocos 用 `@quajs/renderer-cocos/qui` 投影到 Creator 节点，Native 使用 WGPU。基础对白、角色和场景由各自的引擎渲染器投影。

同构是项目可选能力：Web-only 项目仍可使用自定义 Vue/React/Svelte 页面。Demo 必须保持一份产品 UI，不再另外维护 Vue 页面。详见 [共享 UI 开发说明](src/game/ui/README.md)。

面板对比前，在其他交互或重启测试结束后重新启动原生应用。浏览器重载会创建新的会话记录；原生进程先前读档后保留的对话历史可能不同。保留持久化档案和章节解锁，只比较由相同输入序列创建的阅读会话。

浏览器结束后若 Playwright 的关闭连接仍等待，验证脚本会限制等待时间、关闭临时 HTTP 端口，并检查 QA 档案对应的 Chrome 进程已退出。只有没有遗留浏览器时才结束测试进程；报告的 `cleanup` 保留此状态。

## 三端媒体验证

`pnpm --filter demo media:fixtures` 用 ffmpeg 生成确定性的 PCM 正弦波、H.264 测试画面及 PNG 封面，资源通过同一 Quack QPK/hybrid 流导入三端。夹具不是剧情内容。重新生成 Web/Cocos 并启动最新 macOS 应用后运行：

```sh
QUA_COCOS_WORKSPACE=/path/to/workspace pnpm --filter demo test:cocos:media
# 完整一致性门禁；实际处理或能力存在缺口时必须失败
QUA_COCOS_WORKSPACE=/path/to/workspace pnpm --filter demo test:cocos:media:parity
```

结果和真实并排画面位于 `dist/cocos/review/media/index.html`，原始时钟、投影和模块 manifest 位于 `report.json`。检查包括四类音频、结束事件、暂停/恢复、seek、循环、音量、交叉淡入淡出，以及图片时间轴的位置、缓动、旋转、透明度和最终值提交。测试读取实际 WebAudio/Creator SDK/原生 PCM 处理器、设备时钟和真实渲染节点；没有进行主观听音或系统音频录制。Creator Web 视频使用 SDK VideoPlayer；macOS 工作区编译 QuaEngine 的 AVFoundation 适配，将真实解码帧上传 Cocos 纹理。视频仍通过 QPK 身份与 hybrid 资源映射加载，缺少解码器的宿主保留封面回退。验证真实 seek、循环、移动帧和清理；SDK Web 的视频层在 Canvas 下方，GPU-only 截图不包含这一层。音频进一步检查大于 1 的实际增益、八类 track/bus/master EQ 的处理后 PCM，以及 1.5 倍变速、暂停时改为 0.5 倍、恢复和 2 倍自然结束。播放倍率通过 AudioPlugin 的 playbackRate／setPlaybackRate 管理，范围为 0.25–4，音高随速度变化；EQ 幅度允许 4% 误差。macOS 工作区包含静态 AVAudioEngine 处理器，预览复用 Creator 已有播放器和音频上下文。通用宿主仍按可选能力声明，报告必须保留实际未通过项。

生成工作区的 `qua-import-meta.json` 保存稳定的导入类型和 UUID。构建脚本恢复元数据并清空生成工作区的 `library/temp`，然后检查发布的 main bundle 包含所有启动场景。本机 Creator 3.8.8 CLI 冷导入曾返回 36 却将资源识别成通用类型；若场景缺失，脚本恢复 `.meta`，短暂启动完整 Creator 等待所有资源按预期类型导入并关闭该进程，再重试 CLI 一次。恢复失败会阻止原生 make；失败日志和 Editor 导入日志保留在 `dist/cocos/review/logs`。该命令只应作用于可再生成的工作区与缓存。

Creator 发布 Web 的视频在 Canvas 下方；生成启动壳在图形初始化前启用透明 Canvas，并隔离容器的 CSS 层级，使视频不会落到页面背景后面。验收服务器实现 HTTP Range，支持真实 seek；视频验收同时检查播放时钟与截图中色块，不能仅凭组件存在或时钟运行通过。`cocos-build.mjs` 的工作区旁构建锁阻止 Web/mac 同时清空共享导入缓存；异常强制终止后如锁残留，先确认 owner.json 的进程已退出再移除。

视频夹具把 BT.601 测试信号转换为明确标记的 limited-range BT.709；验收对比实际色块，三端每个颜色通道差值须不超过 5。未标记/HDR 视频和非静音视频的音画同步不属于本次验收。移动画面是顺序采集，时间码可以不同。

Creator 3.8.8 CLI 构建使用每次独立的临时工作区导入副本，避免跨平台／重复使用导入数据库时将资源识别成普通文件。demo 构建脚本保留原始生成文件，验证启动场景（原生还要求 make 产出应用）后原子发布 build/<platform>；失败保留上一份可用输出。临时副本和构建锁自动清理。生成 package.json 使用稳定项目 UUID。脚本调用仍为 configPath，SDK 成功码为 36；该退出码本身不构成验收。独立 CLI 手动复现时请为每个平台复制一份原始工作区；Creator 图形编辑器可直接打开生成目录。

媒体 QA 入口仅在 Cocos debug 构建中启用，最多保留最近 256 条事件；发布构建不注册这些监听器。GitHub CI 执行 Cocos 宿主、持久化、渲染、工作区生成、共享媒体与 demo 构建脚本回归；本机 Creator 图形和 macOS 媒体验收仍通过上述实际运行命令完成。
