# 架构与包结构

## 目标

native 路线的目标不是“尽量像 Web”，而是“在 native 目标上提供与 Web renderer 同等级的可用 UI 投影能力”，同时保持：

- engine/store 仍然是唯一权威状态来源。
- QuickJS 负责运行 QS / JS / 运行时模块。
- wgpu 负责渲染。
- native runtime package 只能带内容，不带 native code。
- Web / Cocos / native 的 target core 必须完全隔离。

## 目标隔离

三套 target core 分别是：

- `web-core`
- `cocos-core`
- `native-core`

它们不是普通 game plugin，也不能放进同一个共享 preset 或 umbrella plugin array。它们只能由对应目标的 packager bootstrap resolver 创建：

- Web 入口调用 Web resolver，只贡献 Web bootstrap、Web renderer/framework adapter 和 Web 目标 renderer plugin entry。
- Cocos 入口调用 Cocos resolver，只贡献 Cocos host / renderer adapter 和 Cocos 目标 renderer plugin entry。
- Native 入口调用 Native resolver，只贡献 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、native contracts 元数据和 Rust native app/runtime/renderer 元数据。

任何普通 game/plugin、shared preset、第三方插件 shared entry、Runtime QPK executable dependency、debug smoke 或 authoring tool 如果直接引入上述 target core adapter，都要按串线处理。正确顺序是：

1. 先选 target。
2. 再生成 `TargetCoreSelection`。
3. 再做普通 plugin / runtime package 解析。
4. 再 bundle / tree-shake。
5. 再 emit `target-bundle-manifest.json`。
6. 再在 packaging / startup 两端重复校验。

每个目标必须有自己独立的 resolver context：

- Web 打包入口只能 materialize `web-core-resolver`，不能 import Cocos 或 Native bootstrap。
- Cocos 打包入口只能 materialize `cocos-core-resolver`，不能 import Web 或 Native bootstrap。
- Native 打包入口只能 materialize `native-core-resolver`，不能 import Web 或 Cocos bootstrap。
- debug、release、updater、installer、手写 shell 和测试 fixture 都必须复用同一套 manifest validation，不能另开绕过 target isolation 的快速路径。
- `target-bundle-manifest.json` 是目标交接契约，`target`、`targetCoreResolver`、selected adapters、renderer entries、Runtime QPK executable dependencies 必须同属一个 core family。

实现时不要提供一个三端共享的 `corePlugins`、`targetCorePlugins`、`bootstrapPlugins` 或 umbrella preset，然后在后续流程里按 target 过滤。Web、Cocos、Native 必须分别有自己的 resolver 函数 / resolver context，并且只有当前 resolver 能注入核心插件：

- `resolveWebTargetCore()` 只能返回 Web bootstrap、Web assets/store、Web renderer / framework adapter 和 Web renderer plugin entries。
- `resolveCocosTargetCore()` 只能返回 Cocos host / renderer adapter 和 Cocos renderer plugin entries。
- `resolveNativeTargetCore()` 只能返回 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、native contracts 元数据和 Rust native app/runtime/renderer 元数据。

普通插件、第三方插件和 Runtime QPK 只能消费已经选好的 `TargetCoreSelection`，不能再追加或覆盖 target core。即使某个 shared helper 只是为了“统一处理三端”，也只能处理 target metadata / schema 数据，不能 import inactive target bootstrap entrypoint 或把 inactive core adapter 放进依赖图。

打包到 Cocos、Web、Native 项目时，核心 bootstrap 插件不能串线：

- Web artifact 只能包含 Web core resolver、Web assets/renderer/framework adapter。
- Cocos artifact 只能包含 Cocos host/renderer adapter。
- Native artifact 只能包含 `engine-native`、`assets-native`、`store-native`、native contracts 元数据和 Rust native app/runtime/renderer。
- 普通 game/plugin 解析只能消费已经选好的 `TargetCoreSelection`，不能拿一个三端全集再靠运行时过滤。
- 普通 game/plugin 列表必须先通过 `validateOrdinaryPluginListTargetIsolation`，任何 Web / Cocos / Native target core 根包或子入口都不能出现在 `plugins`、shared preset 或 generated resolver 里。
- Runtime QPK 可声明多端 compatibility metadata，但 active artifact 只能评估当前 target block；QPK 不允许声明或携带任何 target core executable dependency。
- 第三方 plugin manifest 必须通过 `validateTargetPluginManifest`：shared entry 只能 import 平台无关逻辑，active target entry 只能 import 本 target core，inactive target entry 不能 eager 进入产物。
- target-specific renderer plugin entry 也属于目标隔离面：Web renderer subentry 不能进入 Cocos/Native，Cocos renderer subentry 不能进入 Web/Native，Native capability / bridge entry 不能进入 Web/Cocos。
- 所有 target bundle reference、plugin import reference、Runtime QPK executable/renderer reference 都要同时校验 `specifier` 和 `packageName`；不能让一个普通包名字段遮住另一个字段里的 Web/Cocos/Native target core 子入口。
- 最终 `target-bundle-manifest.json` 必须通过 `validateTargetBundleManifest`；Web、Cocos、Native 的 debug/release、installer/updater、手写 shell 和 CI fixture 都不能跳过这一步。
- release artifact 的依赖图检查必须发生在 bundle / tree-shake 之后，防止源码层过滤正确但产物里残留其他 target core 子入口。

