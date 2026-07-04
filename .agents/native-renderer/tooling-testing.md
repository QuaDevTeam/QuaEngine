# 语言服务器、VSCode、测试与验收

## 工具链边界

native authoring 工具要独立于现有 QuaScript 工具链：

- 不改造 `packages/build/language-server`
- 不改造 `packages/build/vscode-quascript`
- native UI 另起独立 LSP 进程和独立 VSCode plugin

建议新增：

- `packages/native/ui-compiler`：已落基础，负责 QUI/QSS parse、validate、format、completion、hover 和 registry。
- `packages/native/language-server`：已落基础，负责 `.qui/.qss` 的独立 LSP 适配，包括 diagnostics、formatting、completion、hover、definition、document links、component/class/id references、QUI/QSS package-relative asset reference links 和 package bin 默认 stdio 启动。
- `packages/native/vscode`：已落基础，负责 VSCode language contribution、grammar、snippets、format/validate/restart commands 和 native LSP 启动。
- `packages/native/benchmarks`：已落基础，负责 native authoring/tooling 的确定性 smoke benchmark，输出 JSON Lines baseline。

这些工具只做 authoring，不加载 Web/Cocos/native target core bootstrap，也不解析普通 game plugin 列表。它们可以读取平台无关 contracts / registry / manifest schema，但不能把 Web、Cocos、Native 三套核心插件合并成一个编辑器运行时。source-level isolation 测试必须同时扫描源码 import/export/dynamic import 和 `package.json` 的 `dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies`，确保 LSP、VSCode extension、benchmark、UI compiler 不会直接依赖 `@quajs/renderer-web`、`@quajs/renderer-cocos`、`@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native` 或其他 target core adapter。

LSP 的资源链接解析分两层：project-index 只建立包内相对资源候选，不扫描文件系统；LSP server 在响应 `textDocument/documentLink`、发布 diagnostics 和生成 code actions 时可以对 `file://` asset candidate 做只读存在性检查，让未打开的图片/音频/视频/字体资源也能跳转，并对确认缺失的 `Image(src|image)` / QSS `asset(...)` 资源发出 `NATIVE_UI_ASSET_MISSING` warning。对应 quick fix / `source.fixAll.quaNativeAssets` 只能移除缺失或无效资源引用，不能自动创建文件、扫描 workspace、加载资源、解析普通 plugin 或触发 target core bootstrap。

## Language Server 设计

LSP 的职责是同一套语义在不同入口下复用：

- parse
- validate
- format
- symbol index
- completion
- hover
- definition
- references
- rename
- code action
- semantic tokens

### 分层

1. `project-index`
   - 文件
   - 资产：QUI `src` / `image` 字面量和 QSS `asset("...")` / `asset("...", "kind")`，只接受包内相对路径，拒绝 URL、绝对路径和 `..`
   - tokens
   - QPK manifest
   - component registry

2. `languages/qui`
   - template AST
   - prop / slot / action diagnostics
   - completions
   - formatting

3. `languages/qss`
   - selector / property validation
   - diagnostics
   - formatting

### completion / hover 重点

QUI 侧：

- built-in elements
- local/imported components
- directive names
- props / slots
- readonly view paths
- settings paths
- action descriptors
- asset refs：`Image(src: "...")`、`image: "..."` 和 asset document links

QSS 侧：

- selectors
- properties
- property value completions / hover metadata from the shared native QSS registry
- tokens
- style parts
- class / id references
- `background-image: asset("...")` 资源引用索引和 document links

## VSCode 插件

建议独立 package，语言 id 可用：

- `qua-ui` for `.qui`
- `qua-style` for `.qss`

至少要提供：

- TextMate grammar
- language configuration
- snippets
- command: validate / format / restart LSP
- command: fix all invalid/missing native UI asset references by applying the LSP `source.fixAll.quaNativeAssets` action for the active `.qui` / `.qss` document
- diagnostics panel

后续增强：

- project surface tree
- token / asset / style reference view
- component registry browser

## 验证策略

## 统一验证入口

根目录提供 `pnpm native:verify` 作为 native 核心回归入口。它按顺序运行 native contracts、engine-native、assets-native、store-native、native-ui-compiler、native-language-server、native VSCode extension test/typecheck/build、native benchmarks，以及 Rust `quajs_native_runtime`、`quajs_wgpu_renderer`、`quajs_native_app` 的格式与测试检查。

默认 Cargo target 目录为 `.codex-tmp/native-cargo-target`，以免污染源码目录或复用系统级 target。可按需要使用：

- `pnpm native:verify --ts-only`
- `pnpm native:verify --rust-only`
- `pnpm native:verify --no-bench`
- `pnpm native:verify --no-window`

CI 可以把这个入口作为 native lane 的主命令；如果磁盘紧张，可以先跑 `--ts-only --no-bench`，再在有足够 Cargo 空间的 runner 上跑完整 Rust/wgpu/QuickJS lane。

### contracts tests

先保证这些纯 TS 约束稳定：

