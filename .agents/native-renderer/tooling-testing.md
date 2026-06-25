# 语言服务器、VSCode、测试与验收

## 工具链边界

native authoring 工具要独立于现有 QuaScript 工具链：

- 不改造 `packages/build/language-server`
- 不改造 `packages/build/vscode-quascript`
- native UI 另起独立 LSP 进程和独立 VSCode plugin

建议新增：

- `packages/native/ui-compiler`：已落基础，负责 QUI/QSS parse、validate、format、completion、hover 和 registry。
- `packages/native/language-server`：已落基础，负责 `.qui/.qss` 的独立 LSP 适配，包括 diagnostics、formatting、completion、hover、document links、component/class references 和 package bin 默认 stdio 启动。
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
- `native.authoring.qui.format.smoke`
- `native.authoring.qss.format.smoke`
- `native.authoring.completion_hover.smoke`
- `native.authoring.project_index.build.smoke`
- `native.authoring.project_index.incremental_update.smoke`

这些 benchmark 通过 `@quajs/native-ui-compiler` 和 `@quajs/native-language-server` 的公开 API 运行，包括内存 project index build / incremental update，以及 document link / component-class reference 计数；不启动 renderer、不加载 target core bootstrap、不解析普通 game plugin 列表。fixture 固定在源码内，不能访问网络、不能随机生成。每条输出记录必须包含 `schemaVersion`、`suite`、`bench`、`profile`、`platform`、`backend`、`packageVersion`、`iterations`、`documentBytes`、`diagnostics`、`elapsedMs`、`memory` 和可比较的 `metrics`。

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
