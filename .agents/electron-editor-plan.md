# QuaEngine 独立 Electron 编辑器计划

Date: 2026-09-18
Status: In progress — feat/electron-editor

## 实施进度（2026-09-18）

首批可运行原型已落在 `packages/editor/{core,ui,electron}`，启动命令 `pnpm dev:editor`。

- 已接入项目清单、后台 project inspector、文件筛选、故事节点回源、Monaco QuaScript 高亮与现有语言服务诊断。
- 已实现带版本冲突保护的原子保存、未保存修改提示、受限 preload、会话取消、旧消息丢弃及预览进程树清理。
- Web 使用隔离的 WebContentsView；Native 使用原有 QuickJS/Rust/wgpu 产品循环输出有界 RGBA 帧，直接在编辑器 canvas 中展示，输入回传既有 Native/pipeline 路径。
- 已通过真实 Electron 内的 Web 设置交互、Native 设置/剧情推进、面板缩放后点击、Web → Native → Web 切换与停止清理验证。截图在 `.codex-tmp/editor-smoke/`。
- 已继续接入现有语言服务的 QuaScript 补全、悬浮说明、同文件/跨文件 F12 和格式化，使用未保存文本与项目配置；修正诊断/故事节点/定义的行列映射。
- 已加入后台目录监听、事件合并、项目/文件/故事诊断刷新、清洁文档自动同步、脏文档保留、只读差异比较及校验已比较版本的显式保留本地保存。删除磁盘文件仍保留缓冲区；切换项目释放旧监听，错误配置禁用启动并可恢复。真实 Electron 临时项目验证已通过，差异截图在 `.codex-tmp/editor-workspace-smoke/`。
- 已加入活动栏视图切换、虚拟目录树、模糊文件过滤、键盘导航、多文档标签与三处分隔线调整；底部可切换问题、Debug Console 和 Assets Browser。全文搜索由独立 ripgrep 进程执行，支持取消、正则／大小写／全字、包含／排除 glob 与 Unicode 行列定位。
- Assets Browser 已接入共享源文件／媒体索引，支持文件夹范围、递归／类型／路径筛选、排序、虚拟网格／列表、后台缩略图、有限尺寸图片预览、音视频播放、路径复制、项目树／系统定位与同名不覆盖导入。媒体会话 URL、流、播放与有界缓存均有切换清理；资源浏览不向运行时直接注入内容。
- 已接入共享编译器 AST 的角色对白分色，同一角色标签跨文件保持颜色，表达式保留语法色；分析、诊断和虚拟 TypeScript 复用解析结果，后台复用 TS LanguageService 与 32 条文档缓存。全项目静态检查覆盖未打开 QS 和 tsconfig 下的 TS，支持进度、自动刷新、手动重查和问题回源。底部改为统一紧凑页签、数量徽标和面板操作；当前 TS 未保存文本仍需保存后检查，角色别名尚不自动合并。
- 仍为分阶段实现：语言快速修复/重命名、工作区会话恢复、项目创建、增量索引、自动三方合并/崩溃恢复、引用感知的资源重命名／移动／删除、拖入导入／导入撤销、包内资源浏览、跨章节分支状态重建、可视化写回及安装包尚未实现。Native 当前只宣告指针输入；独立 viewport resize、键盘/IME、滚轮与焦点尚待接入，面板缩放不等同于 native viewport resize。
- 双模式 smoke 不是全体验、音频听测、跨平台验收或像素一致性证明。Phase 0 的完整能力矩阵和性能目标继续保留，未标记完成。

2026-09-18 角色着色／全项目静态检查验证：编译器、语言服务、检查器与 core/electron 共 243 项测试通过，相关六个包和 Demo 的 typecheck、UI/Electron 构建及 lint 通过。真实 Electron authoring/workspace/workbench smoke 以及 Demo Web/Native 内嵌交互通过。全项目后台检查覆盖 14 个 QS 模块及 TS 项目，共 15 项，0 错误；`ending-handoff.qs:122` 留有一条多余空行样式警告。修复了共享检查器把合法无目标选择误报为跳转错误，以及 `@Choice` 后空行误报的问题。

同轮 Demo 验证还完成生产 Web 构建和 22 项完整剧情回归：三个结局、保存／载入／续读／章节重放、46 个演出检查点和 3 个光照检查点通过，浏览器错误为 0；生产资源来自 QPK，无开发 VFS 请求。结果在 `demo/.generated/qa/story/results.json`。构建前移除了 Native smoke 生成的 `assets/scripts/native-app.mjs`，避免 Native bootstrap 混入 Web 资源包；下一次 Native 启动会自行重建。此轮没有重新跑完整 Native E2E，也不代表音频听测或跨平台验收。

当前单机分析样本（`prologue-arrival.qs`，75 条角色对白）：首次分析 920 ms，修改未保存缓冲区后分析 467 ms，相同缓冲区缓存命中 1 ms；Demo 完整静态检查约 7.1 秒。样本在 `.codex-tmp/editor-authoring-smoke/analysis-metrics.json`，仅用于确认服务／缓存复用，不是通用性能保证。静态检查后的开发进程树 RSS：编辑器 899 MiB、Web 1751 MiB、Native 1474 MiB、停止后 899 MiB；加入 TS 服务后常驻成本仍需在发布构建和长期运行中测量。最新截图与进程树采样已覆盖 `.codex-tmp/editor-smoke/` 中的历史文件。

2026-09-18 较早的 macOS 开发运行基线（接入语言能力和文件监听后，打开 Demo 和一个 `.qs` 文件，进程树 RSS 求和）：编辑器 679 MiB，Web 预览 1935 MiB，Native 预览 1620 MiB，停止后一秒 852 MiB。Web 包含 Vite/Sass，Native 为 Rust debug 产物；RSS 会重复计算共享页，不等同于物理占用，也不是发布构建或长时间稳定性结果。下一步需分别测量空项目发布构建、连续切换、帧传输耗时及长期内存趋势。

本轮工作区验证：21 项 core/electron 测试、三个包 typecheck、UI/Electron 构建、真实 Electron workspace/workbench smoke 与 Web/Native preview smoke 通过；包含新布局下真实 Demo 图片解码与 WebContentsView 边界同步。新增覆盖目录层级、搜索取消与上限、Unicode 偏移、长行结果片段、媒体导入访问边界和缩略图尺寸。1200 多文件临时项目的首次样本为约 1.2 秒打开、22 个树行 DOM、48 个资源卡片 DOM；只是单机开发样本，不是发布性能或大型真实项目增量刷新承诺。

接入工作区后的 Demo 开发进程树 RSS 样本：编辑器 659 MiB，Web 1818 MiB，Native 1313 MiB，停止后 689 MiB。测试期间打开过真实图片预览；数据仍为共享页可能重复统计的 RSS，不能直接证明内存优化幅度。原始数据和真实 Demo Assets Browser 截图分别在 `.codex-tmp/editor-smoke/metrics.json` 与 `web-assets.png`。

