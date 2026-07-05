# Web / Cocos / Native 核心插件隔离

## 目标

打包到 Web、Cocos、Native 项目时，核心 bootstrap 插件必须是三套互斥根。它们不是普通 game plugin，也不能先被放进同一个插件数组、shared preset、generated resolver 或 Runtime QPK executable dependency，再由后续流程按 target 过滤。

这条规则是 release blocker。任一产物只要同时携带两个 target core family，就必须终止打包；不能依赖 tree-shaking 预期、运行时分支、手动约定或后续 installer / updater 步骤再清理。

这里的判断单位是“打包后的目标工程”，不是单个 renderer package 或源码配置字段。Web project、Cocos project、Native project 的 core bootstrap、renderer subentry、assets/store adapter、host bridge、project template、startup shell、debug/release shell、installer、updater、smoke runner 和 Runtime QPK resolver 都必须证明只消费当前目标 resolver 写出的 active-target manifest；任何阶段把另外两端 core plugin materialize 进来，或在模板/壳层二次声明当前 active core，都按核心插件串线失败处理。

## Canonical Packaging Contract

这份文件的最终判定口径是“核心插件只能由当前目标 resolver 注入一次”。Web、Cocos、Native 的项目生成、debug/release shell、installer、updater、smoke runner 和 Runtime QPK 都是已验证 `target-bundle-manifest.json` 的只读消费者，不是第二个 core plugin 装配点。

换句话说，打包到 Cocos、Web、Native 项目时，核心插件不是普通插件，也不是模板层可以补齐的依赖；它只能从当前目标的 packager resolver 进入产物一次。任何“项目模板再声明 active core”“先收集三端 core 再过滤”“Runtime QPK 携带目标 core executable dependency”的做法，都按核心插件串线失败处理。

- Web 打包只能 materialize `web-core-resolver`，产物只能包含 Web core family。
- Cocos 打包只能 materialize `cocos-core-resolver`，产物只能包含 Cocos core family。
- Native 打包只能 materialize `native-core-resolver`，产物只能包含 Native core family。
- 非 `post-bundle` 的 `projectGraphs` 必须完全平台无关，连 active core 也不能出现。
- `post-bundle` graph 只能出现 active core family；任何 inactive Web / Cocos / Native core root 或 subentry 都是 blocker。
- Runtime QPK 可以保留多目标 compatibility metadata，但不能携带任一 target core executable dependency、renderer entry 或 generated resolver。
- 禁止先构造 `[webCore, cocosCore, nativeCore]`、`allRendererEntries`、umbrella preset 或跨目标 startup shell 再过滤；这个反模式即使最终 manifest 看似单目标，也按串线失败。

## 三端打包验收矩阵

打包到 Cocos、Web、Native 项目时，验收要按目标产物分别跑，而不是只检查 native。每个目标都必须证明“当前 core 只由当前 resolver 注入一次，其他阶段只消费 manifest”：

| 目标产物 | 必须存在 | 必须不存在 | 必须失败的 fixture |
| --- | --- | --- | --- |
| Web project | `target: "web"`、`web-core-resolver`、Web selected adapters、Web renderer entry | Cocos host / renderer、native engine/assets/store/runtime/renderer、native contracts runtime graph | Web 产物的 `projectGraphs`、Runtime QPK、installer/updater/smoke runner 中出现 Cocos 或 Native core root / subentry；先构造三端 core union 再过滤 |
| Cocos project | `target: "cocos"`、`cocos-core-resolver`、Cocos host / renderer selected adapters | Web renderer/framework adapter、native engine/assets/store/runtime/renderer、native contracts runtime graph | Cocos 产物的 Creator 接线、debug shell、Runtime QPK、installer/updater 中出现 Web 或 Native core root / subentry；复用 Web renderer adapter |
| Native project | `target: "native"`、`native-core-resolver`、native engine/assets/store、Rust app/runtime/renderer metadata | Web assets/renderer/framework adapter、Cocos host / renderer | Native Rust app bootstrap、QuickJS startup、smoke runner、Runtime QPK、installer/updater 中出现 Web 或 Cocos core root / subentry；把 native core 放进普通 plugin list |

这张矩阵要固化成 contracts suite 和 packager suite 的负例：

