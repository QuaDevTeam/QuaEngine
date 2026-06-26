# Web / Cocos / Native 核心插件隔离

## 目标

打包到 Web、Cocos、Native 项目时，核心 bootstrap 插件必须是三套互斥根。它们不是普通 game plugin，也不能先被放进同一个插件数组、shared preset、generated resolver 或 Runtime QPK executable dependency，再由后续流程按 target 过滤。

这条规则是 release blocker。任一产物只要同时携带两个 target core family，就必须终止打包；不能依赖 tree-shaking 预期、运行时分支、手动约定或后续 installer / updater 步骤再清理。

## 术语

- `target core plugin`：安装目标 runtime adapter、renderer controller、host bridge、platform asset/store adapter、target renderer plugin entry 或 native renderer capability metadata 的 bootstrap 依赖。
- `ordinary game/plugin`：平台无关的 engine/game/plugin 逻辑。它可以声明 target compatibility metadata，但不能自己注入 Web / Cocos / Native core adapter。
- `TargetCoreSelection`：打包入口在解析普通插件之前生成的只读目标选择结果，是唯一可以携带 target core bootstrap adapter 的对象。
- `target-bundle-manifest.json`：bundle / tree-shake 后的产物交接契约。它必须证明当前 artifact 只有一个 target core family，并记录 `targetCoreResolver`、`selectedCorePluginFamily`、selected adapters、renderer entries 和 Runtime QPK dependency。

## 核心归属

| Target | 唯一 resolver | 可注入核心插件 | 必须排除 |
| --- | --- | --- | --- |
| Web | `web-core-resolver` | Web bootstrap、`@quajs/assets-web`、`@quajs/renderer-web`、选中的 Vue/React/Svelte Web adapter、Web renderer plugin subentry | Cocos host/renderer、`@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、Rust native runtime/renderer metadata |
| Cocos | `cocos-core-resolver` | Cocos bootstrap、Cocos host / asset / store bridge、`@quajs/renderer-cocos`、Cocos renderer plugin subentry | Web assets/renderer/framework adapter、native engine/assets/store/runtime/renderer |
| Native | `native-core-resolver` | `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 `@quajs/native-contracts` metadata、Rust native app/runtime/renderer capability metadata | `@quajs/assets-web`、`@quajs/renderer-web`、Web framework renderer adapter、Cocos host/renderer |

`@quajs/native-contracts` 是特殊情况：Web / Cocos 的 Node 打包工具可以用它做 manifest schema 和 target isolation 校验，但 Web / Cocos runtime graph 不能保留它。Native runtime 可以保留它，因为 native bootstrap 需要读取 host / capability contracts。

## Resolver 架构

打包入口必须 target-first：

1. 读取 project target：`web`、`cocos` 或 `native`。
2. 调用 `createTargetCoreSelection(target)`，得到唯一 `TargetCoreSelection`。
3. 只调用当前 target resolver：
   - `resolveWebTargetCore(selection)`
   - `resolveCocosTargetCore(selection)`
   - `resolveNativeTargetCore(selection)`
4. 在解析普通 plugins / shared preset / third-party plugin 前，调用 `validateOrdinaryPluginListTargetIsolation` 或 Quack 封装的 `assertQuackPluginReferencesTargetIsolation`。
5. third-party plugin entry selector 只能 materialize `shared` + active target entry；inactive target entry 只能保留为 metadata，不得 eager import、barrel export 或 side-effect import。
6. Runtime QPK resolver 只评估 active target compatibility block。Inactive target blocks 是 metadata；`executableDependencies` 和 `rendererEntries` 不能指向任一 target core root / subentry。
7. bundle / tree-shake 后重新扫描 dependency graph，生成并校验 `target-bundle-manifest.json`。
8. runtime startup 再次从 manifest 或 startup package roots 运行 exclusive-target assertion。

禁止出现这些 helper 或结构：

- `resolveAllTargetCore()`
- `createCorePluginsForAllTargets()`
- `corePluginsByTarget` 先枚举 Web / Cocos / Native 再过滤
- 一个 barrel export 同时导出 Web、Cocos、Native bootstrap entrypoint
- shared preset 里包含三端核心插件全集
- Runtime QPK 声明 Web / Cocos / Native 任一 core adapter 作为 executable dependency