首批 Native 实现验证：2 项 Rust editor frame 测试、20 项 product_window 测试及完整 `pnpm native:e2e` 通过（253 个完整对话标识、15 个 GPU 画面检查点、0 texture upload/shutdown cleanup errors）；普通 Native 窗口最终报告 `OccludedAfterRetry / presented: false`，该结果不构成 OS 可见呈现或像素一致性证明。本次仅改编辑器工作区，未改 Native runtime，未重复该完整门禁；编辑器内画面、交互、切换和取消则已重新实测。

## 结论

QuaEngine 可以研发独立 Electron 编辑器。编辑器应被定位为面向编剧、美术和技术创作者的专用创作工作台，而不是把现有 VS Code 界面简单复制一份。

实现上采用“独立编辑核心 + Electron 产品壳 + 可选 VS Code 适配”的结构：

- Electron 负责项目管理、创作工作区、资源浏览、编辑器内 Web / Native 双模式预览、故事图、时间轴和一键运行。
- `editor-core` 负责项目模型、命令、诊断、索引、预览协议和构建协调，不依赖 Electron 或 VS Code。
- 复用现有 QuaScript language server、project inspector、script compiler 和 Quack。编辑器直接用 Electron 实现项目服务、进程管理和 Web/Native 预览适配器，不依赖 devframe。
- VS Code 扩展保留为技术用户入口，消费同一套 language server、项目诊断和编辑器协议。
- 编辑器不成为 QuaEngine 的运行时状态来源；项目源文件、QuaScript、项目清单和资源目录仍然是唯一事实来源。

Electron 的安装包和常驻内存会比单独的 VS Code 扩展更大，但对于带有舞台预览、资源管理和剧情编排的桌面创作工具，这个成本可以接受。真正需要控制的是项目扫描、预览进程、资源解码和后台构建的生命周期。

本轮范围仅包含 Web 与 Native。两种模式都必须在编辑器内提供可交互预览，不能仅提供启动外部应用的按钮。Cocos 的编辑器适配、预览和构建入口暂不纳入实施计划；仓库已有目标隔离规则继续适用。

## 非协商边界

- 编辑器只操作项目文件、构建配置和 QuaEngine 提供的开发接口，不直接修改引擎内部权威状态。
- 预览运行时是独立进程或独立渲染上下文。关闭预览后必须释放游戏进程、GPU 资源、音频句柄和临时对象 URL。
- Web 与 Native 的每次预览和构建必须先选定 active target resolver，再消费对应 `target-bundle-manifest.json`；不得先构造多目标核心集合再过滤，也不得重新声明 manifest 中的 active core。
- Electron UI、预览控制协议和游戏产物分层隔离。Electron 使用 Chromium 不会使 Native 游戏变成 Web 目标；Native 游戏产物及其启动链仍必须排除 Web renderer/core，Web 游戏产物也必须排除 Native core。
- 编辑器 IPC 只传输开发控制命令、输入、画面和诊断。运行时适配器将用户意图送回既有 pipeline/engine API，游戏渲染通信仍只有 `@quajs/pipeline`；不能引入第二套剧情或渲染事件总线。
- QPK、Runtime Package、脚本模块和资源的 provenance、信任和依赖规则继续由 Quack、QuaAssets 和 `RuntimeContentManager` 负责。
- 编辑器的选中项、面板布局、缩放、滚动位置和搜索词是编辑器本地状态，不写入游戏存档或引擎剧情状态。
- 编辑器 UI 可以使用 Web 技术，但不能把 Electron IPC、Node API、Browser API 反向带入 `@quajs/engine`、`@quajs/render-core` 或平台无关包。
- 文件格式优先采用可审查、可合并、可迁移的文本或现有 QPK/manifest 格式；不建立不可逆的私有项目数据库。

## 目标用户和首版范围

首版服务三类用户：

1. 编剧：编写 QuaScript、查看章节和分支、从故事节点直接预览。
2. 美术和策划：浏览资源、查看资源引用、编辑舞台布局和角色/背景配置。
3. 技术用户：查看诊断、运行构建、检查 QPK、查看目标平台产物和日志。

首版必须完成：

- 项目创建、打开、最近项目和项目健康检查。
- QuaScript 编辑、格式化、补全、诊断、跳转和快速修复。
- 章节树、故事图、节点详情、分支引用和运行时包依赖查看。
- 资源浏览器、缩略图、引用关系、缺失资源检查和包归属查看。
- 同一个预览面板提供 `Web / Native` 模式切换，以及启动、停止、刷新、跳转到故事节点和错误定位；默认只运行当前模式。
- 基于 engine-owned projection 的舞台预览，至少支持背景、角色、对话、选择和音频意图的可视化检查。
- QPK 构建、目标选择、构建日志、失败定位和产物目录打开。
- 撤销重做、文件变更提示、外部修改刷新和崩溃后恢复未保存文本。

首版暂不承诺：

- 完整的无代码剧情编辑器。
- 复杂的像素级美术合成或全功能音频工作站。
- 重写已有 Web、Native 运行时，或实现两种模式的任意内存状态无缝迁移。
- Cocos 编辑器适配、预览和构建入口。
- 自定义插件市场和第三方编辑器插件生态。
- 将编辑器操作直接写入玩家存档、读取进度或运行时剧情状态。

## 建议工程结构

```text
packages/editor/
  core/
    package.json
    src/
      project-model/
      commands/
      undo-redo/
      diagnostics/
      project-index/
      story-model/
      asset-model/
      preview-protocol/
      build-coordinator/
      target-selection/
  ui/
    package.json
    src/
      workspace/
      story-graph/
      inspector/
      asset-browser/
      stage-preview/
      timeline/
      diagnostics/
      project-manager/
  electron/
    package.json
    src/
      main/
      preload/
      ipc/
      windows/
      project-service/
      preview-host/
        web/
        native/
      task-runner/
      updater/
  vscode/
    package.json
    src/
      extension.ts
      editor-commands.ts
      preview-adapter.ts
```

`packages/editor/core` 只能依赖平台无关的 QuaEngine 构建和检查能力。Electron 的 `main`、`preload`、IPC、窗口管理和文件系统权限只能出现在 Electron 适配层。VS Code 的命令、TreeView、Webview 和 Custom Editor 只能出现在 VS Code 适配层。

`preview-host/web` 与 `preview-host/native` 分别负责宿主接入，按当前模式加载，不提供导入所有 target core 的共享 barrel。Native 所需的 Rust 帧输出、输入和生命周期扩展仍归属 `packages/native`；Electron 侧只做传输、展示和进程管理。

## 运行时和进程模型

建议使用以下进程边界：

```text
Electron main
  ├─ editor service      项目索引、语言服务、诊断、文件监听
  ├─ build worker        资源处理、Quack/QPK 构建、压缩和校验
  ├─ preview supervisor 当前模式的会话、启动、停止、切换和故障恢复
  │   └─ active backend 二选一：Web 独立页面 / Native 产品进程
  └─ renderer windows   编辑器工作区及内嵌预览面板
```