- target bootstrap isolation
- ordinary plugin list target-core isolation
- target bundle manifest validation
- Web / Cocos / native 三目标隔离矩阵：bootstrap core、plugin target entry、Runtime QPK renderer/executable dependency 三层都要对称验证
- target-specific renderer plugin entry 隔离：Web renderer subentry、Cocos renderer subentry、Native bridge/capability entry 只能出现在对应目标产物里；所有进入 `target-bundle-manifest.json` 的 renderer entry 必须显式声明 `target`，缺失或跨目标都要失败
- 产物级核心插件互斥：Web、Cocos、Native 打包输出必须各自只含一个 target core family；如果项目配置、普通插件、shared preset、Runtime QPK、renderer entry、debug shell、installer/updater manifest 或 post-bundle graph 中任一层混入另一个 target core family，必须失败而不是降级为 warning
- debug / release / installer / updater / hand-built shell 统一复用同一套 target isolation helper，不能只在 Quack 主路径校验
- native compatibility metadata
- runtime package native code rejection
- host info / capability hash consistency

### compiler tests

- `qui` parse fixtures
- `qss` parse fixtures
- invalid syntax recovery
- component registry validation
- QUI asset validation：`src` / `image` / `asset-type` 必须复用 compiler shared asset helper，拒绝 URL、绝对路径、`..` traversal 和非字面量资源表达式，并确认 projection 不输出不安全 image 资源
- QSS safe color validation：`background-color`、`border-color`、`color` 必须复用 resolved style parser 语义，只接受 safe native color literal 子集，并对 `url(...)`、路径字符串、traversal、越界 `rgb(...)` channel、格式错误的 `rgba(...)`、任意 CSS color function 发出 `QSS_INVALID_VALUE`；resolved style IR 必须剪掉这些无效字段
- native UI surface compatibility derivation：从 analyzed QUI/QSS 文档派生 `quiComponents`、`qssFeatures`、`assetKinds`，确认输出固定包含 `native-wgpu.ui.surface@1`、`qui` / `qss` / `tokens`、`nativeCode: false`，并且不会自动声明尚未实现的 `native-wgpu.audio@1`
- AST / IR snapshot
- format idempotence

### LSP tests

- completion
- hover
- document links
- QUI/QSS asset reference indexing: `Image(src|image)`、QSS `asset(...)`、resolved/missing asset document links、missing asset diagnostics、unsafe URL/absolute/traversal path ignored
- LSP process documentLink: unopened `file://` asset candidates resolve only when the referenced file exists on disk, without importing target runtimes or scanning plugin graphs
- definition
- references
- rename
- code actions: `NATIVE_UI_ASSET_MISSING` / `QUI_INVALID_ASSET_REFERENCE` quick fix 和 `source.fixAll.quaNativeAssets`，仅移除问题资源引用，不创建资源文件
- incremental sync
- process smoke: package bin 启动、initialize、didOpen diagnostics、completion、hover、documentLink、references

### runtime tests

