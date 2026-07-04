# Native Renderer 技术方案

这是一份面向 `packages/native` 的工作方案，目标是把 QuaEngine 的 native 路线收敛成一个独立、可验证、可分阶段推进的产品面。

完整调研与总计划见根目录方案：[Native WGPU + QuickJS Renderer, QUI, QSS, And Native Authoring Plan](../native-wgpu-quickjs-renderer.md)。本目录是按执行主题拆开的落地版，后续 native renderer 开发优先从这里查边界、验收和拆包规则。

如果需要一份可以直接排期、拆任务和对照验收的总纲，优先看 [Native Renderer 执行总计划](execution-plan.md)。它把 wgpu + QuickJS 调研结论、`packages/native` 工程结构、QUI/QSS 语法、LSP/VSCode、动态 QPK、插件兼容、benchmark、内存指标、打包分发和 Web/Cocos/Native 核心插件隔离收束到一张实施路线图。

## 快速门禁

打包到 Cocos、Web、Native 项目时，核心插件不能串线。三端必须是三条互斥工程生成链：Web 只走 `web-core-resolver`，Cocos 只走 `cocos-core-resolver`，Native 只走 `native-core-resolver`。project template、startup shell、debug/release shell、installer、updater、smoke runner、Runtime QPK 和普通插件都只能读取已验证的 active-target manifest，不能重新声明 active core，也不能先携带三端核心插件全集再过滤。

更具体地说，核心插件只允许由当前目标 resolver 注入一次：

| 目标工程 | 唯一核心来源 | 必须排除 |
| --- | --- | --- |
| Web | `web-core-resolver` | Cocos host / renderer、Native engine/assets/store/runtime/renderer |
| Cocos | `cocos-core-resolver` | Web renderer/framework adapter、Native engine/assets/store/runtime/renderer |
| Native | `native-core-resolver` | Web renderer/framework adapter、Cocos host / renderer |

项目模板、启动壳、debug/release shell、installer、updater、smoke runner、Runtime QPK 和第三方 shared entry 都不是 core plugin 装配点。它们二次声明当前 active core 也必须失败，因为这会绕过 packager resolver 和 `target-bundle-manifest.json` 的门禁。

详细执行口径以 [target-core-isolation.md](target-core-isolation.md) 为准；任何改动 packaging、project generator、starter、debug/release shell、installer、updater、smoke runner 或 Runtime QPK resolver 的计划，都必须同步检查该文件和 [tooling-testing.md](tooling-testing.md) 中的三端隔离 fixture，确保 Web / Cocos / Native 核心插件不会串线。

## 范围

- QuickJS + wgpu 的 native renderer。
- QUI / QSS 的独立 DSL、编译器、语言服务器和 VSCode 插件。
- native 侧的 assets / store / engine 适配层。
- macOS / Windows 优先，Linux 其次的打包、签名、分发。
- 动态小包、兼容性、benchmark、验收与回归策略。

## 当前已确认的实现基础

- `packages/native/contracts`
- `packages/native/engine-native`
- `packages/native/assets-native`
- `packages/native/store-native`
- `packages/native/ui-compiler`
- `packages/native/language-server`
- `packages/native/vscode`
- Rust crate:
  - `packages/native/crates/quajs_native_runtime`
  - `packages/native/crates/quajs_wgpu_renderer`
  - `packages/native/crates/quajs_native_app`

当前已存在的关键约束和实现点：

- target bootstrap 已区分 `web / cocos / native`。
- `target-bundle-manifest.json` 已有 native 专用校验链。
- native renderer 已有基础能力清单，包含 stage layout、image、video fallback、text、ui.surface、pointer。
- Rust renderer 只消费解析后的投影数据，不负责 QSS 解析、selector matching、cascade 或语言诊断。
- native runtime package guard 已能拦截 native code payload。
- QUI / QSS authoring 已有 native 专用 compiler、LSP 和 VSCode extension 基础包。

## 核心原则

