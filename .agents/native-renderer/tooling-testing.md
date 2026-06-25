# 语言服务器、VSCode、测试与验收

## 工具链边界

native authoring 工具要独立于现有 QuaScript 工具链：

- 不改造 `packages/build/language-server`
- 不改造 `packages/build/vscode-quascript`
- native UI 另起独立 LSP 进程和独立 VSCode plugin

建议新增：

- `packages/native/ui-compiler`
- `packages/native/language-server`
- `packages/native/vscode`
- `packages/native/benchmarks`

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
- project surface tree
- token / asset / style reference view

## 验证策略

### contracts tests

先保证这些纯 TS 约束稳定：

- target bootstrap isolation
- target bundle manifest validation
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
- definition
- references
- rename
- code actions
- incremental sync

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

## benchmark 计划

### compiler / LSP

要测：

- parse latency
- validate latency
- format latency
- completion / hover latency
- project index build time
- incremental update time
- memory footprint

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
- `pnpm --filter @quajs/native-language-server test`
- `cargo test --manifest-path packages/native/Cargo.toml --workspace`

Cargo 重测试 / 重构建前要先看磁盘余量，必要时先清理 `target` / `cargo` 缓存，避免把后续验证卡死在空间不足上。