- QuickJS module loader
- manifest validation
- native runtime package guard：除 `scripts` / `scenes` / `plugins` / `storeMigrations` 和 bundle asset manifest 外，还必须扫描动态 UI / media / resource metadata 的资源字段，例如 `assets`、`resources`、`surface`、`style`、`tokens`、`qui`、`qss`、`audio`、`video`、`image`、`poster`、`fallbackImage`、`assetName`、`module`、`path`、`relativePath`、`src`、`name`、`url`、`uri`、`href`。测试要覆盖 metadata 中隐藏的 traversal、remote URL、`.wasm` / `.node` 等 native payload，并确认普通 `packageName`、`versionRange`、`capabilities`、`capabilityIds`、`qssFeatures`、`quiComponents` 不会被误认为 asset reference。
- target bundle startup checks
- Rust JSON facade resolved color validation：`RichTextStyle.color`、`UiSurfaceResolvedStyle.backgroundColor`、`borderColor`、`color` 必须在 frame preparation 前拒绝 URL / URI、路径、traversal、native payload 后缀和 malformed safe-color syntax；该校验只能消费 resolved JSON，不能引入 QSS parser、selector matching 或 cascade
- Rust JSON facade stage input validation：`NativeRendererJsonFrameInput.layout` 和 `.container` 必须在 frame preparation 前拒绝不安全 bridge 输入，包括非有限、非正数或超限的 layout/container `width` / `height`，非有限、非正数或超限的 `aspectRatio` / `minAspectRatio` / `maxAspectRatio`，`minAspectRatio > maxAspectRatio`，非有限、非正数或超限的 `devicePixelRatio`，以及非有限、负数或超限的 safe-area inset。测试要覆盖 negative layout dimension、inverted aspect interval、oversized DPR、negative safe-area inset，并确认失败后 renderer revision / frame 不前进。该校验只保护 native app / QuickJS JSON bridge 输入；不要把它扩展成 Rust 侧 QUI/QSS parser 或 authoritative layout state。
- Rust JSON facade resolved UI geometry validation：`UiSurfaceNodeProjection.bounds.x/y/width/height` 和 `scrollOffsetX` / `scrollOffsetY` 必须在 frame preparation 前校验为有限 logical stage 数值；`width` / `height` 必须非负并在 native renderer 上限内；scroll offsets 也必须在上限内。该测试要覆盖 negative dimension、non-finite value、oversized coordinate / dimension / scroll offset，并确认失败后 renderer revision / frame 不前进。该校验只能消费 resolved projection JSON，不能把 QUI/QSS parser、selector matching、cascade 或 renderer-owned layout state 放进 Rust。
- Rust JSON facade resolved UI style number validation：`UiSurfaceNodeProjection.opacity`、`UiSurfaceResolvedStyle.opacity`、`backgroundPosition`、`borderRadius`、`borderWidth`、`fontSize`、`letterSpacing`、`lineHeight` 和 `padding` 必须在 frame preparation 前校验为安全数值；opacity / background position 只能是有限 `0..=1` normalized value，逻辑数值必须有限、非负且在 native renderer 上限内。测试要覆盖 node/style opacity 越界、background position 越界、negative style number、oversized padding，并确认失败后 renderer revision / frame 不前进。Rust 只能拒绝 malformed resolved JSON，不能在这里解析 QSS、执行 cascade 或把 clamp 当成输入契约。
- Rust JSON facade resolved UI text validation：`UiSurfaceNodeProjection.text` 必须在 frame preparation 前校验为安全 payload，限制单节点 UTF-8 字节数并拒绝不支持的控制字符。测试要覆盖 control-character text 和 oversized text，并确认失败后 renderer revision / frame 不前进。该路径只保护 button/text draw params 和未来 glyph layout 输入，不能把 Rust 变成 QUI content model、文本插值、本地化或 rich text authoring validator。
- Rust JSON facade resolved dialogue / rich-text payload validation：plain dialogue text、speaker text、rich-text span text 和 `rich_text_to_plain_text` 合并后的总字节数都必须在 frame preparation 前校验为安全 payload。测试要覆盖 plain text control character、span text control character 和 aggregate oversized document，并确认失败后 renderer revision / frame 不前进。该路径只保护 `TextDrawParams` / glyph layout 输入，不能把 Rust 变成 dialogue authoring policy、本地化、插值或 rich-text syntax validator。
- Rust JSON facade resolved UI intent metadata validation：`UiIntentProjection.metadata` 会进入 native host `NativeRendererIntent.payloadJson`，因此 metadata key 必须复用 safe dispatch identifier 规则，metadata payload 必须限制 entry 数、字符串大小、总估算字节、array/object fanout 和嵌套深度。测试要覆盖 path/native-payload-like metadata key、oversized metadata payload，并确认失败后 renderer revision / frame 不前进。该路径只保护 native intent payload 边界，不能把 Rust 变成业务 action parser。
- Rust JSON facade resolved z-order validation：`BackgroundLayerProjection.zIndex`、`CharacterProjection.layer`、`UiOverlayProjection.stackPriority/zIndex`、`UiOverlaySceneShellProjection.stackPriority/zIndex` 和 `UiSurfaceNodeProjection.zIndex` 必须在 frame preparation 前校验为 native renderer 安全范围。测试要覆盖 oversized background layer zIndex、oversized / undersized character layer、oversized overlay stackPriority、oversized UI node zIndex，并确认失败后 renderer revision / frame 不前进。`RenderGraph` 内部排序还要有极端 `i32` zIndex 不溢出的单测作为 defense in depth，但 JSON bridge 不能依赖 saturating arithmetic 接受 malformed 输入。
- Rust JSON facade resolved dialogue / rich text number validation：`RichTextStyle.fontSize` 和 `lineHeight` 必须在 speaker style、document style 和 span style 上进入 frame preparation 前校验为安全数值；这些值必须有限、大于 0 且在 native renderer 上限内。测试要覆盖 speaker `fontSize`、document `lineHeight` 和 span `fontSize` 的非法值，并确认失败后 renderer revision / frame 不前进。该路径只消费 resolved rich text projection，不能让默认 typography fallback 掩盖 malformed 输入。
- Rust JSON facade resolved background / video number and origin validation：`BackgroundProjection` 和 `BackgroundLayerProjection` 的 `x/y`、可选 `width/height`、`scale`、`rotation`、`opacity`，以及 `BackgroundVideoProjection.opacity` 必须在 frame preparation 前校验为安全数值；坐标必须有限并在上限内，尺寸必须有限、非负且在上限内，scale 必须有限、大于 0 且在上限内，rotation 必须有限并在上限内，opacity 只能是有限 `0..=1` normalized value。`BackgroundProjection.origin`、`BackgroundLayerProjection.origin` 和 `BackgroundVideoProjection.origin` 只接受已解析 native origin 子集：`left|center|right`、`top|center|bottom` 或 `0%..100%` 百分比的一/二轴组合。测试要覆盖 negative background dimension、invalid layer scale、oversized layer rotation、invalid video opacity、越界百分比 origin、路径/traversal origin 和 URI scheme origin，并确认失败后 renderer revision / frame 不前进。该路径只保护 background layout、image/layer transform 和 video poster/fallback projection，不能声明真实 video decode capability，也不能把 Rust 变成 QSS parser 或 clamp malformed projection。
- Rust JSON facade resolved character number validation：`CharacterProjection.position` 的 `x/y`、`xPercent/yPercent`、可选 `width/height`、`scale`、`rotation`，以及 `CharacterProjection.opacity` 必须在 frame preparation 前校验为安全数值；坐标、百分比和 rotation 必须有限并在上限内，尺寸必须有限、非负且在上限内，scale 必须有限、大于 0 且在上限内，opacity 只能是有限 `0..=1` normalized value。测试要覆盖 negative character dimension、invalid scale、invalid opacity、oversized rotation，并确认失败后 renderer revision / frame 不前进。该路径只保护 character draw command planning、resource ids 和 package-aware metrics，不能把 layout fallback 当成 malformed projection 的输入契约。
- Rust JSON facade resolved audio number validation：`AudioTrackProjection.volume` 必须在 frame preparation 前校验为有限 `0..=1` normalized value，`memory.bufferCpuBytes` / `streamCpuBytes` / `handleCpuBytes` 必须在 native renderer 上限内。测试要覆盖越界 volume、超限 memory estimate，并确认失败后 renderer revision / frame 不前进。该路径只能保护 audio projection/resource planning、memory metrics 和 package unload blocker；不能因此声明 `native-wgpu.audio@1` 或真实 playback 能力。
- shared TS/Rust renderer fixtures: `packages/native/test-fixtures/renderer/qui-qss-surface-frame.json` 必须保持为 resolved projection JSON。`@quajs/native-ui-compiler` 测试需要证明该 fixture 的 `surface.root` 可由 QUI/QSS compiler 输出得到，并携带动态包 `provenance`；还要通过 `collectNativeUiSurfaceProjectionRequirements` 从 resolved projection 反推 QUI component、QSS feature、asset kind、intent event 和 projection field 需求，确认 native-wgpu registry 覆盖当前共享 fixture，并确认 `visible`、`opacity`、`scrollOffsetX`、`scrollOffsetY`、`provenance` 这类已解析 projection 字段不会被误归类成 QSS feature；`quajs_wgpu_renderer` 测试需要通过同一 fixture 的 `NativeRendererJsonFrameInput` 路径完成 prepare/render、资源请求、intent hit-test、资源账本 provenance 和 unload blocker 验证；`quajs_native_app` renderer smoke unit / CLI 测试也应复用这份 fixture 验证 native app 到 renderer JSON facade 的宿主接线。该 fixture 不能引入 Rust 侧 QUI/QSS parser，也不能进入 Web/Cocos target core 路径。
- native app renderer smoke: 设置 `QUA_NATIVE_RENDERER_SMOKE_FRAME` 指向已解析 projection JSON，启动 `quajs_native_app` 后必须完成 `NativeRendererJsonFrameInput` -> `NullNativeRenderBackend` 的 frame submit，并输出人读 revision / pass / batch / command / resource 摘要以及机器可读 `Qua native renderer smoke json: ...` 行。JSON 行至少包含 `missingResourceCount`、`fallbackCount`、`videoFallbackCount`、`fallbacksByOwnerPackage.*`、`fallbacksByRequiredPackage.*`、`textureUploadRequestCount`、`textureUploadPendingRequestCount`、`textureUploadResidentResourceCount`、`textureUploadOrphanedResidentResourceCount`、`declarativeAssetRequestCount`、`declarativeResourceCount`、`memory.totalBytes`、`declarativeMemory.totalBytes`、`audioMemory.totalBytes`、`memoryByKind.*.memory.totalBytes`、`memoryByPackage.*.(ownedMemory|dependentMemory).totalBytes`、`declarativeMemoryByPackage.*.(ownedMemory|dependentMemory).totalBytes`、`audioMemoryByPackage.*.(ownedMemory|dependentMemory).totalBytes` 和 audio 资源/track 计数，供 CI / benchmark 做回归比较。texture upload sync 字段来自 `NativeRendererFrameResult.texture_upload_sync`，用于证明宿主能区分 pending / resident / orphaned texture 资源。真实 host/app texture sync 由 `quajs_native_app::texture_sync` 单独覆盖：测试必须证明 pending request 会 owner-first 解析 mounted bundle、通过 `NativeHostApi::read_asset_bytes` 读取 package-relative bytes、向 upload sink 传入 package-aware metadata、拒绝 unsafe asset/package reference、缺资源时不上传、resident texture 不重复上传、frame update 的 `host_cleanup` texture / decoded-image records 会在当前 frame submit 前通过 sink release hook 释放、orphaned resident texture 会通过 sink release hook 释放、release failure 会进入 sync report，以及 `render_frame_with_host_texture_sync` 在上传成功后重提交同一 prepared frame、上传失败或已 resident 时不重提交、只有 release/cleanup 时刷新或保留 post-cleanup texture sync snapshot 但不重提交。`render_json_frame_with_host_texture_sync` 必须先通过 `NativeRendererJsonFrameInput` / Rust JSON facade 校验 resolved JSON，再进入 host texture sync；测试要覆盖有效 JSON 会上传并重提交，以及 unsafe resolved asset ref 在 host read 前失败。默认 Null-backend smoke 仍只报告 readiness，不执行真实上传。设置 `QUA_NATIVE_RENDERER_SMOKE_BUDGET` 时，预算 JSON 字段必须严格校验，并对 frame/backend command complexity、declarative asset/resource counts、resource package/kind counts、fallback package count、texture upload request/sync、总量、资源 kind、package owned/dependent、declarative package 和 audio package 内存执行上限门禁；CLI 端到端测试必须覆盖这些 scalar / map 字段的通过和失败路径，而不只测总量或 video fallback。该路径只消费 resolved projection JSON，不加载 QUI/QSS authoring parser、普通 plugin resolver、Runtime QPK executable dependency 或 Web/Cocos/native target core bootstrap 列表。
- native host cleanup texture release tests: `quajs_native_app::texture_sync::sync_texture_releases_from_host_cleanup` 必须覆盖混合 `NativeRendererHostCleanupRecord` 输入，只对 `Texture` / `DecodedImage` 记录调用 sink release hook，`UiAst` / `QssStyle` / `TokenTable` 等 declarative 或非纹理记录必须进入 ignored 列表；已经不存在的纹理句柄进入 missing 列表但不让 report 失败；sink release failure 必须进入 `release_failures` 并让 report 非 OK。`release_package_resources_with_host_texture_cleanup` 必须证明 package release 成功时 renderer ledger 和 resident texture handle 一起释放，unload blocker 存在时不释放 ledger 也不清 resident handle；`clear_renderer_with_host_texture_cleanup` 必须证明 renderer clear 会释放所有 texture / decoded-image handles 并忽略 declarative records。该测试路径不能读取 host asset bytes，也不能加载 Web/Cocos/native target core bootstrap。
- mounted bundle lifecycle texture cleanup tests: `NativeTextureBundleMountRegistry` 首次同步只建立 host mounted bundle baseline，不能释放 renderer 资源；后续 `sync_mounted_texture_bundle_lifecycle_from_host` 发现 package 从 `NativeHostApi::list_mounted_bundles` 消失时，必须调用 renderer package release 和 host texture cleanup，并释放对应 resident texture handles；如果 package unload 被 active renderer guard 阻塞，registry 必须保留该 package id 并在下一次 lifecycle sync 重试，不能静默丢弃资源句柄。还必须覆盖 `render_frame_with_host_texture_lifecycle_sync` 的产品 loop 顺序：先执行 frame render + host texture sync 释放当前 projection 不再引用的 stale texture，再执行 mounted bundle lifecycle cleanup；这样已从当前 projection 消失的 runtime package 资源不会被旧帧引用误判为 unload blocker，也不会被重复释放。该测试路径只使用 host mounted bundle metadata 和 renderer resource ledger，不加载 QuaAssets、Web/Cocos/native target core bootstrap 或 Runtime QPK executable dependency。
- native window renderer smoke: 在 `quajs_native_app` 启用 Cargo feature `native-window` 后，`QUA_NATIVE_RENDERER_WINDOW_SMOKE=1` 必须能创建 `winit` window、真实 `wgpu::Surface`、surface-compatible adapter/device/queue、real `WgpuNativeRenderBackend`，并渲染已解析 `NativeRendererJsonFrameInput`。`native-window` 必须启用 image decode，使用内存 `NativeHostApi` 为默认 fixture 提供 package-aware UI texture bytes，调用 `render_json_frame_with_host_texture_lifecycle_sync` 完成 JSON facade 校验、frame host cleanup release、pending texture discovery、real WGPU decode/upload、resident texture recheck、上传成功后的 prepared frame 重提交，以及同一产品 loop 顺序下的 mounted-bundle lifecycle sync；这条路径不能读取文件系统、网络或 Runtime QPK executable dependency。resize / scale-factor 事件必须重新配置 surface 并通过 backend resize API 同步 offscreen target；winit cursor / mouse input 必须转换为 native pointer event，默认 fixture 的 one-shot pointer probe 必须通过 `NativeRenderer::pointer_event_and_emit_intent` 向内存 `NativeHostApi` 发出 `ui/intent`；present acquisition 返回 `Lost` / `Outdated` 时必须重新配置当前窗口尺寸并触发 redraw 重试。机器可读 `Qua native window smoke json: ...` 至少包含 `adapterName`、`surfaceFormat`、`presentMode`、`presented`、`presentStatus`、`presentAttemptCount`、`resizeCount`、`surfaceRecoveryCount`、`textureUploadPendingRequestCount`、`textureUploadAlreadyResidentCount`、累计 `textureUploadUploadedCount`、`textureUploadErrorCount`、`textureUploadResubmitCount`、`resubmittedAfterTextureUpload`、`textureLifecycleSyncCount`、`textureLifecycleInitialSyncCount`、`textureLifecycleObservedBundleCount`、`textureLifecycleTrackedPackageCount`、`textureLifecycleBlockedPackageCount`、`textureLifecycleReleaseAttemptCount`、`textureLifecycleReleasedPackageCount`、`textureLifecycleTextureCleanupErrorCount`、`pointerEventCount`、`pointerDispatchCount`、`pointerIntentEmitCount`、`pointerProbeCount`、`pointerLastIntentType`、`lastResizePhysicalWidth` / `lastResizePhysicalHeight`、logical/physical dimensions、`passCount`、`commandCount` 和 `submittedCommandBufferCount`；`textureUploadErrorCount` 必须包含 host read/upload failures、orphan release failures 和 frame host cleanup release failures。可见桌面环境中应看到 `presented=true`；headless、遮挡或不可见窗口环境允许 `presented=false` / `OccludedAfterRetry`，但必须明确报告不能把它当成 swapchain present 验证。测试要覆盖 env gate、container rewrite、window dimension normalization、in-memory texture host fixture、pointer coordinate conversion / button mapping / host intent probe、real texture upload smoke output、window smoke report lifecycle JSON 字段、occluded/timeout retry classification、Lost/Outdated recovery classification 和 `native-window` feature 编译；端到端运行不能加载 Web/Cocos/native target core bootstrap、普通插件、Runtime QPK executable dependency 或 native payload。
- `native.memory_ledger.summary.smoke` benchmark 输出也必须携带 `memoryByKind`、`memoryByPackage`、`declarativeMemoryByPackage`、`audioMemoryByPackage`，以便性能基线能区分普通资源、动态 QUI/QSS/tokens 资源和音频资源的 package 内存压力，而不是只比较总 CPU/GPU 字节。
- renderer capability matching
- resource release / unload cleanup