- `project-template`、`startup-shell`、`debug-shell`、`release-shell`、`installer`、`updater`、`smoke-runner`、`dev-server` 等非 `post-bundle` graph 出现任一 target core，失败；连 active core 二次声明也失败。
- `post-bundle` graph 只允许 active core family；出现 inactive core root / subentry，失败。
- Runtime QPK 的 `executableDependencies` / `rendererEntries` 指向任一 target core root / subentry，失败；多目标 compatibility block 只能作为 metadata。
- `specifier` 与 `packageName` 必须同时扫描并归一化；`@quajs/renderer-web/plugins/audio?import`、`node_modules/@quajs/renderer-cocos/...`、pnpm `.pnpm` 路径或 Windows backslash 路径都不能绕过 core family 分类。
- 多目标批量构建必须生成多个独立 artifact plan。任何测试中先 materialize `[webCore, cocosCore, nativeCore]`、`allRendererEntries` 或 umbrella bootstrap 再过滤，都必须失败，即使最终 manifest 字段看起来正确。

## 核心插件单一来源规则

打包到 Cocos、Web、Native 项目时，核心插件只有一个来源：当前目标的 packager resolver。Web 只能由 `web-core-resolver` 注入 Web core，Cocos 只能由 `cocos-core-resolver` 注入 Cocos core，Native 只能由 `native-core-resolver` 注入 native core。

其他所有阶段都只能消费已经校验过的 active-target manifest，包括 project template、startup shell、debug/release shell、installer、updater、smoke runner、ordinary plugin resolver、third-party plugin entry selector 和 Runtime QPK activator。这些阶段既不能重新声明当前 active core，也不能先带上 Web / Cocos / Native core 全集再按目标过滤。二次声明 active core、混入 inactive core、或先全集后过滤，都按打包失败处理。

## 项目打包时绝对不能串的核心插件

打包到 Cocos、Web、Native 项目时，核心插件的接线必须只发生在当前目标的 packager resolver 里，且只能发生一次：