- 主窗口只处理窗口和系统菜单，不执行全项目扫描、QPK 构建或大资源解码。
- 编辑器服务维护一个共享项目索引，故事树、资源浏览器、健康检查和诊断都订阅同一快照。
- 预览适配器通过版本化 JSON-RPC 或本地消息协议提供 `getCapabilities`、`start`、`stop`、`reload`、`jumpToStoryPoint`、`inspectProjection`、`openSource` 和 `getDiagnostics`。由编辑器内置适配器接入现有目标开发入口，按 capability 逐步开放接口。
- 预览协议中的选中节点、资源引用和错误必须带有文件路径、行列号、story point 或 package provenance，避免只返回不可定位的运行时字符串。
- 大文件和媒体采用缩略图、流式读取、虚拟列表和有上限的 LRU 缓存。预览停止、项目关闭和切换项目时必须执行统一清理。

## 编辑器内 Web / Native 双模式预览

### 共同体验与各自运行链

| 项目 | Web 模式 | Native 模式 |
| --- | --- | --- |
| 运行链 | 项目的 Web 入口、Web core resolver、Web renderer 及所选框架适配 | 项目的 Native 入口、Native core resolver、现有 QuickJS / Rust / wgpu 产品链 |
| 编辑器内画面 | 独立、隔离的 Chromium 页面嵌入预览区域 | Native 产品进程输出真实 wgpu 渲染画面，在同一预览区域持续展示 |
| UI 来源 | 项目 Web UI 与显式导入的样式 | 项目 Native QUI/TSX、QSS 及 native feature surfaces |
| 输入 | 页面接收输入，经 Web renderer 发出 pipeline intent | 面板转发输入到 native host，由 Native 输入路径发出 pipeline intent |
| 刷新 | 复用现有 Vite/HMR；不能安全热更时重新启动预览 | 复用已支持的包/产物更新能力；未支持热更的改动重新构建并启动 |
| 能力差异 | 以实际 Web renderer 和浏览器能力为准 | 以实际 Native renderer capability manifest 为准，明确显示缺失能力 |

两种模式共享编辑器操作和同一份故事、资源来源，各自解析目标产物。Native 画面不能由 Web renderer 重绘代替；外部 native 窗口可用于排障和独立窗口验证，但不能作为“编辑器内 Native 预览”完成依据。模式切换也不自动转换 Web UI 与 Native UI；项目缺少某一目标入口时，提供配置诊断。

### Native 画面接入前置验证

- Phase 0 必须验证真实 Native 产品链到编辑器面板的持续帧输出、输入回传、resize、焦点、音频和停止清理。离屏单帧截图或仅启动 native 外部窗口都不足以通过。
- 必须直接嵌入原生渲染表面，禁止图像传输、共享像素缓冲区、CPU readback、canvas 复绘和高频截图。macOS 使用 Core Animation 图层托管；其他桌面系统分别实现原生表面/子窗口托管。
- IPC 只交换原生表面标识、布局、可见性和输入控制，像素由系统合成器直接呈现。记录表面资源生命周期和输入往返耗时。
- 帧生产与资源释放沿用 Native 产品循环的生命周期；编辑器不另建剧情时钟。面板隐藏时按生命周期策略降频或暂停展示，仍处理必要的退出和资源清理。
- 帧携带 session、尺寸、DPR、viewport 和序号。输入经过 viewport/letterbox 换算；运行时边界使用逻辑舞台坐标，适配现有调试接口时显式转换其声明的单位。键盘、文本/IME 与焦点事件需按实际 capability 验证，不能宣称未实现输入可用。
- 现有 native product bridge、`pnpm dev:native` 和调试控制接口作为复用起点；截图/调试能力不等于已经具备嵌入式持续帧通道。该通道完成前，双模式首版验收保持未完成。

### 切换与会话隔离

1. `Web / Native` 切换先提交当前文档版本供构建；保存失败时保留当前会话并显示诊断。
2. 停止旧会话并等待确认，必要时终止其受管进程树，释放音频、输入捕获和画面资源。
3. 从所选目标 resolver 创建独立 artifact，检查 manifest、runtime 版本、capabilities 和 QPK 依赖，再启动新会话。
4. 在同一面板显示目标、构建/启动状态、当前故事入口和诊断。启动失败留在所选模式报告原因，不暗中回退到另一模式。

- 协议的命令、响应、帧和诊断携带 `target: 'web' | 'native'`、`sessionId` 与 `buildRevision`；切换后拒收旧会话的迟到结果，支持启动/停止超时、取消和崩溃恢复。
- 构建缓存、产物、日志和预览存储按目标隔离；预览使用沙箱存储，不读写正式玩家存档。默认从相同选定入口及显式测试初值开始新会话，不能直接复制旧 renderer/QuickJS 内存。
- 需要恢复断点时仅使用引擎支持的 checkpoint/save-load 与包依赖校验；不兼容时回到选定入口并说明原因。
- 默认单会话满足重量控制；并排运行两种模式不作为首版要求。视觉对照可按相同 fixture 顺序采集两种模式的画面。

## 交互工作区

默认工作区保持克制：

- 左侧：项目、章节、资源和运行包导航。
- 中央：QuaScript、故事图或舞台预览，根据当前任务切换。
- 预览工具栏：`Web / Native` 切换、运行、停止、刷新、故事入口、视口尺寸和能力/错误提示。
- 右侧：选中节点、角色、背景、音频、资源和诊断属性。
- 底部：诊断、构建日志、预览日志和任务进度，默认折叠。

高级能力按需展开，不让用户在首次打开项目时面对完整 IDE 的所有面板。

故事图和舞台编辑必须通过 `editor-core` 命令修改源数据，并提供：

- 可预测的撤销重做。
- 修改前后的文本或结构化 diff。
- 无法安全映射到源文件时的明确只读状态。
- 选择编辑器节点后定位到 QuaScript、资源或 story point 的双向导航。

## 分阶段计划

### Phase 0：编辑器契约和性能基线

目标：确定数据模型、协议和资源预算，避免先堆 UI。

- 冻结项目打开、文件变更、诊断、故事节点、资源引用和目标选择的 TypeScript contracts。
- 定义内置双模式 preview protocol、capability handshake、会话标识和错误模型。
- 完成 Web 内嵌页面与 Native 实际帧输出的最小双模式原型，优先解决 Native 帧传输、输入、resize 和生命周期。
- 选取小、中、大三个测试项目，记录冷启动、项目索引、首个预览和构建的时间与内存。
- 记录编辑器预算：空项目内存、打开大型项目内存、预览运行内存、资源缓存上限和后台任务并发数。
- 定义崩溃恢复、外部文件修改、构建取消和预览强制停止语义。

验收：同一个 fixture 可以被 core、Electron 和现有 VS Code 工具读取；编辑器内能分别展示并操作真实 Web/Native 预览；记录 Native 传输和输入耗时、资源释放结果及未支持能力。协议错误可定位到文件、节点或 package provenance。