### packaging tests

- macOS / Windows / Linux metadata
- icon generation
- bundleId / version / buildNumber
- debug / release isolation
- release immutability by version
- Web / Cocos / Native 项目打包链路必须分别从 `web-core-resolver`、`cocos-core-resolver`、`native-core-resolver` 开始，且 core plugin 只能由该 resolver 注入一次；project template、startup shell、debug/release shell、installer、updater、smoke runner、Runtime QPK 和第三方 shared entry 只能读取 active-target manifest，不能二次声明 active core 或携带 inactive core 后过滤
- 多目标打包必须拆成独立 artifact plan；如果 fixture 先构造 `[webCore, cocosCore, nativeCore]`、`allRendererEntries`、跨目标 bootstrap shell 或 umbrella preset 再按 target 过滤，即使最终 manifest 看起来单目标，也必须失败
- `target-bundle-manifest.json` emitted and revalidated
- `target-bundle-manifest.json.projectGraphs` emitted for project-template、startup-shell、debug-shell、release-shell、smoke-runner、installer、updater、dev-server 和 post-bundle graph。非 `post-bundle` graph 只能包含平台无关依赖，任何 Web / Cocos / Native target core root 或 subentry 都必须失败；`post-bundle` graph 可以包含 active core family，但必须拒绝 inactive target core
- Web artifact 排除 Cocos/native core，Cocos artifact 排除 Web/native core，Native artifact 排除 Web/Cocos core；不能只测 native 严格路径
- 三端 resolver fixture 必须分别断言 `web-core-resolver`、`cocos-core-resolver`、`native-core-resolver`，并在 resolver / selected adapters / renderer entries / Runtime QPK executable dependencies 任一项串线时失败
- ordinary plugin list、shared preset、generated plugin resolver、debug shell、release bundle 和 installer/updater manifest 都要跑同一套 target isolation helper，不能只在 Quack 主打包路径校验
- Web / Cocos / Native 项目模板和生成的 startup shell 必须只消费对应目标 packager resolver 写出的 active-target manifest；如果模板、dev shell、Creator 接线、Rust app bootstrap、installer、updater 或 smoke runner 自己 import、声明、合并或过滤 inactive target core plugin，测试必须失败
- 三端项目生成器 fixture 必须覆盖“模板/壳层先携带三端 core 再过滤”的反模式：Web、Cocos、Native 都要有负例，证明 project template、starter、debug/release shell、installer、updater、smoke runner 和 Runtime QPK 都不能成为 target core 注入点；核心插件只能由当前 target resolver 进入 post-bundle graph
- 三端项目生成器还要覆盖“模板/壳层重新声明 active core”的负例：即使 Web 模板重新声明 Web core、Cocos 模板重新声明 Cocos core、Native Rust app bootstrap 重新声明 native core，也必须失败，因为唯一注入点只能是当前目标 packager resolver，模板和壳层只能读取 manifest
- resolver 代码结构要有负例 fixture：如果实现导出一个包含 Web / Cocos / Native 三端 core adapter 的共享 `corePlugins` / umbrella preset，再靠后续 target 过滤，测试必须失败；正确形态是三端独立 resolver context 先选 target，再解析普通插件
- Web / Cocos / Native 的 target-specific renderer plugin entry 必须按当前目标选择，并在产物 manifest 里显式写入 `target`；inactive entry 在 package manifest 中可以存在，但不能进入产物依赖图、renderer entries 或 Runtime QPK executable dependency
- Runtime QPK 的 Web / Cocos / Native compatibility block 只能作为 metadata；active target 之外的 block 不得触发 core adapter import、renderer entry 注册或 native capability 覆盖

