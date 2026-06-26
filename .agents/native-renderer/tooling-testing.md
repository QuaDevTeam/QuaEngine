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

这些工具只做 authoring，不加载 Web/Cocos/native target core bootstrap，也不解析普通 game plugin 列表。它们可以读取平台无关 contracts / registry / manifest schema，但不能把 Web、Cocos、Native 三套核心插件合并成一个编辑器运行时。

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
- target bundle startup checks
- shared TS/Rust renderer fixtures: `packages/native/test-fixtures/renderer/qui-qss-surface-frame.json` 必须保持为 resolved projection JSON。`@quajs/native-ui-compiler` 测试需要证明该 fixture 的 `surface.root` 可由 QUI/QSS compiler 输出得到，并携带动态包 `provenance`；还要通过 `collectNativeUiSurfaceProjectionRequirements` 从 resolved projection 反推 QUI component、QSS feature、asset kind、intent event 需求，确认 native-wgpu registry 覆盖当前共享 fixture；`quajs_wgpu_renderer` 测试需要通过同一 fixture 的 `NativeRendererJsonFrameInput` 路径完成 prepare/render、资源请求、intent hit-test、资源账本 provenance 和 unload blocker 验证；`quajs_native_app` renderer smoke unit / CLI 测试也应复用这份 fixture 验证 native app 到 renderer JSON facade 的宿主接线。该 fixture 不能引入 Rust 侧 QUI/QSS parser，也不能进入 Web/Cocos target core 路径。
- native app renderer smoke: 设置 `QUA_NATIVE_RENDERER_SMOKE_FRAME` 指向已解析 projection JSON，启动 `quajs_native_app` 后必须完成 `NativeRendererJsonFrameInput` -> `NullNativeRenderBackend` 的 frame submit，并输出人读 revision / pass / batch / command / resource 摘要以及机器可读 `Qua native renderer smoke json: ...` 行。JSON 行至少包含 `missingResourceCount`、`fallbackCount`、`videoFallbackCount`、`declarativeAssetRequestCount`、`declarativeResourceCount`、`memory.totalBytes`、`declarativeMemory.totalBytes`、`audioMemory.totalBytes` 和 audio 资源/track 计数，供 CI / benchmark 做回归比较。设置 `QUA_NATIVE_RENDERER_SMOKE_BUDGET` 时，预算 JSON 字段必须严格校验，并对这些指标执行上限门禁；该路径只消费 resolved projection JSON，不加载 QUI/QSS authoring parser、普通 plugin resolver、Runtime QPK executable dependency 或 Web/Cocos/native target core bootstrap 列表。
- renderer capability matching
- resource release / unload cleanup

### packaging tests

- macOS / Windows / Linux metadata
- icon generation
- bundleId / version / buildNumber
- debug / release isolation
- release immutability by version
- `target-bundle-manifest.json` emitted and revalidated
- Web artifact 排除 Cocos/native core，Cocos artifact 排除 Web/native core，Native artifact 排除 Web/Cocos core；不能只测 native 严格路径
- 三端 resolver fixture 必须分别断言 `web-core-resolver`、`cocos-core-resolver`、`native-core-resolver`，并在 resolver / selected adapters / renderer entries / Runtime QPK executable dependencies 任一项串线时失败
- ordinary plugin list、shared preset、generated plugin resolver、debug shell、release bundle 和 installer/updater manifest 都要跑同一套 target isolation helper，不能只在 Quack 主打包路径校验
- resolver 代码结构要有负例 fixture：如果实现导出一个包含 Web / Cocos / Native 三端 core adapter 的共享 `corePlugins` / umbrella preset，再靠后续 target 过滤，测试必须失败；正确形态是三端独立 resolver context 先选 target，再解析普通插件
- Web / Cocos / Native 的 target-specific renderer plugin entry 必须按当前目标选择，并在产物 manifest 里显式写入 `target`；inactive entry 在 package manifest 中可以存在，但不能进入产物依赖图、renderer entries 或 Runtime QPK executable dependency
- Runtime QPK 的 Web / Cocos / Native compatibility block 只能作为 metadata；active target 之外的 block 不得触发 core adapter import、renderer entry 注册或 native capability 覆盖

### 核心插件串线验收 fixture

每个 target 都要有一组正例和负例 fixture，证明核心插件只来自当前目标 resolver：

- 正例：Web / Cocos / Native 各自只包含一个 `TargetCoreSelection`、一个 matching `targetCoreResolver`、当前目标 renderer entries 和平台无关普通插件。
- 负例 1：bootstrap selection 同时注册两个 core family，例如 Web 产物混入 `native-core`。
- 负例 2：普通 `plugins` 或 shared preset 直接声明 Web / Cocos / Native core root 或 subentry。
- 负例 2b：普通 plugin reference 对象里 `packageName` 看似平台无关，但 `specifier` 指向 Web / Cocos / Native target core subentry，或反过来；`validateOrdinaryPluginListTargetIsolation` 和 Quack 的 `assertQuackPluginReferencesTargetIsolation` 必须同时检查两个字段。
- 负例 3：第三方 plugin 的 shared entry eager import 任一 target core，或 inactive target entry 通过 barrel / side-effect import 进入 active 产物。
- 负例 4：Runtime QPK `executableDependencies` 或 `rendererEntries` 指向任一 target core root / subentry，或 renderer entry 缺失显式 `target`。
- 负例 5：post-bundle dependency graph 只在 `specifier` 或只在 `packageName` 中暴露其他 target core 子入口。
- 负例 6：debug shell、installer、updater manifest 跳过 Quack 主路径但仍声明了错误 core family。
- 负例 7：packager 或 shared preset 先构造 `[webCore, cocosCore, nativeCore]` 这样的三端全集，再按 target 过滤；这种实现即使最终 manifest 看似只剩一个 target，也必须按核心插件串线失败。

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

这些 benchmark 通过 `@quajs/native-ui-compiler` 和 `@quajs/native-language-server` 的公开 API 运行，包括 QSS declaration 到 resolved style 的归一化、已分析 QUI/QSS 到 Rust 可消费 surface projection JSON 的编译、内存 project index build / incremental update，以及 document link / component-class reference 计数；不启动 renderer、不加载 target core bootstrap、不解析普通 game plugin 列表。fixture 固定在源码内，不能访问网络、不能随机生成。每条输出记录必须包含 `schemaVersion`、`suite`、`bench`、`profile`、`platform`、`backend`、`packageVersion`、`iterations`、`documentBytes`、`diagnostics`、`elapsedMs`、`memory` 和可比较的 `metrics`。

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