如果某个 helper 需要复用三端 schema，只能复用纯数据 schema / validation helper，不能 import inactive target bootstrap entrypoint。

## 打包核心插件装配红线

打包到 Web、Cocos、Native 时，核心插件装配必须是三条物理隔离的入口，而不是一条共享入口的三种参数：

- Web 打包入口只能调用 Web resolver，生成 Web bootstrap、Web asset/store adapter、Web renderer/framework adapter 和 Web renderer plugin subentry。
- Cocos 打包入口只能调用 Cocos resolver，生成 Cocos host / asset / store bridge、Cocos renderer 和 Cocos renderer plugin subentry。
- Native 打包入口只能调用 Native resolver，生成 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 `@quajs/native-contracts` 元数据，以及 Rust native app/runtime/renderer capability metadata。

普通 game/plugin 解析、shared preset、third-party plugin entry selection、Runtime QPK resolver、debug shell、installer、updater 和 smoke runner 都只能消费已经生成的 `TargetCoreSelection`，不能重新 import、追加、替换或二次声明任一 target core adapter。它们可以读取 target metadata，但不能把 Web / Cocos / Native 任一核心插件当作普通插件传递。

这条规则要在代码结构上可见：

- `resolveWebTargetCore()`、`resolveCocosTargetCore()`、`resolveNativeTargetCore()` 必须是互斥入口。
- 任何 shared helper 只能处理 serializable metadata、schema、manifest validation 或 package-root normalization；一旦 import target runtime adapter / renderer / host bridge，就必须移动到对应 target resolver 内。
- `plugins`、`presets`、generated plugin resolver、Runtime QPK `executableDependencies`、Runtime QPK `rendererEntries` 和 app renderer entries 都不得引用 Web / Cocos / Native target core root 或 subentry。
- post-bundle graph 必须同时扫描 `specifier` 与 `packageName`，把 subentry 归一到 package root 后再判定是否串线。
- debug 与 release 产物使用同一套 blocker。debug 可以多 sourcemap / diagnostics，但不能放宽核心插件隔离。

验收时必须证明三端互斥，而不是只证明 native 严格：

- Web 产物里出现 Cocos 或 Native core 直接失败。
- Cocos 产物里出现 Web 或 Native core 直接失败。
- Native 产物里出现 Web 或 Cocos core 直接失败。
- 任何先构造 Web / Cocos / Native 三端核心插件全集再按 target 过滤的实现，即使最终 manifest 看似正确，也必须失败，因为 inactive core 已经进入 resolver graph。

## 检查层级

核心插件隔离必须在五层都成立：

1. **Bootstrap selection**：`validateExclusiveTargetBootstrap` 确认只注册一个 core family。
2. **Ordinary plugin list**：`validateOrdinaryPluginListTargetIsolation` 拦截普通 `plugins`、shared preset、CLI plugin reference、generated resolver 中的 target core root / subentry。
3. **Plugin entry selection**：`validateTargetPluginManifest` 确认 shared entry 平台无关，active target entry 只 import 当前目标 adapter，inactive entries 不 eager。
4. **Post-bundle graph**：bundle / tree-shake 后同时检查 `specifier` 与 `packageName`，并把 subentry 归一到 package root，例如 `@quajs/renderer-web/plugins/audio` 仍然是 Web core。
5. **Startup / Runtime QPK**：`validateTargetBundleManifest` 和 runtime startup 重复校验 `target`、`targetCoreResolver`、selected adapters、renderer entries、Runtime QPK executable dependencies 与 active target 一致。

任何一层通过都不能代表其他层安全。尤其要注意 `specifier` 和 `packageName` 双字段：安全的 `packageName` 不能掩盖 `specifier` 里的 target core subentry，反过来也一样。

## 打包入口落点

Web / Cocos / Native 的 debug、release、installer、updater 和 hand-built shell 必须复用同一套 isolation helper。

Web packaging:

- 只能从 Web resolver materialize core adapters。
- post-bundle manifest 必须设置 `target: "web"`、`targetCoreResolver: "web-core-resolver"`、`selectedCorePluginFamily: "web-core"`。
- runtime graph 必须排除 Cocos / Native core roots，以及 Web/Cocos runtime 中不应保留的 native contracts。

Cocos packaging:

- 只能从 Cocos resolver materialize core adapters。
- post-bundle manifest 必须设置 `target: "cocos"`、`targetCoreResolver: "cocos-core-resolver"`、`selectedCorePluginFamily: "cocos-core"`。
- runtime graph 必须排除 Web / Native core roots。

Native packaging:

- 只能从 Native resolver materialize core adapters。
- post-bundle manifest 必须设置 `target: "native"`、`targetCoreResolver: "native-core-resolver"`、`selectedCorePluginFamily: "native-core"`。
- manifest 还必须写入 app `bundleId`、`version`、`buildNumber`、`icon`、`profile`、`platform`、native renderer package/version/backend/capability ids/capability hash。
- runtime graph 必须排除 Web / Cocos core roots。

## Runtime QPK 规则

Runtime QPK 可以声明 Web / Cocos / Native 多端 compatibility metadata，但 active artifact 只评估当前 target block。

Runtime QPK 永远不能：

- 携带或激活 Web / Cocos / Native core bootstrap adapter。
- 把 `@quajs/renderer-web`、`@quajs/renderer-cocos`、`@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native` 等 target core root / subentry 放进 `executableDependencies`。
- 注册跨 target renderer entry。
- 对 native 覆盖 Rust host 提供的 renderer package/version/capability hash。

Native dynamic QPK 只能带 QS / JS runtime modules 和资源，包括 compiled QUI/QSS/tokens、图片、字体、音频、视频、JSON 等内容。它不能带任何 native code，也不能借 Runtime QPK 安装新的 native primitive。

## 验收 Fixture

每个 target 都必须有正例和负例。Native 不能是唯一严格路径；Web 和 Cocos 也要用同级 blocker 拒绝其他目标核心插件。

正例：

- Web：Web core adapters + platform-neutral plugins + Web renderer entries。
- Cocos：Cocos core adapters + platform-neutral plugins + Cocos renderer entries。
- Native：native engine/assets/store/contracts + Rust native runtime/renderer metadata + native renderer entries。
- Multi-target third-party plugin：source metadata 同时声明 Web / Cocos / Native entries，但每个 artifact 只 bundle active entry + shared logic。
- Runtime QPK：保留 inactive compatibility metadata，但不产生 inactive executable dependencies 或 renderer entries。

负例：

- bootstrap 同时注册两个 core family。
- ordinary plugin list 或 shared preset 直接声明任一 target core root / subentry。
- `packageName` 看似平台无关，但 `specifier` 指向 target core subentry，或反过来。
- shared plugin entry eager import Web / Cocos / Native 任一 core adapter。
- inactive target entry 通过 barrel export 或 side-effect import 进入 active artifact。
- Runtime QPK `executableDependencies` 或 `rendererEntries` 指向 target core root / subentry。
- renderer entry 缺失显式 `target`，或 target 与 artifact 不一致。
- post-bundle graph 发现 foreign target core root / subentry。
- debug shell、installer、updater manifest 跳过 Quack 主路径但声明错误 core family。
- packager 先构造 `[webCore, cocosCore, nativeCore]` 三端全集，再按 target 过滤。即使最终 manifest 看起来只剩一个 target，也必须失败。

## CI 门禁

CI 至少拆两组：

- contracts suite：只用 `@quajs/native-contracts` fixture，对称覆盖 Web / Cocos / Native 的 `validateExclusiveTargetBootstrap`、`validateOrdinaryPluginListTargetIsolation`、`validateTargetPluginManifest` 和 `validateTargetBundleManifest`。
- packager suite：在 Quack / project packaging 层构造 debug、release、installer、updater、hand-built shell、post-bundle dependency graph fixture，确认所有路径都调用同一套 helper。

Release promotion 前必须使用 post-bundle manifest 做最终校验。Debug 产物可以包含额外诊断和 sourcemap，但不能放宽 target core isolation。