- Web 工程：只允许 `web-core-resolver` 注入 Web core。不能带 Cocos host / renderer，不能带 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native` 或 Rust native runtime / renderer metadata。
- Cocos 工程：只允许 `cocos-core-resolver` 注入 Cocos core。不能带 Web renderer / framework adapter，也不能带 native engine/assets/store/runtime/renderer。
- Native 工程：只允许 `native-core-resolver` 注入 native core。不能带 `@quajs/renderer-web`、Web framework adapter、Web renderer subentry、Cocos host 或 Cocos renderer subentry。

项目模板、startup shell、debug/release shell、installer、updater、smoke runner、普通插件、shared preset、Runtime QPK 和第三方插件 shared entry 都不是 core plugin 注入点。它们只能读取 active-target manifest，不能自己 import、声明、合并、过滤或补齐任一目标的 core plugin。这里连“重新声明当前目标 active core”也算失败，因为它绕过了 packager resolver 和 manifest validation。

多目标构建要拆成三条独立 artifact plan。禁止先 materialize 一个三端全集，例如 `[webCore, cocosCore, nativeCore]`、`allRendererEntries`、跨目标 bootstrap shell 或 umbrella preset，再按目标过滤输出。这个反模式必须在 contracts suite 和 packager suite 里固定成负例。

## 核心插件不可串线的最终口径

打包到 Cocos、Web、Native 项目时，核心插件链路必须按目标物理隔离。这里的“不能串”不是只要求最终字段写对，而是要求从 packager entry、project template、startup shell、debug/release shell、installer、updater、smoke runner 到 Runtime QPK resolver 的整条链路都不能把其他目标的 core plugin materialize 进来。

每个目标只能有一个核心注入点：

- Web 只能由 `web-core-resolver` 注入 Web bootstrap、Web assets/store/runtime adapter、`@quajs/renderer-web`、Web framework adapter 和 Web renderer plugin subentry。
- Cocos 只能由 `cocos-core-resolver` 注入 Cocos bootstrap、Cocos host / asset / store bridge、`@quajs/renderer-cocos` 和 Cocos renderer plugin subentry。
- Native 只能由 `native-core-resolver` 注入 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 `@quajs/native-contracts` 元数据，以及 Rust native app/runtime/renderer capability metadata。

这些 core plugin 不能进入普通 `plugins`、shared preset、third-party shared entry、Runtime QPK `executableDependencies`、Runtime QPK `rendererEntries`、generated resolver、project template、debug shell、release shell、installer、updater 或 smoke runner。上述阶段只能读取当前目标已经写出的 active-target manifest 和只读 `TargetCoreSelection`，不能重新声明 active core，也不能携带 inactive core 再过滤。

因此，三类错误都必须按 blocker 处理：

- **跨目标串线**：Web 产物出现 Cocos / Native core，Cocos 产物出现 Web / Native core，Native 产物出现 Web / Cocos core。
- **二次注入**：project template、startup shell、installer、updater、smoke runner 或 Runtime QPK 自己重新声明 active target core，即使它声明的是当前目标，也失败，因为核心插件只能由当前 target resolver 注入一次。
- **全集后过滤**：任何实现先构造 `[webCore, cocosCore, nativeCore]`、`allRendererEntries`、跨目标 bootstrap shell 或 umbrella preset，再按 target 删除 / 过滤；即使最终 `target-bundle-manifest.json` 表面只剩一个目标，也失败，因为 inactive core 已进入 resolver graph、template graph 或构建壳层。

验收时要把打包输出看成三条互斥工程生成链，而不是同一个 app core 的三种外壳：

1. Web 工程生成器只消费 `web-core-resolver` 的 manifest。
2. Cocos 工程生成器只消费 `cocos-core-resolver` 的 manifest。
3. Native 工程生成器只消费 `native-core-resolver` 的 manifest。
4. 多目标批量构建必须拆成多个独立 artifact plan，各自独立完成 target selection、core resolver、ordinary plugin resolution、bundle、post-bundle graph scan、manifest emission 和 startup validation metadata 写入。
5. `projectGraphs` 必须证明 project-template、startup-shell、debug-shell、release-shell、installer、updater、smoke-runner、dev-server 等非 `post-bundle` 图完全平台无关；`post-bundle` 图只能出现 active core family，任何 inactive core root / subentry 都失败。

这条口径必须三端对称执行。不能只让 native 路径严格，Web 和 Cocos 也必须用同样 blocker 级别拒绝其他目标 core plugin。

## 工程生成硬门禁

打包到 Cocos、Web、Native 项目时，核心插件装配必须只发生一次，而且只能发生在当前目标的 packager resolver 里。项目模板、生成的 startup shell、debug/release shell、installer、updater、smoke runner 和 Runtime QPK 都不能再声明、合并、过滤或补齐任一目标核心插件。

这意味着三类工程生成器要按物理入口隔离：

- Web project generator 只能消费 `web-core-resolver` 产出的 active-target manifest。模板里不能 import Cocos host / renderer，也不能 import `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native` 或 Rust native metadata。
- Cocos project generator 只能消费 `cocos-core-resolver` 产出的 active-target manifest。Creator 接线、调试入口和构建脚本不能携带 Web renderer/framework adapter，也不能携带 native engine/assets/store/runtime/renderer。
- Native project generator 只能消费 `native-core-resolver` 产出的 active-target manifest。Rust app bootstrap、QuickJS startup、installer/updater 和 renderer smoke 不能携带 Web renderer subentry、Web framework adapter、Cocos host 或 Cocos renderer。

工程模板可以共享 platform-neutral 文件、schema、manifest emitter、package-root normalization 和 validation helper，但不能共享一个带核心插件的跨目标模板。任何“先生成一个包含 Web / Cocos / Native core 的项目，再按参数删除或过滤”的实现，都按核心插件串线处理，即使最终 `target-bundle-manifest.json` 看起来只剩一个目标。

如果一次打包任务同时生成多个目标工程，packager 也必须把它拆成多个独立 artifact plan。每个 plan 在自己的目标上下文里执行 target selection、core resolver、ordinary plugin resolution、bundle、post-bundle graph scan、manifest emission 和 startup validation metadata 写入。允许共享输入项目配置和平台无关资源清单，但不允许共享已经 materialize 的核心插件数组、renderer entry 列表、host bridge wiring 或 target bootstrap shell。

多目标批量打包的正确形态是：

1. `web` plan 调用 `resolveWebTargetCore()`，产出 Web 工程和 Web manifest。
2. `cocos` plan 调用 `resolveCocosTargetCore()`，产出 Cocos 工程和 Cocos manifest。
3. `native` plan 调用 `resolveNativeTargetCore()`，产出 Native 工程和 Native manifest。
4. 每个 plan 都独立运行 `validateTargetBundleManifest({ expectedTarget })`。
5. installer / updater / smoke runner 只读取对应 plan 已验证的 manifest，不回头重新拼 target core。

禁止形态是先生成 `[webCore, cocosCore, nativeCore]`、`allRendererEntries` 或跨目标 bootstrap shell，再按输出目标过滤。这个路径即使最终依赖图看起来已经删掉 inactive core，也必须视为失败，因为 inactive core 已经进入 resolver graph、模板 graph 或构建壳层。

## 项目产物接线边界

打包到具体 Web、Cocos、Native 工程时，要把核心插件当作目标私有线束，而不是普通插件配置的一部分。三端 project generator 只能读取各自 packager 已经写好的 active-target manifest，不能在模板、启动壳或分发脚本里重新拼 core plugin。

| 工程产物 | 唯一核心来源 | 模板 / 壳层允许做什么 | 必须失败的串线 |
| --- | --- | --- | --- |
| Web project | `web-core-resolver` 写出的 manifest | 读取 Web selected adapters、Web renderer entry、普通平台无关插件 | 模板、dev server、PWA/installer/updater、Runtime QPK 或 debug shell 携带 Cocos / Native core；先生成三端 core 再过滤 |
| Cocos project | `cocos-core-resolver` 写出的 manifest | 读取 Cocos host / renderer selected adapters、普通平台无关插件 | Creator 接线、调试入口、构建脚本或 Runtime QPK 携带 Web / Native core；复用 Web renderer/framework adapter |
| Native project | `native-core-resolver` 写出的 manifest | 读取 native engine/assets/store、native contracts metadata、Rust app/runtime/renderer metadata | Rust app bootstrap、QuickJS startup、smoke runner、installer/updater 携带 Web renderer subentry 或 Cocos host/renderer |

这个边界要在产物依赖图里验证，而不是只看源码配置。`projectGraphs` 的 project-template、startup-shell、debug-shell、release-shell、installer、updater、smoke-runner、dev-server 和 custom 图都不能声明任何 target core，连 active target core 也不能二次声明；只有 post-bundle graph 可以包含 active target core family，并且必须拒绝 inactive target core。这样可以保证 Web、Cocos、Native 的核心插件只在对应 resolver 注入一次，后续所有项目生成、调试和分发步骤都只是消费已选 manifest。

## 术语

- `target core plugin`：安装目标 runtime adapter、renderer controller、host bridge、platform asset/store adapter、target renderer plugin entry 或 native renderer capability metadata 的 bootstrap 依赖。
- `ordinary game/plugin`：平台无关的 engine/game/plugin 逻辑。它可以声明 target compatibility metadata，但不能自己注入 Web / Cocos / Native core adapter。
- `TargetCoreSelection`：打包入口在解析普通插件之前生成的只读目标选择结果，是唯一可以携带 target core bootstrap adapter 的对象。
- `target-bundle-manifest.json`：bundle / tree-shake 后的产物交接契约。它必须证明当前 artifact 只有一个 target core family，并记录 `targetCoreResolver`、`selectedCorePluginFamily`、selected adapters、renderer entries、Runtime QPK dependency 和项目/产物依赖图。
- `projectGraphs`：`target-bundle-manifest.json` 中用于记录项目模板、startup shell、debug/release shell、installer、updater、smoke runner、dev server、post-bundle graph 等依赖图的字段。非 `post-bundle` 图必须保持平台无关，不能声明任何 Web / Cocos / Native target core adapter；`post-bundle` 图可以包含 active core family，但仍必须拒绝 inactive target core。

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

## Packager 代码组织要求

打包到 Cocos、Web、Native 项目时，packager 代码结构也要体现三端互斥，不能只在运行时参数上区分。推荐把目标核心装配拆成三个独立入口：

- `targets/web/resolveTargetCore`：只 import Web bootstrap、Web assets/runtime adapter、Web renderer / framework adapter、Web renderer plugin subentry。
- `targets/cocos/resolveTargetCore`：只 import Cocos bootstrap、Cocos host / renderer adapter、Cocos renderer plugin subentry。
- `targets/native/resolveTargetCore`：只 import `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、native contracts metadata 和 Rust native app/runtime/renderer capability metadata。