1. native renderer 只做 projection，不做游戏状态 authority。
2. 动态包只允许 `qs / js / resources`，不允许 native code。
3. Web / Cocos / native 三套 target core 不能混装。
4. QUI / QSS 的编译、诊断、补全、格式化都在 TS 工具链层完成。
5. Rust renderer 只接收 resolved AST / IR / capability metadata。
6. base component 要尽量小，dialog / drawer / save-load / settings 之类上层 UI 用 composite 组装。
7. 打包流程必须 target-first：先确定 Web、Cocos 或 Native，再解析普通插件；不能先加载三端核心插件全集再靠过滤输出。
8. 打包到 Web / Cocos / Native 工程时，核心插件必须是目标私有 bootstrap：只允许当前目标 resolver 注入一次，项目模板、启动壳、Runtime QPK、installer、updater、smoke runner 和普通插件都不能重新声明 active core，也不能携带其他目标 core 后过滤。

## 打包到 Web / Cocos / Native 的核心插件接线红线

Web、Cocos、Native 不是同一套核心插件的三种输出格式，而是三条互斥 project packaging 链。每个目标工程只能由自己的 packager resolver 注入一次 core plugin：

- Web 只能由 `web-core-resolver` 注入 Web bootstrap、Web assets/runtime adapter、Web renderer / framework adapter 和 Web renderer plugin subentry。
- Cocos 只能由 `cocos-core-resolver` 注入 Cocos bootstrap、Cocos host / renderer adapter 和 Cocos renderer plugin subentry。
- Native 只能由 `native-core-resolver` 注入 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 native contracts metadata，以及 Rust native app/runtime/renderer capability metadata。

这些 core plugin 不能进入普通 `plugins`、shared preset、third-party shared entry、Runtime QPK executable dependency、Runtime QPK renderer entry、project template、startup shell、debug/release shell、installer、updater 或 smoke runner。上述阶段只能读取当前目标已经验证过的 `target-bundle-manifest.json` 和只读 `TargetCoreSelection`，不能重新声明 active core，也不能携带 inactive core 后过滤。

多目标打包必须拆成多个独立 artifact plan：Web plan 只 materialize Web resolver，Cocos plan 只 materialize Cocos resolver，Native plan 只 materialize Native resolver。禁止先构造 `[webCore, cocosCore, nativeCore]`、`allRendererEntries` 或跨目标 bootstrap shell 再按目标过滤；即使最终 manifest 表面上只剩一个目标，也按核心插件串线失败处理。

验收时要按具体工程产物检查，而不是只看最终 manifest 字段：Web 工程模板、Cocos Creator 工程、Native Rust app 工程、debug/release shell、installer、updater、smoke runner 和 post-bundle graph 都必须证明只消费当前目标 resolver 写出的 active-target manifest。任一工程生成链路只要 transiently materialize 了另外两个目标的 core plugin，或在模板/壳层重新声明 active core，都按核心插件串线失败处理。

## Target Core 隔离红线

打包到 Web、Cocos、Native 项目时，核心 bootstrap 插件必须视为三套互斥根，而不是普通插件：

- Web 产物只能携带 Web core resolver、Web assets / renderer / framework adapter。
- Cocos 产物只能携带 Cocos host / renderer adapter。
- Native 产物只能携带 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 native contracts metadata，以及 Rust native app / runtime / renderer。

这条规则的最终验收口径是：核心插件只允许由当前目标 packager resolver 注入一次。Web、Cocos、Native 项目模板、startup shell、debug/release shell、installer、updater、smoke runner、Runtime QPK 和第三方插件 entry 都不能成为第二个 core plugin 注入点；它们只能读取已验证的 active-target manifest。即使重新声明的是当前目标的 active core，也按串线失败处理，因为这会让模板或壳层绕过 resolver 和 manifest 门禁。

这三个核心插件集合不能串线，也不能在代码里先聚合再过滤。Web、Cocos、Native 必须分别从自己的 packaging resolver 入口开始；普通插件、shared preset、Runtime QPK、debug shell、installer、updater 和 smoke runner 都只能消费已选定的 `TargetCoreSelection`，不能把任一 target core adapter 当作普通插件传递或二次声明。

不能把三端核心插件放进同一个 shared preset、普通 `plugins` 数组、generated resolver、Runtime QPK executable dependency 或运行时按条件选择的 umbrella bootstrap。正确做法是 target-first：先 materialize 唯一 `TargetCoreSelection`，再解析普通 game/plugin 和 Runtime QPK。最终产物还必须在 bundle / tree-shake 之后重新校验依赖图和 `target-bundle-manifest.json`，确认没有残留其他 target core 根包或子入口。