CI 里要把三目标核心插件隔离拆成两个必跑 test suite：

- contracts suite：只用 `@quajs/native-contracts` fixture 对称覆盖 Web / Cocos / Native，验证 `validateExclusiveTargetBootstrap`、`validateOrdinaryPluginListTargetIsolation`、`validateTargetPluginManifest` 和 `validateTargetBundleManifest` 的正负例。
- packager suite：在 Quack / project packaging 层构造 debug、release、installer、updater、hand-built shell 和 post-bundle dependency graph fixture，确认它们全部调用同一套 helper，而不是只有主打包路径校验。

每个 suite 都要有一个“反模式”负例：实现先构造 Web / Cocos / Native 核心插件全集，再按目标过滤。即使最终输出看起来只剩当前目标，也要失败，因为 inactive target core 已经被 import / registered / included 到 resolver graph 里。

### 核心插件串线验收 fixture

每个 target 都要有一组正例和负例 fixture，证明核心插件只来自当前目标 resolver：

- 正例：Web / Cocos / Native 各自只包含一个 `TargetCoreSelection`、一个 matching `targetCoreResolver`、当前目标 renderer entries 和平台无关普通插件。
- 正例 1b：Web / Cocos / Native 项目模板、starter、debug shell、installer、updater 和 smoke runner 只读取对应目标已经 emitted 的 `target-bundle-manifest.json`，不再 import、声明或二次装配任何 target core plugin。
- 正例 1c：`projectGraphs` 中 project-template / startup-shell / debug-shell / release-shell / installer / updater / smoke-runner 只包含平台无关依赖；post-bundle graph 只包含 active target core family 和平台无关依赖。
- 负例 1：bootstrap selection 同时注册两个 core family，例如 Web 产物混入 `native-core`。
- 负例 2：普通 `plugins` 或 shared preset 直接声明 Web / Cocos / Native core root 或 subentry。
- 负例 2b：普通 plugin reference 对象里 `packageName` 看似平台无关，但 `specifier` 指向 Web / Cocos / Native target core subentry，或反过来；`validateOrdinaryPluginListTargetIsolation` 和 Quack 的 `assertQuackPluginReferencesTargetIsolation` 必须同时检查两个字段。
- 负例 3：第三方 plugin 的 shared entry eager import 任一 target core，或 inactive target entry 通过 barrel / side-effect import 进入 active 产物。
- 负例 4：Runtime QPK `executableDependencies` 或 `rendererEntries` 指向任一 target core root / subentry，或 renderer entry 缺失显式 `target`。
- 负例 5：post-bundle dependency graph 只在 `specifier` 或只在 `packageName` 中暴露其他 target core 子入口。
- 负例 6：debug shell、installer、updater manifest 跳过 Quack 主路径但仍声明了错误 core family。
- 负例 7：packager 或 shared preset 先构造 `[webCore, cocosCore, nativeCore]` 这样的三端全集，再按 target 过滤；这种实现即使最终 manifest 看似只剩一个 target，也必须按核心插件串线失败。
- 负例 8：Web / Cocos / Native 项目模板、starter、debug shell、installer、updater 或 smoke runner 自己重新声明 active target core，或顺手携带 inactive target core；即使 packager 主路径已经生成正确 manifest，也必须失败，因为核心插件只能由目标 resolver 注入一次。
- 负例 9：打包到 Cocos、Web、Native 项目时复用同一个跨目标项目模板，模板内部再根据参数过滤 core plugin；即使最终输出 manifest 看似单目标，也必须按核心插件串线失败。
- 负例 10：`projectGraphs` 的非 `post-bundle` graph 携带 active target core，或 `post-bundle` graph 携带 inactive target core。两个场景都必须由 `validateTargetBundleManifest` 报 `TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER`。