### Phase 1：Editor Core 和项目服务

目标：建立不依赖宿主的工作区基础。

- 实现项目发现、`qua.project.*` 读取、Web/Native 目标解析与能力检查，诊断缺失的目标入口、工具链和 UI 资源。
- 将 `@quajs/project-inspector` 能力接入共享项目索引。
- 实现故事树、资源索引、QPK lineage、诊断和文件定位模型。
- 实现命令、事务、撤销重做、外部变更合并和只读保护。
- 接入现有 language server 和 script compiler，不重复实现 QuaScript 语义分析。

验收：core 测试覆盖项目刷新、增量文件变更、诊断更新、故事图引用、资源缺失、QPK provenance、撤销重做和取消任务。

### Phase 2：Electron 产品壳

目标：让用户可以独立安装并完成一次完整创作循环。

- 创建 Electron main/preload/renderer 三层结构，启用最小权限 IPC。
- 实现最近项目、项目创建、窗口恢复、主题、日志目录和崩溃恢复。
- 接入 `editor-ui`，完成项目树、QuaScript 编辑器、故事树、资源浏览器、检查器和诊断面板。
- 使用 Monaco 或等价编辑器接入现有 language server；不要重新实现语言服务。
- 实现 Web/Native 预览适配器、面板模式切换、启动、停止、刷新、跳转、错误回源与会话资源管理。
- 实现文件拖入、资源复制、路径规范化和项目内相对引用检查。

验收：新用户从创建项目到在编辑器内分别用 Web、Native 运行一个含对话、背景、角色和选择的场景，全程不需要手动执行命令行；切换期间没有重复音频、旧帧/旧诊断覆盖或残留预览进程。

### Phase 3：可视化创作能力

目标：验证 Electron 相对 VS Code 的产品价值。

- 故事图节点创建、连接、筛选、定位和冲突提示。
- 舞台预览中的逻辑坐标、safe area、角色位置、背景层和对话区域检查。
- 角色/背景/音频/动画 projection 的属性检查和源文件回写。
- 时间轴只读预览、关键帧定位和运行时错误回源；先不做完整动画制作器。
- 资源引用、缩略图、包归属、未使用资源和缺失资源报告。
- 预览选择与编辑器选择双向同步。

验收：至少用一个真实 Demo 在 Web 与 Native 两种模式分别完成“编辑—预览—定位错误—修改—重新预览—构建 QPK”闭环；记录各自性能、能力差异和用户操作失败点。

### Phase 4：构建、发布和目标平台集成

目标：让编辑器成为稳定的桌面产品。

- 消费已验证的 active-target bundle manifest，分别调用 Web 与 Native 构建链，输出独立目标产物。
- 展示构建阶段、产物、诊断、签名/信任错误和目标平台限制。
- 增加 QPK 预览、包依赖检查、运行时包激活前检查和卸载阻塞提示。
- 实现自动更新、版本回滚、日志导出和诊断包收集。
- 配置 macOS、Windows、Linux 的安装包、签名和 CI smoke 测试。

验收：Web 与 Native 各自只能生成自己的 target core；共用编辑器壳不能向任一游戏产物注入另一目标的 core，也不能让 Runtime QPK 取得 bootstrap 权限。若修改共用打包器，仍需通过仓库已有全目标隔离回归，不为此增加 Cocos 编辑器功能。

### Phase 5：VS Code 适配和生态接口

目标：让技术用户可以选择 VS Code，同时复用全部核心能力。

- 将现有 `vscode-quascript` 的故事树、QPK Explorer、asset lineage 和 package health 接到 `editor-core`。
- 提供从 VS Code 调起独立 Electron 工作区及其预览的命令。
- 公开稳定的 editor command、diagnostic、preview 和 project inspector contracts。
- 评估第三方编辑器插件是否需要受限 manifest、命令贡献和只读 projection 扩展点。

验收：同一项目在 Electron 和 VS Code 中得到一致的诊断、故事节点引用、资源 lineage 和目标选择结果。

## 性能和重量控制

建议首版把以下指标作为工程目标，而不是宣传承诺：

- 空项目打开后先进入可编辑状态，再异步完成索引和资源扫描。
- 未启动预览时，不加载完整运行时和所有媒体解码器。
- 预览启动失败不阻塞编辑器主窗口。
- 默认只启动当前 Web 或 Native 会话；停止预览和切换模式后回收对应进程与资源。
- Native 帧传输队列、共享缓冲区和纹理句柄有上限；在缩放、隐藏、重启和模式切换后验证回收。
- QPK 构建、图片缩略图、音频波形和资源校验全部可取消。
- 单个项目索引只保留一份，多个面板共享快照。
- 大型故事图、资源列表和诊断列表使用虚拟化渲染。
- 每次版本发布记录冷启动、空闲内存、打开大项目、Web 预览、Native 预览和构建期间的整棵进程树内存，并单列 Native 帧传输开销与可获取的 GPU 资源指标。

推荐初始预算：在指定测试机器上，以发布构建衡量，未运行预览的空项目整棵进程树内存争取控制在 500 MB 以内，冷启动约 3 秒内可编辑。这些是待验证目标；开发构建数据另记，Web/Native 预览预算由 Phase 0 分别实测确定。

## 双模式预览验收矩阵

| 场景 | 验收要求 |
| --- | --- |
| 首次运行 | 同一真实 Demo 在编辑器内分别启动 Web 与 Native，完成对话推进、选择和错误回源 |
| 真实渲染链 | 记录目标 manifest、runtime/renderer 版本与能力；Native 画面由实际 wgpu 输出 |
| 模式切换 | 正常、构建中、启动失败与崩溃后切换均不串会话；旧帧/诊断不能更新新面板 |
| 舞台与输入 | landscape/portrait、两方向黑边、resize、DPR、焦点和声明支持的键盘/IME 输入分别验证 |
| 资源与媒体 | 两模式分别验证 QPK provenance、资源刷新、音频播放/停止；Native 缺失能力须明确报告 |
| 存储与重启 | 目标存储隔离；从明确入口重启；checkpoint 恢复遵循引擎兼容性与包依赖校验 |
| 持续使用 | 连续切换、启停、隐藏/显示面板和关闭项目后无孤儿进程、重复音频或持续内存增长 |
| 视觉与交互 | 同一故事点、视口、资产版本和测试初值下采集成对截图并实际交互；单次截图、单元测试或外部 native 窗口 smoke 不替代编辑器内验收 |

Native 的 `pnpm native:e2e` 与 Web 故事回归作为各自基线；编辑器内帧通道、输入、模式切换和资源生命周期另设集成验收。不能以 Web 通过推断 Native 通过，也不将双模式可用宣称为完整像素一致。