三端可以共享的只能是纯数据 helper：target 字符串归一化、manifest schema、dependency graph normalization、package-root normalization、diagnostic formatter、`validateTargetBundleManifest` 调用包装和 artifact plan 类型。只要某个 shared module import 了 Web / Cocos / Native 任一 target runtime adapter、renderer、host bridge、renderer plugin subentry 或 native bootstrap package，它就不能再是 shared module，必须移动到对应目标 resolver 目录。

多目标打包命令要实现成“多个独立 artifact plan 的循环”，而不是“一个 all-target core graph 的过滤”。正确流程是分别创建 `web`、`cocos`、`native` 的 resolver context，分别完成 bundle、post-bundle graph scan、manifest emission 和 startup metadata 写入。禁止输出一个公共 project template / startup shell / smoke runner，再根据 target 参数过滤 core plugin；模板和壳层只能读取当前 artifact 已经校验过的 `target-bundle-manifest.json`。

代码 review 时要特别查这些反模式：

- `targets/index.ts` 或 barrel file 在模块顶层 import 三端 resolver 并导出一个 materialized core plugin map。
- `corePluginsByTarget`、`allCorePlugins`、`allRendererEntries`、`createCorePluginsForAllTargets()` 这类 helper 返回或缓存三端 core union。
- Web / Cocos / Native project template、debug shell、installer、updater、smoke runner 自己 import 或声明 active core，而不是读取 emitted manifest。
- Runtime QPK resolver、ordinary plugin resolver、LSP、benchmark 或 native smoke path import target core adapter 以获取 metadata。