这些 fixture 必须对 Web、Cocos、Native 三端对称存在。Native 不能是唯一严格路径；Web 和 Cocos 也必须用相同 blocker 级别拒绝其他目标核心插件。

### target core 隔离测试矩阵

这些测试要对 Web、Cocos、Native 三端对称编写，不能只严格校验 native：

| 层级 | Web 产物必须拒绝 | Cocos 产物必须拒绝 | Native 产物必须拒绝 |
| --- | --- | --- | --- |
| bootstrap selection | Cocos / Native core adapter | Web / Native core adapter | Web / Cocos core adapter |
| ordinary plugin list / shared preset | Cocos / Native core 根包或子入口 | Web / Native core 根包或子入口 | Web / Cocos core 根包或子入口 |
| third-party plugin manifest | shared entry eager import Cocos / Native core；inactive Cocos / Native target entry eager | shared entry eager import Web / Native core；inactive Web / Native target entry eager | shared entry eager import Web / Cocos core；inactive Web / Cocos target entry eager |
| renderer entries | Cocos / Native renderer target metadata；Cocos / Native renderer plugin subentry | Web / Native renderer target metadata；Web / Native renderer plugin subentry | Web / Cocos renderer target metadata；Web / Cocos renderer plugin subentry |
| Runtime QPK executable dependency | Cocos / Native core dependency | Web / Native core dependency | Web / Cocos core dependency |
| projectGraphs before bundling | 任一 Web/Cocos/Native core dependency，包括 Web active core | 任一 Web/Cocos/Native core dependency，包括 Cocos active core | 任一 Web/Cocos/Native core dependency，包括 Native active core |
| post-bundle graph | Cocos / Native root or subentry in `specifier` or `packageName` | Web / Native root or subentry in `specifier` or `packageName` | Web / Cocos root or subentry in `specifier` or `packageName` |
| startup manifest | non-Web `targetCoreResolver` or selected adapter | non-Cocos `targetCoreResolver` or selected adapter | non-Native `targetCoreResolver` or selected adapter |