## 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| Electron 变成重型全家桶 | 采用按需启动、独立 worker、预览独立进程和面板懒加载 |
| UI 修改破坏源文件 | 所有写操作经过 editor-core command，生成 diff 并支持撤销 |
| 编辑器和运行时状态混淆 | 预览只读 projection，用户操作统一回到源文件或 pipeline intent |
| Web/Native 目标串线 | 分别消费 active-target manifest，覆盖双向隔离负例；复用已有全目标契约 |
| Native 嵌入延迟或内存过高 | Phase 0 实测真实帧传输和输入回传，使用有界队列及背压，按平台验证优化 |
| 切换模式残留进程或状态 | 会话标识、停止确认、目标存储隔离和过期消息丢弃 |
| 大资源项目卡顿 | 增量索引、虚拟列表、缩略图和上限 LRU 缓存 |
| 预览协议与运行时能力不匹配 | 协议版本化，保持 capability negotiation 和明确的兼容错误 |
| Electron 升级引入回归 | 固定版本、独立 smoke fixture、安装包启动和预览回归 |
| 首版变成全功能 IDE | 先锁定项目打开、脚本、故事图、资源、预览和构建闭环，其余能力延后 |

## 第一批实现任务

1. 创建 `packages/editor/core` 的 contracts、项目刷新和 preview protocol。
2. 把现有 `@quajs/project-inspector` 接入共享索引，禁止 Electron 和 VS Code 各自扫描项目。
3. 实现内置 Web/Native 预览适配器与会话协议；先验证 Native 产品链持续帧输出和输入回传。
4. 创建最小 Electron 窗口，实现项目打开、QuaScript 编辑、诊断和同一面板内的双模式预览切换。
5. 用 Demo 和一个大资源 fixture 分别测量 Web/Native 启动、索引、预览、切换、停止和构建内存。
6. 根据性能数据决定资源浏览器、故事图和舞台预览的加载策略，再扩展可视化编辑功能。

## 完成定义

计划达到以下条件后，才把 Electron 编辑器视为首个可用版本：

- 用户可从项目创建一路完成场景编辑，并在编辑器内分别使用真实 Web、Native 运行链预览、定位错误和构建 QPK。
- 两种模式都支持面板内持续显示、交互和 resize；单独弹出外部 native 窗口不算完成。
- Electron 未运行预览时不会常驻游戏运行时或完整资源解码器。
- 取消构建、停止预览、Web/Native 模式切换、切换项目和关闭窗口都会释放后台任务与资源，丢弃旧会话消息。
- 诊断、故事节点、资源引用和 package provenance 在 Electron 与 VS Code 中一致。
- Web、Native 构建的 target core isolation 通过双向正例和负例 fixture；改动共用打包链时通过仓库已有全目标隔离回归。
- 双模式预览验收矩阵通过；Native capability 缺口和嵌入通道的测量结果明确记录。
- 真实 Demo 和大资源项目的性能数据已经记录，且没有把自动化 smoke 误称为完整用户体验验证。

## 2026-09-18 editor interaction pass

- Settings panel persists validated local preferences for font size, indentation, spaces/tabs, wrapping, line numbers, minimap, format on save and Native preview FPS.
- Source editing now uses one Monaco instance with multiple document models, per-tab dirty/view/undo state, 24-tab/24 MiB bounds, save-all and close protection. The redundant breadcrumb row was removed.
- Web and Native preview controls expose authenticated `status`, `step` and AST-position `seek` commands. Seek restores an engine checkpoint and runs the story through the existing pipeline; Native receives only a bounded editor intent and never arbitrary JS evaluation.
- Preview frames are throttled (default 15 FPS) and paused when hidden. Shortcuts cover save, save-all, close/switch tab, undo/redo, settings, format, run/stop, single-step and seek-to-cursor.
- Added `tabs-smoke.mjs` fixture for multi-tab/settings behavior. Actual embedded Web and Native Demo AST-position seek (step 3) and F10 (step 4) passed, together with Native title/settings/story pointer input, mode replacement, cancellation and process cleanup.

### 本轮验收结果

- Core 7、Electron 20、language-server 38、project-inspector 10、script-compiler 174 项测试通过；相关六个包与 Demo typecheck、UI/Electron 构建和 editor lint 通过。负载较高时部分测试曾超时，单 worker 重跑全部通过。
- 实际 Electron 的 tabs/settings、Git、workspace smoke 通过：多文档草稿和撤销隔离、保存全部、关闭保护、偏好与缩进持久化、磁盘刷新、版本冲突与删除缓冲区保护均已覆盖。
- 实际内嵌 Web/Native 源码定位及单步通过；Native 修复隐藏宿主在帧计时器到期后收不到系统重绘的问题。离屏渲染上限 30 FPS，展示默认 15 FPS，设置/隐藏时暂停取帧。Rust editor control/frame 3 项、product-window 7 项测试通过。
- Demo 后台静态检查 15/15 完成，0 错误；保留 `ending-handoff.qs:122` 的一条已有空行样式警告。
- Seek 使用 `@quajs/editor-core/runtime` 可选开发入口：先恢复基线 checkpoint，再运行所选文件的注册脚本工厂，遇到选择暂停。不会推断此前章节的分支变量；需要此类状态的项目应提供适合场景的基线。
- 本轮双模式开发进程树 RSS 样本：编辑器 645 MiB、Web 1422 MiB、Native 721 MiB、停止后 564 MiB；样本受本机其他任务负载影响，包含共享页重复统计，不作为发布性能预算达标证明。未重跑完整 Native E2E 或生产 Web 全剧情回归；内嵌交互不代表像素一致、音频听测或跨平台验收。

补充 Web 画面验证直接捕获子 WebContentsView（macOS 的窗口 capturePage 可能遗漏该子视图），确认单步后的实际对白和背景已渲染，截图 `.codex-tmp/editor-smoke/web-seek-game.png`。该独立 Web 复测进程树 RSS 为 980 / 1968 / 1158 MiB（编辑器 / Web / 停止），与上述双模式样本有明显波动；发布构建和稳定环境的内存／长期运行评估仍待完成。

## Git interaction refinement

- Replace the unsaved-document IPC exception with a native save-all / keep-drafts / cancel decision and structured switch results. Cancel is informational; overwritten local changes produce a warning. Normal Git switch can carry safe uncommitted changes; force checkout and automatic stash remain out of scope.
- Source Control now defaults to a virtualized directory tree with conflict/index/worktree groups, natural folder sorting, status colors and letters, full-path diff and stage actions, fuzzy filtering, persistent tree/list preference and ARIA keyboard navigation.
- Reference: VS Code `extensions/git/src/commands.ts` checkout handling and official Source Control documentation. Tests use temporary repositories; no user branches or commits are changed.
- Validation: 7 core and 23 Electron tests, all three editor typechecks, core/UI/Electron builds and editor lint passed. Real Electron Git smoke covers save/keep/cancel, a draft preserved when the target branch changes the same file, blocked checkouts, tree/list filtering, keyboard navigation, bounded DOM, index-only commit and external branch refresh. Service tests also cover overwritten untracked files. macOS watcher tests allow native notification batching before the existing debounce; no polling or extra watchers were added. Screenshots: `.codex-tmp/editor-git-smoke/`.
- The shared virtual list passed the 1200+ file workbench smoke again: file navigation/search, image decoding, asset grid/list, media cleanup and imports. This run rendered 22 file-tree rows and 48 asset cards, with a 2457 ms development opening sample; it is not a release performance guarantee.