打包产物必须把这条规则当作 release blocker，而不是普通 warning：Web、Cocos、Native 三类核心插件只能由各自目标 resolver 注入一次，不能在项目配置、普通插件列表、shared preset、Runtime QPK、renderer entry、installer/updater manifest 或 debug shell 里二次声明。任何产物只要同时出现两个 target core family，就必须终止打包；不能依赖运行时分支、tree-shaking 预期或手动约定来“稍后排除”另一端核心插件。

### 三端核心插件隔离矩阵

| 打包目标 | 必须选择 | 必须排除 | 失败条件 |
| --- | --- | --- | --- |
| Web | `web-core-resolver`、Web assets / renderer / framework adapter | Cocos host / renderer、Native engine/assets/store/runtime/renderer | 任一 Cocos / Native core 根包或子入口出现在 bootstrap、普通插件、renderer entry、Runtime QPK dependency、bundle graph 或 manifest |
| Cocos | `cocos-core-resolver`、Cocos host / renderer adapter | Web assets / renderer / framework adapter、Native engine/assets/store/runtime/renderer | 任一 Web / Native core 根包或子入口出现在 bootstrap、普通插件、renderer entry、Runtime QPK dependency、bundle graph 或 manifest |
| Native | `native-core-resolver`、`@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、Rust native app / runtime / renderer | Web assets / renderer / framework adapter、Cocos host / renderer | 任一 Web / Cocos core 根包或子入口出现在 bootstrap、普通插件、renderer entry、Runtime QPK dependency、bundle graph 或 manifest |

隔离检查必须覆盖五个阶段，不能只在源码 metadata 上通过：

1. bootstrap selection：`validateExclusiveTargetBootstrap` 保证只有一个 target core family。
2. ordinary plugin resolution：`validateOrdinaryPluginListTargetIsolation` 拦截 shared preset、普通 `plugins` 和 generated resolver 中的 target core 根包或子入口。
3. plugin entry selection：`validateTargetPluginManifest` 只允许 active target entry 进入依赖图，shared entry 必须保持平台无关，inactive target entry 不能 eager。
4. post-bundle graph：bundle / tree-shake 后重新扫描 `specifier` 与 `packageName`，防止 subentry 或别名把其他 target core 带入 release 产物。
5. startup / Runtime QPK：`validateTargetBundleManifest` 和 runtime startup 重复校验 target、resolver、selected adapters、renderer entries、Runtime QPK executable dependencies 与 active target 一致；Runtime QPK 的非 active target compatibility block 只能是 metadata。

native 包装必须始终通过：

- `@quajs/native-contracts`
- `@quajs/engine-native`
- `@quajs/assets-native`
- `@quajs/store-native`
- Rust `quajs_native_runtime`
- Rust `quajs_wgpu_renderer`
- Rust `quajs_native_app`

## 建议的 `packages/native` 结构

```text
packages/native/
  Cargo.toml
  crates/
    quajs_native_runtime/
    quajs_wgpu_renderer/
    quajs_native_app/
  contracts/
  engine-native/
  assets-native/
  store-native/
  ui-compiler/
  language-server/
  vscode/
  benchmarks/
  fixtures/             # planned