每个负例都要覆盖 `specifier` 和 `packageName` 两个字段，避免一个字段看起来安全、另一个字段实际指向其他 target core subentry。对 release artifact 的断言必须发生在 bundle / tree-shake 之后，debug shell、installer、updater 和手写启动器也要复用同一套 helper。

## benchmark 计划

### compiler / LSP

要测：

- parse latency
- validate latency
- format latency
- completion / hover latency
- asset code action / fixAll generation latency
- project index build time
- document link / reference query count
- incremental update time
- memory footprint

当前第一版 `@quajs/native-benchmarks` 已覆盖：

- `native.authoring.qui.parse_validate.smoke`
- `native.authoring.qss.parse_validate.smoke`
- `native.authoring.qss.resolve_style.smoke`
- `native.authoring.surface_projection.compile.smoke`
- `native.authoring.qui.format.smoke`
- `native.authoring.qss.format.smoke`
- `native.authoring.completion_hover.smoke`
- `native.authoring.asset_code_actions.smoke`
- `native.authoring.project_index.build.smoke`
- `native.authoring.project_index.incremental_update.smoke`

这些 benchmark 通过 `@quajs/native-ui-compiler` 和 `@quajs/native-language-server` 的公开 API 运行，包括 QSS declaration 到 resolved style 的归一化、已分析 QUI/QSS 到 Rust 可消费 surface projection JSON 的编译、从 resolved projection 反推 `assetKinds` / `intentEvents` / `projectionFields` / `qssFeatures` / `quiComponents` 需求、从 projection 派生 native UI surface compatibility、内存 project index build / incremental update，以及 document link / component-class reference 计数；不启动 renderer、不加载 Web/Cocos/Native target core bootstrap、不解析普通 game plugin 列表。fixture 固定在源码内，不能访问网络、不能随机生成。每条输出记录必须包含 `schemaVersion`、`suite`、`bench`、`profile`、`platform`、`backend`、`packageVersion`、`iterations`、`documentBytes`、`diagnostics`、`elapsedMs`、`memory` 和可比较的 `metrics`；`memory.heapUsedBytes` / `rssBytes` 记录非负压力指标，GC 或 allocator 抖动导致的负 delta 必须规整为 0，避免 benchmark baseline 出现无意义的负内存值。