项目模板和启动壳也不能绕过这条规则。Web starter 只能接 Web resolver，Cocos starter 只能接 Cocos resolver，Native starter 只能接 Native resolver；debug shell、installer、updater 和 smoke runner 都只能消费当前目标已经产出的 `target-bundle-manifest.json`。它们不能自己 import、声明或合并 Web / Cocos / Native 任一 target core adapter，也不能用一个跨目标模板先带上三端核心插件再过滤。

`target-bundle-manifest.json` 通过 `projectGraphs` 显式记录这些图：project template、startup shell、debug/release shell、smoke runner、installer、updater、dev server 和 post-bundle graph。非 `post-bundle` 图只能包含平台无关依赖，不能声明任何 target core，包括 active core；`post-bundle` 图可以包含 active core family，但必须拒绝 inactive target core。

打包成具体 Web / Cocos / Native 工程时，核心插件隔离的验收定义是“当前目标 resolver 注入一次，其他所有阶段只读 manifest”：

- Web 工程生成器只能接收 `web-core-resolver` 输出，不能携带或过滤 Cocos / Native core。
- Cocos 工程生成器只能接收 `cocos-core-resolver` 输出，不能携带或过滤 Web / Native core。
- Native 工程生成器只能接收 `native-core-resolver` 输出，不能携带或过滤 Web / Cocos core。
- project template、startup shell、debug/release shell、installer、updater、smoke runner 和 Runtime QPK 都不得成为第二个 core plugin 注入点。
- 任一阶段出现两个 target core family，或先构造三端全集再过滤，都必须作为打包失败处理，即使最终 manifest 表面上只剩一个目标。

换句话说，打包到 Cocos、Web、Native 项目时，核心插件接线必须只发生在当前目标 packager resolver 里：

- Web 项目只能由 Web resolver 注入 Web core，不能把 Cocos / Native core 放进项目模板、普通插件或 Runtime QPK 后再过滤。
- Cocos 项目只能由 Cocos resolver 注入 Cocos core，不能复用 Web / Native bootstrap、renderer entry 或 host bridge。
- Native 项目只能由 Native resolver 注入 native core，不能携带 Web renderer subentry、Cocos renderer subentry 或其他目标 bootstrap。
- 多目标批量打包必须拆成多个独立 artifact plan。不能先生成 `[webCore, cocosCore, nativeCore]`、`allRendererEntries` 或跨目标 bootstrap shell 再按目标过滤到不同输出目录。

这条约束要覆盖源码配置、生成的项目模板、debug 产物、release 产物、installer、updater、smoke runner、Runtime QPK 和 post-bundle dependency graph。任何层级出现跨目标核心插件，都不是兼容性 warning，而是打包失败。

### 打包到目标工程时的核心插件边界

打包输出不是“同一个核心插件集合的三种工程格式”，而是三条互斥的工程生成链。Web、Cocos、Native 可以共享平台无关的 project schema、manifest emitter、dependency graph normalizer 和 validation helper，但不能共享任何已经携带 target core adapter 的模板、preset、resolver 或启动壳。

每个目标工程只能从自己的 packager resolver 接收一次核心插件注入：

- Web 工程只消费 `web-core-resolver` 产出的 active-target manifest。Web dev server、PWA shell、installer、updater 和 Runtime QPK 都不能携带 Cocos / Native core。
- Cocos 工程只消费 `cocos-core-resolver` 产出的 active-target manifest。Creator 模板、调试入口、构建脚本和 host bridge 配置不能携带 Web / Native core。
- Native 工程只消费 `native-core-resolver` 产出的 active-target manifest。Rust app bootstrap、QuickJS startup、renderer smoke、installer 和 updater 不能携带 Web / Cocos core。

如果一个构建命令同时产出 Web、Cocos、Native 三类工程，也必须先拆成三个独立 artifact plan，分别 materialize 当前目标 resolver、分别 bundle、分别 emit / validate `target-bundle-manifest.json`。不能先构造一个三端 core plugin union，再在每个输出目录里过滤；这个反模式必须在 contracts suite 和 packager suite 里作为负例固定下来。