```

当前仓库里已有 native contracts / adapters、QUI/QSS compiler、native LSP、VSCode extension、authoring benchmark 和三个 Rust crate。后续 fixtures 继续放在 `packages/native/*`，不要塞进 `packages/build/*` 或现有 QuaScript 工具链。

## Runtime 分层

### 1. Native app

`quajs_native_app` 是宿主入口，职责是：

- 读取 `target-bundle-manifest.json`。
- 校验 `target`, `profile`, `platform`, `bundleId`, `version`, `buildNumber`, `icon`。
- 校验 native renderer 元数据与 host info 一致。
- 通过 `quickjs_runtime_version()` 写入 `QuaNativeHostInfo.runtime.quickjsVersion`；未安装真实 QuickJS evaluator 的 build 明确报告 `unsupported`，不能留下 `pending` 占位或伪造真实引擎版本。
- 组装 QuickJS host 和 wgpu renderer。
- 在启动前再次确认 target bootstrap 没有混入其他 family。
- 可选读取 `QUA_NATIVE_RENDERER_SMOKE_FRAME` 指向的 projection JSON 文件，使用 `NullNativeRenderBackend` 跑一次 `NativeRendererJsonFrameInput` smoke frame，验证 native app 到 renderer JSON facade 的宿主接线；如果设置 `QUA_NATIVE_RENDERER_SMOKE_BUDGET`，则读取预算 JSON 并对 missing / fallback / declarative memory / audio / total memory 等指标做上限门禁。这只用于 debug / CI smoke，不是动态包 native code 入口，也不能加载 Web/Cocos/native target core bootstrap 列表。

### 2. QuickJS runtime

`quajs_native_runtime` 负责：

- QuickJS 宿主。
- 模块注册、命名空间 registry、释放和摘要。
- host API / pipeline bridge。
- 运行时模块加载约束。
- 资源受限执行环境。
- 当前没有真实 QuickJS evaluator backend 时，受限桥会返回结构化 `UnsupportedRuntime`，host info 的 `quickjsVersion` 同步报告 `unsupported`。

### 3. wgpu renderer

`quajs_wgpu_renderer` 负责：

- stage layout / safe area / logical coordinate projection。
- 纹理、字体、视频 poster/fallback、输入事件、资源账本。
- UI surface 的绘制和命中测试。
- pointer press/release 解析后可通过调用方传入的 `NativeHostApi` 发出 `NativeRendererIntent`，再由 native host / engine bridge 进入既有 pipeline；renderer 自身不持有 host，也不引入第二事件总线。
- projection DTO 提供 camelCase JSON serde 边界，供 native app / QuickJS bridge 输入已解析的 view、QUI/QSS style、stage layout 和 media/audio projection；组件 kind 保持 QUI registry 名称，如 `Box`、`Text`、`Button`。
- `NativeRendererJsonFrameInput` 是 native app / QuickJS bridge 的薄 JSON facade：只接收已解析的 `layout`、`container`、`view`，解析失败返回结构化 parse error，渲染失败和 audio backend 失败分开上报；它复用 `prepare_frame` / `prepare_and_render` / audio apply 路径，不引入新的 renderer 状态。
- renderer smoke 路径必须继续使用已解析 projection JSON；不得把 QUI/QSS authoring parser、普通 plugin resolver、Web/Cocos/native target core resolver 或 Runtime QPK executable dependency 加进 `quajs_native_app` smoke。
- 只消费 resolved QUI/QSS / capability data。

### 4. TS bridge

`@quajs/engine-native` 负责：

- native host info 读取。
- runtime package compatibility guard。
- restricted runtime module loader。
- trust policy / signature verification。
- host 与 engine 的桥接。
- native renderer intent bridge：把 Rust `NativeRendererIntent` 的 `choice/select` 转成 `USER_CHOICE_SELECT`，把 `ui/intent` 保留为通用 UI intent，并只对约定的 `open` / `close` / `update` action 转成现有 UI overlay request 事件。

## 动态包策略

动态小包的边界要明确：

- 允许：`qs`、`js`、`qui`/`qss` 编译产物、tokens、images、fonts、audio、video、json 等资源。
- 不允许：任何 native code。
- 不允许：dylib / so / dll / framework / bundle / WASM-native bridge / shell / FFI / Rust callback。

这意味着 runtime package 的可变性只存在于内容层，不存在于 native 功能层。

## 兼容性与版本

native 兼容性要分三层：

1. `target-bundle-manifest.json` 的 target / profile / platform / resolver / app metadata。
2. `NativeHostInfo` 的 renderer package / version / backend / capability hash。
3. runtime package 的 native compatibility metadata。

第三方 plugin / runtime package 需要显式声明：

- native renderer package / version range
- required / optional capability ids
- required / optional asset kinds
- required / optional QSS features
- required / optional QUI components
- `nativeCode: false`

host 侧版本和 capability 以 signed native build 为准，QPK 不可覆盖。

## 打包与发布

### 目标优先级

1. macOS
2. Windows
3. Linux

### 输出隔离

debug / release 必须分开；release 还要再按版本分开。推荐目录类似：

```text
dist/native/
  debug/<version+local>/<platform>/
  release/<version-buildNumber>/<platform>/
```

### 需要写入的元数据

- app bundleId / appId
- app version
- buildNumber
- icon
- profile
- platform
- target renderer version
- renderer backend
- capability ids
- capability manifest hash
- targetCoreResolver

### 平台重点

- macOS: `.app` / `.dmg` / `.zip`，`icns`，签名与 notarization。
- Windows: `.exe` / `.zip` / installer，`ico`，签名与 publisher metadata。
- Linux: `.AppImage` / `.deb` / `.rpm`，desktop entry 与 PNG icon sizes。

## 内存与 media

resource ledger 需要单独统计：

- QuickJS heap
- UI AST / QSS style IR / tokens
- textures / glyph atlas
- audio buffers / streams
- video poster / frame queue
- frame resource sync / release / unload blockers

bench 不仅看 frame time，也要看内存和资源释放行为。