`native.authoring.surface_projection.compile.smoke` 的 metrics 必须同时覆盖 projection 复杂度和兼容性复杂度：节点数、style field、intent、text node、projection field、QSS feature、QUI component、asset kind、compatibility capability、compatibility asset kind、compatibility QSS feature、compatibility QUI component，以及 `nativeCode: false` 次数。这样动态 UI 小包在不携带 native code 的前提下，仍可以用 benchmark 追踪它对 native-wgpu capability / memory / 激活前兼容性校验的压力。

当前 language-server 测试还会先构建 `@quajs/native-ui-compiler` 和 `@quajs/native-language-server`，再启动 `bin/qua-native-language-server.cjs` 走一条真实 stdio LSP smoke。这个测试验证发布入口默认 stdio、Node ESM dist import、initialize capability、open document diagnostics、completion、hover、documentLink 和 references，防止 VSCode / CLI 启动路径只在纯函数测试里通过。

后续还需要补：

- 独立 LSP 进程 initialize / completion / hover / documentLink / references 往返 latency benchmark 与 baseline 文件。
- 真实 workspace 文件系统扫描、删除、重命名和跨文件引用的 index regression。
- baseline 文件、历史对比和 regression 阈值升级策略。

### runtime / renderer

要测：

- cold start
- first frame
- QuickJS load / eval latency
- render bridge latency
- stage layout resolve time
- hit test cost
- frame time
- UI AST / QSS / token memory
- texture / glyph atlas / audio / video resource memory
- package load / unload / replacement pressure

### benchmark 规则

- 先建立 baseline，再设门禁。
- 所有 benchmark fixture 要可重复、无网络、无随机依赖。
- 结果要同时记录 profile、platform、backend、版本和资源种类。
- 重点看 regression，不只看单次数值。

## 具体验收

native 方案完成的最低门槛应该是：

1. `.qui` / `.qss` 可以被独立编译、格式化、诊断。
2. VSCode 可以独立编辑 native UI 文件。
3. native app 能启动、读取 manifest、校验 host info。
4. base component + composite UI 能跑通一条真实界面路径。
5. 动态包只携带内容，不携带 native code。
6. macOS / Windows 打包路径可验证，Linux 结构预留且不破坏隔离。
7. 有固定 benchmark 和 regression 规则。

## QSS 自动化验收口径

QSS 验收不能只靠快照。每个支持属性都要有三组测试：合法值、非法值、projection 输出。

- 合法值：确认 `resolveNativeQssDeclarations` 接受并归一化到 `NativeQssResolvedStyle` 或 node metadata。
- 非法值：确认 `analyzeQssSource` / LSP 给出稳定 diagnostic code，例如 `QSS_INVALID_VALUE`，并且 projection 不输出该字段。
- 安全值：颜色、`asset(...)`、font family、origin、尺寸、z-index、opacity 等字段必须覆盖 URL、绝对路径、`..`、native payload suffix、control character、非有限数字、越界数字。
- cascade / selector：type、class、id、descendant、child、pseudo-state、style part 的匹配要有 golden fixture；暂不支持的 selector 必须诊断，而不是被静默忽略。
- formatter：每个 fixture 跑 format idempotence，两次格式化输出一致。
- LSP：同一 fixture 要覆盖 diagnostics、completion、hover、documentLink、code action。
- Rust bridge：共享 resolved projection fixture 必须通过 `NativeRendererJsonFrameInput`，证明 Rust 只消费 resolved JSON，不解析 QSS source。

QSS baseline 要记录 property count、rule count、selector count、diagnostic count、projection style field count、elapsedMs、heapUsedBytes、rssBytes。动态 UI 小包的 benchmark 要单独记录 `UiAst`、`QssStyle`、`TokenTable` 的 package-scoped memory。

## 推荐验收命令族

Rust / TS 的具体命令可以随实现补齐，但验收应至少覆盖：

- `pnpm --filter @quajs/native-contracts test`
- `pnpm --filter @quajs/engine-native test`
- `pnpm --filter @quajs/native-ui-compiler test`
- `pnpm -C packages/native/ui-compiler typecheck`
- `pnpm --filter @quajs/native-language-server test`
- `pnpm -C packages/native/language-server typecheck`
- `pnpm -C packages/native/vscode typecheck`
- `pnpm -C packages/native/vscode build`
- `pnpm -C packages/native/benchmarks typecheck`
- `pnpm -C packages/native/benchmarks test`
- `pnpm --filter @quajs/native-benchmarks bench:smoke`
- `cargo test --manifest-path packages/native/Cargo.toml --workspace`

Cargo 重测试 / 重构建前要先看磁盘余量，必要时先清理 `target` / `cargo` 缓存，避免把后续验证卡死在空间不足上。