这些反模式都要有 packager 负例 fixture。即使最终 manifest 的 `target` / `selectedCorePluginFamily` 看起来正确，只要中间 resolver graph、template graph 或 shell graph materialize 过其他目标 core plugin，就按核心插件串线失败。

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
- `projectGraphs` 必须同时扫描 `specifier` 与 `packageName`，把 subentry、`npm:` specifier、`?query` / `#hash` 后缀、Windows/backslash 路径、`node_modules` 路径和 pnpm `.pnpm` store 路径归一到 package root 后再判定是否串线。项目模板、startup shell、debug/release shell、installer、updater、smoke runner 和 dev server 图里出现任一 target core 都要失败；post-bundle 图里出现 inactive target core 要失败。
- debug 与 release 产物使用同一套 blocker。debug 可以多 sourcemap / diagnostics，但不能放宽核心插件隔离。

验收时必须证明三端互斥，而不是只证明 native 严格：

- Web 产物里出现 Cocos 或 Native core 直接失败。
- Cocos 产物里出现 Web 或 Native core 直接失败。
- Native 产物里出现 Web 或 Cocos core 直接失败。
- 任何先构造 Web / Cocos / Native 三端核心插件全集再按 target 过滤的实现，即使最终 manifest 看似正确，也必须失败，因为 inactive core 已经进入 resolver graph。

## 装配责任表

为了避免“打包到 Cocos、Web、Native 项目时核心插件串线”，每个工程接线点的权限要固定下来：