## 自定义桌面标题栏

- Electron 窗口采用 `frame: false`，工作台顶部保留单条 36px 自定义标题栏。macOS 左侧为三色关闭／最小化／全屏按钮，Windows 右侧为最小化／最大化还原／关闭按钮；拖动区域排除按钮，双击缩放。
- 窗口按钮经过有限 IPC 命令和主 frame 身份检查。最大化、全屏及焦点从宿主事件同步，不增加轮询；关闭复用未保存提示和现有预览／子进程清理。
- macOS 保留全局应用菜单；Windows 隐藏窗口内的原生菜单栏，通过自定义按钮或 Alt+M 打开同一菜单，保留命令快捷键。
- macOS 实际 Electron window smoke 已通过无系统标题栏几何检查、按钮排列和拖动排除、最大化还原、最小化还原、全屏退出、非法 IPC 拒绝、未保存关闭保护及设置快捷键。截图：`.codex-tmp/editor-window-smoke/macos-titlebar.png`。Windows 尚未在目标系统实测；原生拖动、边缘缩放及 Windows Snap 体验仍需跨平台人工验收。
- 30 项 core/electron 测试、三个包 typecheck、core/UI/Electron 构建和 editor lint 通过。真实 Demo Web smoke 通过：嵌入画面／设置输入、资源图像解码、面板缩放后的 WebContentsView 边界、源码定位／F10 单步、设置遮挡与停止释放均正常；没有编辑器页面错误。本次未改 Native runtime，也未重复 Native E2E。

## 资源管理器文件操作与 Quick Open

- Ctrl/Cmd+F 在资源管理器内聚焦文件筛选，在编辑器内保留文本查找；Ctrl/Cmd+P 打开独立悬浮 Quick Open，支持模糊路径、最近打开、方向键选择以及 `:行:列` 定位。复用共享项目索引，60 ms 防抖，最多 100 个虚拟化结果。
- 工具栏和原生右键菜单支持新建文件／文件夹、剪切／复制／粘贴、重命名、复制相对路径、系统定位和确认移至废纸篓；支持 F2、Shift+F10、复制粘贴与删除快捷键。内部拖拽移动支持文件夹展开、边缘滚动和拖至项目根标题。
- Worker 串行执行文件操作，校验项目根、路径、链接、保留名称与目标冲突。复制使用排他写入并限制 20000 项／10 层／1 GiB；部分失败保留已复制内容供用户处理。移动在校验后使用文件系统 rename，仍存在外部进程并发改动的竞争窗口。
- 重命名文件和父文件夹会更新打开文档与语言服务的路径，同时保留 Monaco model、草稿、撤销栈及磁盘版本校验。删除保留打开缓冲区并阻止保存至已消失的路径；缺失文件不继续发起语言服务请求。项目清单改名导致配置失效时，文件索引仍可刷新并恢复操作。
- Quick Open 与命名对话框会遮挡 Web 预览并暂停 Native 帧读取；接受结果后保留新文档焦点。操作仍以磁盘文件为准，不复制未保存文本，不自动重写引用；文件操作撤销、多选、外部拖入待后续实现。
- 验证：34 项 core/electron 测试、三个包 typecheck、core/UI/Electron 构建和 editor lint 通过。实际 Electron explorer smoke 验证快捷键、悬浮过滤和行列跳转、原生菜单回调、新建、复制剪切粘贴、实际 HTML 拖拽、文件与父文件夹改名、撤销／格式化／保存到新路径，以及取消／确认系统废纸篓和草稿保护。原生菜单选择及确认回答由测试注入，文件操作与系统废纸篓为真实临时项目操作。
- 原有 workspace smoke 的补全／悬浮信息／F12／格式化、磁盘冲突、删除保护和 watcher 切换通过。1200 多文件 workbench smoke 通过，开发打开样本 906 ms，树 23 行 DOM、资源 48 张卡片；该样本不代表发布版性能保证。截图在 `.codex-tmp/editor-explorer-smoke/`。

## Source Control 与 Diff Tab 视觉整理

- Source Control 顶部改为紧凑工具栏：分支、视图模式、折叠和刷新图标保持同一行且统一为 22px；分支名称继续显示在底部状态栏，避免单独的大型切换分支按钮占据一行。
- 提交说明改成单一自动增高输入框，右侧使用紧凑提交图标，支持 `⌘/Ctrl+Enter`；无暂存内容、冲突或忙碌时禁用，避免全宽绿色按钮造成视觉噪声。分支 picker 改为工具栏下方的两行小面板。
- 工作树／暂存区差异现在是真正独立的 Diff Tab，与文件编辑 Tab 分开；可以同时保留多个差异、切换、刷新、打开源文件或关闭。差异使用共享只读 Monaco diff editor，最多保留 12 个差异 Tab。
- Git smoke 已重新通过：提交、分支取消／保存／保留草稿、分支阻塞提示、树／列表、过滤、键盘导航、虚拟化、外部 Git 刷新和 Diff Tab 均通过。截图更新于 `.codex-tmp/editor-git-smoke/`。
- 实际 Demo Web smoke 通过：画面及设置输入、媒体解码、面板缩放、引擎 checkpoint 定位／F10 单步、Quick Open 遮挡及关闭后恢复、停止释放均正常，未出现编辑器页面错误。本次未修改 Native runtime，未重跑 Native E2E 或 Windows 实机验证。

## 预览窗口、CDP Inspector 与保存后重载

