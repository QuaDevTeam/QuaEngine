# 语言服务器、VSCode、测试与验收

## 工具链边界

native authoring 工具要独立于现有 QuaScript 工具链：

- 不改造 `packages/build/language-server`
- 不改造 `packages/build/vscode-quascript`
- native UI 另起独立 LSP 进程和独立 VSCode plugin

建议新增：

- `packages/native/ui-compiler`：已落基础，负责 QUI/QSS parse、validate、format、completion、hover 和 registry。
- `packages/native/language-server`：已落基础，负责 `.qui/.qss` 的独立 LSP 适配，包括 diagnostics、formatting、completion、hover、definition、document links、component/class/id references 和 package bin 默认 stdio 启动。
- `packages/native/vscode`：已落基础，负责 VSCode language contribution、grammar、snippets、format/validate/restart commands 和 native LSP 启动。
- `packages/native/benchmarks`：已落基础，负责 native authoring/tooling 的确定性 smoke benchmark，输出 JSON Lines baseline。

这些工具只做 authoring，不加载 Web/Cocos/native target core bootstrap，也不解析普通 game plugin 列表。它们可以读取平台无关 contracts / registry / manifest schema，但不能把 Web、Cocos、Native 三套核心插件合并成一个编辑器运行时。

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
   - 资产
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
- asset refs

QSS 侧：

- selectors
- properties
- property value completions / hover metadata from the shared native QSS registry
- tokens
- style parts
- class / id references

## VSCode 插件

建议独立 package，语言 id 可用：

- `qua-ui` for `.qui`
- `qua-style` for `.qss`

至少要提供：

- TextMate grammar
- language configuration
- snippets
- command: validate / format / restart LSP
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
- target-specific renderer plugin entry 隔离：Web renderer subentry、Cocos renderer subentry、Native bridge/capability entry 只能出现在对应目标产物里
- debug / release / installer / updater / hand-built shell 统一复用同一套 target isolation helper，不能只在 Quack 主路径校验
- native compatibility metadata
- runtime package native code rejection
- host info / capability hash consistency

### compiler tests

- `qui` parse fixtures
- `qss` parse fixtures
- invalid syntax recovery
- component registry validation
- AST / IR snapshot
- format idempotence

### LSP tests

- completion
- hover
- document links
- definition
- references
- rename
- code actions
- incremental sync
- process smoke: package bin 启动、initialize、didOpen diagnostics、completion、hover、documentLink、references

### runtime tests

- QuickJS module loader
- manifest validation
- target bundle startup checks
- shared TS/Rust renderer fixtures: `packages/native/test-fixtures/renderer/qui-qss-surface-frame.json` 必须保持为 resolved projection JSON。`@quajs/native-ui-compiler` 测试需要证明该 fixture 的 `surface.root` 可由 QUI/QSS compiler 输出得到；`quajs_wgpu_renderer` 测试需要通过同一 fixture 的 `NativeRendererJsonFrameInput` 路径完成 prepare/render、资源请求和 intent hit-test；`quajs_native_app` renderer smoke unit / CLI 测试也应复用这份 fixture 验证 native app 到 renderer JSON facade 的宿主接线。该 fixture 不能引入 Rust 侧 QUI/QSS parser，也不能进入 Web/Cocos target core 路径。
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
- Web / Cocos / Native 的 target-specific renderer plugin entry 必须按当前目标选择；inactive entry 在 package manifest 中可以存在，但不能进入产物依赖图、renderer entries 或 Runtime QPK executable dependency
- Runtime QPK 的 Web / Cocos / Native compatibility block 只能作为 metadata；active target 之外的 block 不得触发 core adapter import、renderer entry 注册或 native capability 覆盖

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