核心插件装配必须按三条独立链路实现：

- `resolveWebCorePlugins()` 只能返回 Web bootstrap、Web asset/store/runtime adapter、Web renderer 和 Web renderer plugin subentry。
- `resolveCocosCorePlugins()` 只能返回 Cocos bootstrap、Cocos host/store/asset bridge、Cocos renderer 和 Cocos renderer plugin subentry。
- `resolveNativeCorePlugins()` 只能返回 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 `@quajs/native-contracts` 元数据，以及 Rust native app/runtime/renderer capability metadata。

这三个 resolver 不能通过一个 shared `resolveAllCorePlugins()`、barrel export 或 umbrella preset 间接聚合。普通 plugin resolver、Runtime QPK resolver、authoring LSP、benchmark、debug smoke 只能消费已经选好的 `TargetCoreSelection`，不能自己 import 或创建 Web / Cocos / Native 任一 target core adapter。

### 核心插件归属不可互借

打包实现里要把核心插件分成“目标 bootstrap 私有依赖”和“普通 game/plugin 依赖”两类。Web、Cocos、Native 的核心插件只能出现在各自 target resolver 的输出中，不能被项目插件、shared preset、Runtime QPK 或多目标第三方插件当作普通依赖复用。

| 核心插件家族 | 只能由谁注入 | 典型内容 | 禁止进入 |
| --- | --- | --- | --- |
| Web core | `web-core-resolver` | Web assets/store/runtime adapter、`@quajs/renderer-web`、Web framework adapter、Web renderer plugin subentry | Cocos / Native 产物、普通 `plugins`、Runtime QPK executable dependency、Native authoring/LSP/benchmark |
| Cocos core | `cocos-core-resolver` | Cocos host、Cocos renderer adapter、Cocos renderer plugin subentry | Web / Native 产物、普通 `plugins`、Runtime QPK executable dependency、Native authoring/LSP/benchmark |
| Native core | `native-core-resolver` | `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、native contracts metadata、Rust native app/runtime/renderer capability metadata | Web / Cocos 产物、普通 `plugins`、Runtime QPK executable dependency、Web/Cocos renderer entry |

Packager 需要先把 `targetCoreSelection` 和普通插件列表拆开，再进入 plugin resolution。普通插件解析阶段只允许读取平台无关 contracts 和 active target selection；如果它尝试追加 Web / Cocos / Native 任一 core root 或 subentry，必须立刻失败。产物侧还要在 bundle / tree-shake 后扫描 `specifier` 与 `packageName`，因为串线经常发生在 subentry、barrel export、side-effect import 或 generated resolver 里，而不是显眼的根包名里。

实现层还要约束命名和依赖方向，避免“看起来独立、实际先聚合再过滤”的实现滑进来：

- 允许：`resolveWebTargetCore()`、`resolveCocosTargetCore()`、`resolveNativeTargetCore()` 这类目标私有 resolver。
- 禁止：`resolveAllTargetCore()`、`createCorePluginsForAllTargets()`、`targetCorePreset` 这类三端全集 helper。
- 允许：普通插件接收已经生成的 `TargetCoreSelection` 作为只读上下文。
- 禁止：普通插件、shared preset、Runtime QPK、LSP、benchmark 或 smoke runner 自己 import 任一 target core adapter。
- 必须：Web / Cocos / Native 的 debug、release、installer、updater 和手写 shell 复用同一套 target isolation helper；不能只让 native 路线严格。

## 三目标打包隔离门禁

Web、Cocos、Native 打包是三条互斥目标链路，不是同一套核心插件列表的三种输出格式。每个目标产物都必须先 materialize 唯一的 `TargetCoreSelection`，再解析普通 game/plugin 和 Runtime QPK；任何 shared preset、普通 `plugins`、generated resolver、renderer entry 或 Runtime QPK executable dependency 里出现 Web / Cocos / Native target core 根包或子入口，都必须作为 release blocker。

实现时要把“目标核心插件”当成打包入口的私有 bootstrap，而不是项目插件生态的一部分：

- Web / Cocos / Native 三个 resolver 只能由对应目标的 packager 入口调用，不能被普通 plugin resolver、Runtime QPK resolver、UI compiler、LSP、benchmark 或 debug smoke 复用成共享依赖。
- 普通 game/plugin 只能看到已经选好的 `TargetCoreSelection` 和平台无关 engine/game contracts；它不能自己追加或替换 Web / Cocos / Native core adapter。
- 第三方 plugin 可以声明多目标 metadata，但 active artifact 只能选择当前 target entry。inactive target entry 只能作为 metadata 保留，不能通过 eager export、barrel file、side-effect import 或 generated resolver 进入依赖图。
- Runtime QPK 只能声明当前目标的兼容性需求和内容资源，不允许声明 Web / Cocos / Native 任一 target core adapter 作为 executable dependency 或 renderer entry。
- Web、Cocos、Native 的 debug、release、installer、updater、手写 shell、CI fixture 都必须复用同一套 isolation helper；不能只让 native 路线严格，Web/Cocos 放宽。

核心插件隔离需要按“目标先行、普通插件后置、产物复验”的顺序执行：

1. Web / Cocos / Native 打包入口分别创建自己的 resolver context，不能 import 一个三端全集再过滤。
2. `TargetCoreSelection` 是唯一可以携带 target core bootstrap adapter 的位置。
3. 普通 game/plugin、shared preset、第三方插件 shared entry 和 Runtime QPK executable dependency 都不得声明任一 target core adapter。
4. 多目标第三方插件只能在 packaging 阶段选择当前 target entry，inactive target entry 必须保持 metadata-only，不能 eager 进入依赖图。
5. bundle / tree-shake 后必须再扫产物依赖图和 `target-bundle-manifest.json`，防止源码层正确但 release 包里残留其他 target core。

三端核心插件归属必须保持互斥：

- Web：只允许 Web core resolver、Web assets/renderer/framework adapter。
- Cocos：只允许 Cocos host/renderer adapter。
- Native：只允许 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、`@quajs/native-contracts` 的必要元数据，以及 Rust native app/runtime/renderer。

验收时至少覆盖这些门禁：

- `validateExclusiveTargetBootstrap`：最终依赖图只能注册一个 target core family。
- `validateOrdinaryPluginListTargetIsolation`：普通插件列表不能包含 target core adapter。
- `validateTargetPluginManifest`：第三方插件只能选择当前 target entry，shared entry 不能 import 任一 target core。
- `validateTargetBundleManifest`：`target`、`targetCoreResolver`、selected adapters、renderer entries、Runtime QPK dependency 必须同属一个 core family。
- Runtime QPK：可以声明多端 compatibility metadata，但不能携带或激活任何 Web / Cocos / Native core adapter。

### 打包工程时的唯一核心来源

Web、Cocos、Native 的 project generator 只能消费各自 packager resolver 写出的 active-target manifest，不能自己重新声明核心插件。Web starter、Cocos Creator 模板、Native Rust app bootstrap、debug shell、release shell、installer、updater 和 smoke runner 都必须是 `target-bundle-manifest.json` 的只读消费者。

这条规则同时禁止两种容易滑进去的实现：一是模板或壳层重新声明当前 active core，二是先构造 Web / Cocos / Native 三端核心插件全集再按目标过滤。前者绕过了唯一 resolver，后者让 inactive core 进入过 resolver graph 或模板 graph；两者都按打包失败处理。

## 目标工程输出隔离清单

打包到 Cocos、Web、Native 项目时，核心插件不能先进入同一个集合再按目标筛选。每个目标工程必须从自己的 packager entry 开始，输出自己的 project template、startup shell、debug/release shell、installer/updater manifest 和 post-bundle graph。

- Web 工程只允许 Web core resolver 注入 Web bootstrap、`@quajs/assets-web`、`@quajs/renderer-web`、选中的 Web framework adapter 和 Web renderer plugin subentry。
- Cocos 工程只允许 Cocos core resolver 注入 Cocos host / asset / store bridge、`@quajs/renderer-cocos` 和 Cocos renderer plugin subentry。
- Native 工程只允许 Native core resolver 注入 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、native contracts metadata，以及 Rust native app/runtime/renderer capability metadata。

这些核心插件只能由当前目标 resolver 注入一次。普通 plugin resolver、Runtime QPK resolver、project template、debug shell、smoke runner、installer、updater、benchmark 和 LSP 都只能消费已经写好的 active-target manifest，不能重新声明、合并、过滤或补齐 Web / Cocos / Native 任一 core plugin。多目标构建命令也必须拆成多个独立 artifact plan；禁止先构造 `[webCore, cocosCore, nativeCore]` 或 `allRendererEntries` 再过滤到各输出目录。

验收上要对称检查三端：

- Web 产物出现 Cocos / Native core，失败。
- Cocos 产物出现 Web / Native core，失败。
- Native 产物出现 Web / Cocos core，失败。
- 任意产物先 materialize 三端 core union 后再过滤，失败，即使最终 `target-bundle-manifest.json` 看起来只剩一个目标。

## 开发规范落点

未来 engine 新能力迭代时，必须先判断它属于平台无关能力、target core bootstrap、target renderer entry，还是普通 game/plugin 能力。只有平台无关能力可以进入 shared engine/game/plugin 包；Web / Cocos / Native core bootstrap 只能由各自 target resolver 注入。

第三方 plugin manifest 需要显式声明 Web / Cocos / Native 的目标兼容性和入口：

- shared entry 只能 import 平台无关逻辑。
- Web entry 只能 import Web core / Web renderer entry。
- Cocos entry 只能 import Cocos host / renderer entry。
- Native entry 只能声明 native renderer 版本、capability、asset kind、QUI component、QSS feature 等兼容性，并通过 native target resolver 接入 `@quajs/engine-native` / `@quajs/assets-native` / `@quajs/store-native`。
- inactive target entry 只能作为 metadata 存在，不能 eager import、barrel export 或 side-effect import 进入 active artifact。

开发规范和 review checklist 需要把 target core 串线作为 blocker：普通插件、shared preset、Runtime QPK、generated resolver、debug shell、installer / updater manifest 都不能二次声明 Web / Cocos / Native core adapter。新增能力同时影响 Web、Cocos、Native 时，要分别补齐三个 target entry / adapter 的兼容声明和测试，而不是创建一个包含三端核心插件全集的共享 preset。

## 文档索引

- [架构与包结构](./architecture.md)
- [Web / Cocos / Native 核心插件隔离](./target-core-isolation.md)
- [QUI / QSS 语法与组件系统](./qui-qss.md)
- [语言服务器、VSCode、测试、benchmark](./tooling-testing.md)
- [Native 打包、加固与分发方案](./release-packaging.md)
- [Native 目标开发规范与插件兼容方案](./development-guidelines.md)

## 推荐实施顺序

1. 锁定 contracts、target isolation、manifest / capability 流程。
2. 定义 QUI / QSS 语法和组件 registry。
3. 扩展 native language-server 与 VSCode 插件的项目索引、definitions、references、rename 与 code actions。
4. 完成 renderer base primitives、composite UI、media 路线。
5. 接入 packaging / signing / distribution。
6. 建立 benchmark、验收和发布门禁。

## 本轮调研结论补充

- QuickJS + wgpu 路线可行：QuickJS 负责受限 JS / QS runtime module 执行，wgpu 负责跨平台 GPU 投影渲染，Rust native app 负责 host bridge、window、resource lifecycle、packaging identity。
- native renderer 的目标是达到 Web renderer 类似的投影效果，而不是实现浏览器。菜单、dialog、drawer、save/load、settings 等产品 UI 应由 QUI/QSS composite 组装；Rust 只维护稳定基础 component 和 resolved projection DTO。
- QUI/QSS、LSP、VSCode extension、benchmark、assets/store/native adapters 都放在 `packages/native` 下；native language-server 与 native VSCode plugin 独立于现有 QuaScript tooling。
- 动态小包只能包含 QS / JS / resources / QUI / QSS / tokens，不能携带任何 native code；native renderer 版本、runtime 版本、assets-native 版本和 store-native 版本都来自 signed Rust native host。
- 打包到 Web、Cocos、Native 时核心插件绝对不能串线；三端必须各自从对应 resolver 开始，project template、debug/release shell、installer、updater、smoke runner 和 Runtime QPK 都只能读取已验证 manifest。