- Web 和 Native 均支持独立预览窗口、全屏及返回编辑器。移动 WebContentsView 或切换 Native 帧消费者，保留同一会话和当前播放位置；独立窗口不加载 Monaco。Escape 退出全屏；macOS 使用 simple fullscreen，Windows 仍待目标系统验收。预览工具栏现使用单行紧凑图标，Web/Native 位于最右；在 240px 最小宽度隐藏冗余标题，保留全部操作。
- 底部 Inspector 使用统一 CDP 接口：Web 为真实 DOM；Rust 为当前 QUI overlay 层级与其余绘制命令。支持过滤、展开、虚拟列表、键盘选择以及属性／位置／尺寸／样式；这是只读检查器，不是完整 Chrome DevTools。Native 节点 ID 在相同元素的连续快照间保持稳定。
- Native 新增 CSS.getComputedStyleForNode、真实层级 DOM 查询及 Qua.getDiagnostics。Qua.editorCommand 等待引擎通过现有 pipeline/host bridge 返回的完成结果，不再以 stdout 作为回复通道；没有引入任意脚本求值或渲染器状态写入。原始 GPU 帧继续使用单请求 QUAF/RGBA 二进制传输。
- 复用共享项目索引、220 ms 合并保存事件。Web 通过 CDP Page.reload 刷新；Native 自动重建项目 QuickJS/QPK/目标清单、替换进程，再调用共同的引擎 checkpoint 定位流程。Demo 编辑器模式禁用竞争的 Vite/native 自主 watcher；Native 后续更新跳过重复的工作区包构建。引擎包和 Rust 源码修改仍需要普通重启构建。
- 编译器范围映射保留编辑中的步骤，使用真实 stepIndex（不假设连续）。删除当前步骤或无法可靠定位时回到该文件起点；删除文件或未选中过剧本时回到项目启动状态。选择仍会暂停，不推断旧章节分支；未保存草稿不送入运行时。
- 静态错误、Web 异常／模块加载失败、Native 执行／帧失败提供错误覆盖层、具体详情和刷新。修复保存后自动恢复，旧会话结果不会污染新会话。重载时收到的运行错误不会被完成状态覆盖。
- 性能边界：Inspector 只在可见时每 1.2 秒刷新、无并发；10000 节点／80 层／500 样式上限。Native 错误检查每 1.5 秒一个请求；CDP 有请求数、响应体积和超时限制；没有截图轮询或新文件扫描器。尚未做发布版长期负载评估。
- 已验证：8 项 core、32 项 Electron 测试，三个 editor 包与 Demo typecheck、core/UI/Electron 构建、editor lint 和 diff whitespace 检查。Rust window_smoke 37 项测试通过；完整 native:e2e 通过 253 个对白标识、15 个视觉检查点、选择／设置／章节及 1920×1080 GPU readback。该门禁不等同于 Web/Native 像素一致性或 OS 可见呈现证明。
- 两个目标分别通过真实 Electron `preview-tools-smoke.mjs [--native]`：CDP 层级和属性、Inspector UI 选择、独立窗口／全屏／嵌回、保存后实际画面对白变化、删除当前步骤回到起点、静态与运行错误覆盖层、修复保存恢复和手动刷新。测试临时修改的 Demo 剧本已恢复；截图在 `.codex-tmp/editor-preview-tools/`。相关 editor/native skills 和接入 README 已更新。


## 目录树密度、预览工具栏与默认 Minimap

- 资源管理器、资源文件夹和 Git 树统一 22px 虚拟行高、12px 层级增量，文件和文件夹共用箭头／图标列。淡色层级线仅由 CSS 绘制；同步收紧搜索框与项目标题，不增加扫描器、监听器或轮询。
- 预览运行／重启、停止、单步、到光标、刷新、独立窗口／嵌回、全屏均为紧凑图标按钮，保留禁用状态、悬浮提示、可访问名称和快捷键。模式选择固定在最右；实际 Electron 验证 240px 宽时所有控件无换行、无重叠。
- 源码 Monaco 默认开启 minimap，使用 80 列上限及块状绘制。设置可即时关闭并持久化，尊重已有的 false 偏好，恢复默认重新开启；Diff Editor 仍保留紧凑只读视图。
- 已验证 40 项 core/electron 单测、三个 editor 包 typecheck、UI/Electron 构建和 editor lint。隔离用户配置的 Tabs smoke 验证 minimap 默认／关闭／重载／重置及最小宽度工具栏；Workbench smoke 验证实际嵌套文件／文件夹对齐与虚拟化（1200+ 文件，27 个树 DOM 行、48 个资源卡片）。Git smoke 验证紧凑变更树、暂存和独立 Diff Tab 等交互。
- 实际 Demo Web smoke 通过启动、设置输入、媒体解码、面板缩放、到光标／F10 单步、弹窗遮挡及停止清理，无编辑器页面错误。本轮未重跑 Native E2E 或 Windows 实机检查。截图见 `.codex-tmp/editor-tabs-smoke/compact-toolbar.png`、`minimap.png`、`.codex-tmp/editor-workbench-smoke/tree.png` 和 `.codex-tmp/editor-git-smoke/git-tree.png`。

## Git 树与资源树统一

- Git 变更树现在与资源管理器共享 22px 行高、12px 深度增量、箭头／节点图标列、层级线、选中和 hover 表面；Git 的分组、文件夹和文件都保留同一左边界，状态字母和操作按钮只占右侧列。
- 资源树移除了项目名称／文件数量标题行，搜索框下直接进入文件列表，释放垂直空间。项目名保存在 `#files` 的 `data-project-name` 上供生命周期同步，根目录右键、新建和拖放继续作用于文件树容器。
- Explorer、Git、Workbench、Tabs、Authoring、Preview Tools 和 Demo Web smoke 已切换到新的无标题行同步点；UI/Electron typecheck、UI build 和 editor lint 通过。

## 调试控制台日志高亮

- Debug Console 将受限日志块转成安全的逐行 DOM：Web／Native 来源使用独立色标，错误／警告／成功／调试级别使用低对比度背景和左边框，URL、源文件位置及 `ERROR`／`WARN`／`INFO` 等令牌使用辅助颜色。
- 高亮只属于编辑器 UI，日志 IPC 仍为 `{ identity, message }`，伪元素来源标记不改变 `#logs.textContent`。保留 150 条日志和 64 KiB 可见上限，清空和自动滚动行为不变。


## 预览静音与生命周期修复

- Web / Native 预览和独立窗口共用扬声器图标开关；本次编辑器运行中跨停止、目标切换和热重载保留。Web 在页面加载前设置音频静音；Native 通过启动环境与鉴权 CDP 控制 Rodio 最终输出，不改变游戏音量、播放时间或存档。
- 停止 Web 预览先解除视图归属，再关闭 WebContents；支持重复停止、刷新中停止、独立窗口中停止，以及预览已被外部销毁的情况。销毁后的 WebContentsView 可能没有 webContents，窗口和迟到回调都检查对象存活；素材窗口提前缓存内容 id，避免在 closed 回调访问已销毁对象。
- 面板缩放保持可见虚拟行挂载，避免将已解码缩略图移出再插回 DOM。双击媒体素材打开大窗口，Escape 关闭。
- macOS 实际 Web / Native Preview Tools 验证：静音初始值、嵌入与独立窗口同步、热重载保留，修改“邮件下面附了六张照片”这一行后同一步实际对白更新，替换当前背景文件后实际像素更新并还原，以及删除步骤回起点、错误恢复和停止清理。
- Workbench smoke 验证图片缩放时无 DOM 脱离、素材大窗口和关闭；Tabs smoke 验证新增图标仍在 240px 预览栏内完整排列。42 项 editor 单测、38 项相关 Rust 单测、三个 editor 包类型检查、构建及 lint 通过。没有重跑完整 native:e2e、音频听测或 Windows 实机验收。测试临时修改的剧本和背景已恢复。


## 资源树筛选与搜索焦点