| 接线点 | 可以做什么 | 禁止做什么 | 必须调用的门禁 |
| --- | --- | --- | --- |
| Web packager entry | 创建 `web-core-resolver`，注入 Web bootstrap / Web renderer / Web renderer plugin entry | import Cocos 或 Native core；复用三端全集 resolver | `createTargetCoreSelection("web")`、`validateExclusiveTargetBootstrap`、`validateTargetBundleManifest({ expectedTarget: "web" })` |
| Cocos packager entry | 创建 `cocos-core-resolver`，注入 Cocos host / renderer / renderer plugin entry | import Web 或 Native core；复用三端全集 resolver | `createTargetCoreSelection("cocos")`、`validateExclusiveTargetBootstrap`、`validateTargetBundleManifest({ expectedTarget: "cocos" })` |
| Native packager entry | 创建 `native-core-resolver`，注入 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native` 和 Rust metadata | import Web / Cocos core；把 native core 放进普通插件列表 | `createTargetCoreSelection("native")`、`validateExclusiveTargetBootstrap`、`validateTargetBundleManifest({ expectedTarget: "native" })` |
| Quack config / CLI plugin loader | 读取普通插件引用和 shared preset，先做静态隔离检查 | 在检查前加载插件实现；允许 `specifier` 或 `packageName` 藏 target core subentry | `validateOrdinaryPluginListTargetIsolation`、Quack 封装的 assert helper |
| ordinary plugin resolver | 只消费只读 `TargetCoreSelection` 和平台无关 contracts | 追加、替换或二次声明任一 target core adapter | `validateOrdinaryPluginListTargetIsolation` |
| third-party plugin entry selector | materialize `shared` + active target entry | eager import inactive target entry；shared entry import target core | `validateTargetPluginManifest` |
| Runtime QPK resolver / activator | 只评估 active target compatibility block，加载 QS / JS / resources | 声明 target core executable dependency / renderer entry；覆盖 native host renderer metadata | runtime package native-code guard、`validateTargetBundleManifest` runtime package checks |
| post-bundle graph checker | 在 bundle / tree-shake 后扫描真实依赖图并写入 `projectGraphs(kind: "post-bundle")` | 只信源码配置；只扫 `packageName` 或只扫 `specifier` | `validateTargetBundleManifest` |
| debug shell / smoke runner | 读取已选 target manifest，做轻量启动或 projection smoke，并把自身依赖写入 `projectGraphs` | 构造三端 core 列表；重新声明 active core；绕过 manifest validation | `validateTargetBundleManifest` 的 `projectGraphs` 检查 |
| installer / updater | 复用已验证 artifact manifest 和版本目录，并把自身依赖写入 `projectGraphs` | 重新声明、合并或替换 core adapters | release manifest validation、版本产物不可变检查、`projectGraphs` 检查 |

实现上要把这张表当成代码结构约束，而不是发布前人工检查。能 import target runtime adapter、renderer 或 host bridge 的模块，只能位于对应 target resolver 之下；其余模块只能处理序列化 metadata、schema、normalization 和 validation。

## 检查层级

核心插件隔离必须在五层都成立：

1. **Bootstrap selection**：`validateExclusiveTargetBootstrap` 确认只注册一个 core family。
2. **Ordinary plugin list**：`validateOrdinaryPluginListTargetIsolation` 拦截普通 `plugins`、shared preset、CLI plugin reference、generated resolver 中的 target core root / subentry。
3. **Plugin entry selection**：`validateTargetPluginManifest` 确认 shared entry 平台无关，active target entry 只 import 当前目标 adapter，inactive entries 不 eager。
4. **Project graphs and post-bundle graph**：`projectGraphs` 记录项目模板、startup shell、debug/release shell、smoke runner、installer、updater、dev server、custom graph 和 post-bundle dependency graph。非 `post-bundle` 图只允许平台无关依赖，连 active target core 也不能重新声明；`post-bundle` 图允许 active core 但必须拒绝 inactive core，即使该图来自先构造 Web / Cocos / Native 三端核心全集再过滤的路径。所有图都要同时检查 `specifier` 与 `packageName`，并把 subentry、query/hash-suffixed bundler specifier、Windows 路径、`node_modules` 路径和 pnpm store 路径归一到 package root，例如 `@quajs/renderer-web/plugins/audio?import` 或 `node_modules/@quajs/renderer-web/plugins/audio.js` 仍然是 Web core。
5. **Startup / Runtime QPK**：`validateTargetBundleManifest` 和 runtime startup 重复校验 `target`、`targetCoreResolver`、selected adapters、renderer entries、Runtime QPK executable dependencies 与 active target 一致。

任何一层通过都不能代表其他层安全。尤其要注意 `specifier` 和 `packageName` 双字段：安全的 `packageName` 不能掩盖 `specifier` 里的 target core subentry，反过来也一样。

## 打包入口落点

Web / Cocos / Native 的 debug、release、installer、updater 和 hand-built shell 必须复用同一套 isolation helper。

核心插件接线点要固定在目标 packager entry，而不是项目模板内部：

- Web packager entry 调用 `resolveWebTargetCore()` 后，把 selected Web adapters 写入 `target-bundle-manifest.json`；Web starter、debug shell、installer 和 updater 只读取 manifest，不再 import `@quajs/renderer-web` 以外的目标核心插件，也不重新声明 Web core。
- Cocos packager entry 调用 `resolveCocosTargetCore()` 后，把 selected Cocos adapters 写入 `target-bundle-manifest.json`；Cocos 项目工程、Creator 接线、debug shell、installer 和 updater 只读取 manifest，不 import Web/native core。
- Native packager entry 调用 `resolveNativeTargetCore()` 后，把 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、native contracts metadata 和 Rust renderer metadata 写入 `target-bundle-manifest.json`；native app、smoke runner、installer 和 updater 只复验 manifest，不 import Web/Cocos core。

任何项目模板、installer、updater、debug shell 或 smoke runner 如果自己构造 Web / Cocos / Native core 插件列表，就算最终看起来只选择了一个目标，也按核心插件串线处理。目标核心插件只能在 packager entry 中注入一次；后续步骤只能消费、校验和分发已选 target manifest。

## 三类项目模板装配边界

打包到 Cocos、Web、Native 项目时，项目模板和启动代码也必须遵守同一条 target-first 规则。核心插件不能先进入一个跨目标工程模板，再由模板参数、运行时分支或构建脚本过滤。

- Web 项目模板只能装配 Web bootstrap、Web asset/runtime adapter、Web renderer/framework adapter 和 Web renderer plugin entry。它不能携带 Cocos host、Cocos renderer、`@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native` 或 Rust native metadata。
- Cocos 项目模板只能装配 Cocos host、Cocos renderer adapter 和 Cocos renderer plugin entry。它不能携带 Web renderer/framework adapter，也不能携带 native engine/assets/store/runtime/renderer。
- Native 项目模板只能装配 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 native contracts metadata，以及 Rust native app/runtime/renderer capability metadata。它不能携带 Web renderer subentry、Web framework adapter、Cocos host 或 Cocos renderer。

每个项目模板只能从当前目标的 resolver 接收 `TargetCoreSelection`。模板代码、starter、debug shell、installer、updater 和 smoke runner 都不能自己 import 或声明 target core adapter；它们只能消费已经写入产物的 `target-bundle-manifest.json` 并复验。这样可以避免“源码层看起来按目标过滤，但项目模板里已经混入另一端核心插件”的串线。

这条规则同样适用于第三方插件和 Runtime QPK：第三方插件可以在 source manifest 中声明 Web / Cocos / Native 多目标 entry，但项目产物只能 materialize `shared` + active target entry；Runtime QPK 可以保留多目标 compatibility metadata，但不能携带任一 target core executable dependency 或跨目标 renderer entry。

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
- `packageName` 看似平台无关，但 `specifier` 指向 target core subentry、query/hash-suffixed dependency、`node_modules` 路径或 pnpm store 路径，或反过来。
- shared plugin entry eager import Web / Cocos / Native 任一 core adapter。
- inactive target entry 通过 barrel export 或 side-effect import 进入 active artifact。
- Runtime QPK `executableDependencies` 或 `rendererEntries` 指向 target core root / subentry。
- renderer entry 缺失显式 `target`，或 target 与 artifact 不一致。
- post-bundle graph 发现 foreign target core root / subentry，或在 active core 之外残留 Web / Cocos / Native 三端全集中的 inactive core。
- debug shell、installer、updater manifest 跳过 Quack 主路径但声明错误 core family。
- packager 先构造 `[webCore, cocosCore, nativeCore]` 三端全集，再按 target 过滤。即使最终 manifest 看起来只剩一个 target，也必须失败。

## CI 门禁

CI 至少拆两组：

- contracts suite：只用 `@quajs/native-contracts` fixture，对称覆盖 Web / Cocos / Native 的 `validateExclusiveTargetBootstrap`、`validateOrdinaryPluginListTargetIsolation`、`validateTargetPluginManifest` 和 `validateTargetBundleManifest`。
- packager suite：在 Quack / project packaging 层构造 debug、release、installer、updater、hand-built shell、post-bundle dependency graph fixture，确认所有路径都调用同一套 helper。

Release promotion 前必须使用 post-bundle manifest 做最终校验。Debug 产物可以包含额外诊断和 sourcemap，但不能放宽 target core isolation。

## 打包目标接线验收清单

打包到 Cocos、Web、Native 项目时，核心插件隔离需要按“项目生成链路”验收，而不是只按 manifest 字段验收。每条链路只允许自己的 packager resolver 注入一次 target core；后续模板、启动壳、debug/release shell、installer、updater、smoke runner、Runtime QPK 和第三方插件只能读取已验证的 active-target manifest。

| 目标 | 唯一注入点 | 允许进入 post-bundle graph 的 core | 任何阶段都必须拒绝 |
| --- | --- | --- | --- |
| Web | `web-core-resolver` | Web bootstrap、`@quajs/assets-web`、`@quajs/renderer-web`、选中的 Web framework adapter、Web renderer plugin subentry | Cocos host / renderer、`@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、Rust native runtime / renderer metadata |
| Cocos | `cocos-core-resolver` | Cocos bootstrap、Cocos host / asset / store bridge、`@quajs/renderer-cocos`、Cocos renderer plugin subentry | Web assets / renderer / framework adapter、native engine/assets/store/runtime/renderer metadata |
| Native | `native-core-resolver` | `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 native contracts metadata、Rust native app/runtime/renderer capability metadata | `@quajs/assets-web`、`@quajs/renderer-web`、Web framework adapter、Cocos host / renderer |

工程生成器要用同一个负例矩阵证明“不能先三端全集再过滤”：

- Web / Cocos / Native 各有一个正例：只从对应 resolver materialize core，模板和启动壳只读取 emitted manifest。
- Web / Cocos / Native 各有一个负例：packager 先构造 `[webCore, cocosCore, nativeCore]` 或 `allRendererEntries` 再按 target 过滤。即使最终 manifest 看起来只剩一个目标，也必须失败。
- Web / Cocos / Native 各有一个模板负例：project template、starter、debug/release shell、installer、updater 或 smoke runner 自己 import、声明、合并或过滤任一 target core。这个失败条件同时适用于 active core 和 inactive core，因为核心插件只能由 packager resolver 注入一次。
- Web / Cocos / Native 各有一个 Runtime QPK 负例：Runtime QPK 的 `executableDependencies`、`rendererEntries` 或 generated resolver 引用任一 target core root / subentry。QPK 可以保留多目标 compatibility metadata，但不能成为 target core 安装点。

`projectGraphs` 的验收规则要保持简单且强硬：

- `project-template`、`startup-shell`、`debug-shell`、`release-shell`、`installer`、`updater`、`smoke-runner`、`dev-server`、`custom` graph 必须完全平台无关，连 active target core 也不能出现。
- `post-bundle` graph 只能出现 active target core family 和平台无关依赖，任何 inactive target core root / subentry 都是 blocker。
- 所有 graph entry 必须同时检查 `specifier` 和 `packageName`，并归一化 bare subentry、`npm:` specifier、`?query` / `#hash` 后缀、Windows/backslash 路径、`node_modules` 路径和 pnpm `.pnpm` store 路径。

产物图还必须能回答“这个 core plugin 是从哪里来的”。每个 Web / Cocos / Native artifact plan 都要记录唯一的 `targetCoreResolver`、`selectedCorePluginFamily` 和 core 注入阶段；非 `post-bundle` 图如果出现任何 target core，说明模板、启动壳或分发脚本越权注入，直接失败。`post-bundle` 图里如果出现 active core 以外的 family，说明打包链路发生串线，直接失败。任何 graph 不能只证明“最终剩下一个目标”，还必须证明没有经历过 `[webCore, cocosCore, nativeCore]` 或 `allRendererEntries` 这种先全集后过滤的中间态。

这条验收清单要进入 contracts suite 和 packager suite，且三端对称执行。Native 不能是唯一严格路径；Web 和 Cocos 也必须以同样 blocker 级别拒绝其他目标核心插件。