- 文件筛选框默认隐藏，资源树中 Ctrl/Cmd+F 展开并聚焦；Escape（输入框或已筛选的树）和关闭图标清除筛选、收起控件并返回树。项目切换重置控件，Ctrl/Cmd+P 继续独立使用，编辑区 Ctrl/Cmd+F 保留 Monaco 查找。
- 内容搜索与文件筛选统一使用整组控件的单条焦点边框，Quick Open、资源、Git 和 Inspector 搜索去除额外的外圈；保留按钮键盘焦点反馈。
- 全词匹配沿用 ripgrep 词边界能力，按钮采用带边界标记的 ab 图形、明确的可访问名称和示例提示，支持与正则组合。真实 Electron 搜索验证 cat 的 7 个子串匹配在启用后变为 3 个整词匹配，排除 catalog、bobcat、cat_2、cat2。
- Explorer / Workbench 实际窗口检查、42 项 editor 单测、三个包类型检查、UI/Electron 构建和 lint 通过；搜索及 Quick Open 截图在对应 `.codex-tmp/editor-*-smoke/` 目录。


## 故事大纲修复

- [x] 去掉重复标题与普通按钮列表；统一 22px 虚拟树、筛选、折叠、定位当前文件和键盘导航。单场景文件合并冗余层级，多场景保留独立声明。
- [x] 编译器提供 AST 大纲及原始行列，修正缩进装饰器的列号；project-inspector 复用这些范围，去掉声明定位正则，解析失败显式报告。
- [x] 后台共用资源管理器的受限源码索引，排除 `.generated` 历史副本；按章节 id+title 分组，保留分支及文件内声明次序，不推断宿主运行顺序。
- [x] Demo 14 个剧本、93 个节点、12 个选项逐文件核对，10 个章节分组含同编号分支。项目大纲以已保存源码为准，草稿同步待后续实现。
- [x] 真实 Electron 验证 Demo 节点与选项点击跳转、键盘导航、受限 DOM、临时文件多行坐标/保存刷新/解析错误恢复/删除。修正共享 Monaco 规则遗漏缩进分组的异常；大纲元数据按需生成，不增加运行时 QPK 负担。
- [x] 本次验证：267 项编译器/LSP/Inspector/editor 单测、相关包类型检查/构建/lint、真实 Outline/Workspace Electron smoke 通过。Demo 静态检查 0 错误、1 条既有连续空行风格警告。真实 Web/Native 预览均完成引擎定位到 AST step 3、F10 到 step 4、输入交互、切换与停止清理；未重跑完整 native:e2e。


## Inspector 对齐 Elements 元素树

- [x] 用分色标签/属性/文本、闭合行、短文本内联、注释/doctype/shadow-root 替换扁平字符串，统一紧凑 20px 行与 12px 层级。
- [x] CDP 节点 ID 作为选择/折叠身份；正确的左右方向键、递归折叠/展开、父级上下文筛选和可点击层级路径。
- [x] 右侧计算样式/属性分栏，实际尺寸信息；非元素不请求布局，迟到结果不覆盖新选择，同一时间只有一个属性请求。
- [x] 保留虚拟列表与 10000 节点上限，隐藏时取消定时刷新，未改变的快照不重建树 DOM。
- [x] 本次检查：47 项 editor/core/electron 单测、三个 editor 包类型检查、构建与 lint 通过。真实 Web/Native Inspector 验证标签/属性/布局/父级导航，2500 节点替身验证可见 DOM 少于 60 行、选择和折叠不随兄弟插入错位、单个属性请求、隐藏停轮询与停止清理。未改动 Demo 源码/资源或 Native 渲染实现，未运行完整 native:e2e。


## 集成终端与性能

- [x] 底部终端面板、紧凑会话选择与新建/清空/终止操作；Ctrl+反引号、Ctrl+Shift+反引号和原生菜单入口。
- [x] lazy xterm + node-pty，独立按需 utility process；使用项目目录和用户 shell，无 VS Code / devframe 运行时依赖。
- [x] 6 会话、每会话 2000 行回滚、尺寸/粘贴限制；16 ms 批量输出、单个未确认输出包及 native read 背压。隐藏时停止绘制，尺寸合并，最后会话关闭释放服务。固定 xterm 6.0.0 并用 pnpm 补丁修复隐藏时选择区刷新仍重绘的问题，真实 DOM 变更验收为 0。
- [x] 保留 shell 控制键、自然退出码与输出；清理前台/后台作业，覆盖关闭、换项目、重载和编辑器退出。
- [x] POSIX 真实 PTY 单测及实际 Electron 终端验收通过；4 万行后台输出、受限 DOM、可见窗口帧间隔样本保存在 `.codex-tmp/editor-terminal-smoke/`。采样不是完整编辑器发布性能保证。
- [ ] Windows ConPTY 与签名分发验收；shell 配置/任务系统/终端持久恢复留待单独实现。


## Performance 面板与状态栏精简

- [x] 底部 Performance 页签、5 Hz 实时数值和 Canvas 曲线、60 秒/300 点上限、暂停与清空；隐藏停止采样，热重载/切换/停止隔离旧会话。
- [x] Web rAF FPS、目标进程 CPU/RSS、CDP JS 堆；Native 实际提交帧 FPS、帧耗时、实际 Draw Calls 和渲染通道数。
- [x] Native token 鉴权 CDP 快照查询不触发 redraw；sysinfo 在采样线程统计 CPU/RSS，macOS IOKit 系统 GPU 利用率与 Metal 实际统一内存分配；无平台数据时显示不可用。
- [x] 删除检查项目按钮、静态检查完成文字和状态栏开发预览/面板提示，检查状态仅保留最右侧图标与悬浮详情，点击打开问题；Ctrl/Cmd+J 保留。
- [ ] Windows/Linux GPU 利用率提供程序和各自平台实机验收。

## 2026-09-19 Novel Writer 集成

- 整体迁移至 `packages/editor/novel-writer`，保留写作工作流和原用户数据路径；不接入游戏 runtime。
- 活动栏完整切换工作区，保留两边页面/文档/草稿，暂停隐藏的预览读帧和底部可见面板采样。
- 按需启动受认证的本机写作服务和隔离页面；后台生成独立运行，关闭保护、请求中止和检查点恢复接入编辑器生命周期。
- 修正原 Svelte shell 没有观察 rune controller 更新的问题；添加编辑器主题、紧凑三栏和跨启动新建项目草稿保存。
- 验收包含原有 writer 单测与实际 Electron 临时数据流程；真实 DeepSeek/Tavily 调用、Windows/Linux UI 和签名安装包另行验收。

## 2026-09-19 Terminal 视觉调整

- 底部终端改为 VS Code 风格的会话标签栏和右侧紧凑操作组，隐藏表单式会话选择器但保留 DOM 兼容性。
- xterm 使用 Dark+ 色板、等宽字体、bar cursor、选区色和键盘标签导航；不改动 PTY 背压、尺寸同步、隐藏面板性能或进程树清理。
- 过滤失效的 POSIX shell 启动变量，避免新终端显示 inherited environment 的无关错误。真实 terminal smoke 继续作为门禁。
