# Native Renderer 技术方案

这是一份面向 `packages/native` 的工作方案，目标是把 QuaEngine 的 native 路线收敛成一个独立、可验证、可分阶段推进的产品面。

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

## Target Core 隔离红线

打包到 Web、Cocos、Native 项目时，核心 bootstrap 插件必须视为三套互斥根，而不是普通插件：

- Web 产物只能携带 Web core resolver、Web assets / renderer / framework adapter。
- Cocos 产物只能携带 Cocos host / renderer adapter。
- Native 产物只能携带 `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 native contracts metadata，以及 Rust native app / runtime / renderer。

不能把三端核心插件放进同一个 shared preset、普通 `plugins` 数组、generated resolver、Runtime QPK executable dependency 或运行时按条件选择的 umbrella bootstrap。正确做法是 target-first：先 materialize 唯一 `TargetCoreSelection`，再解析普通 game/plugin 和 Runtime QPK。最终产物还必须在 bundle / tree-shake 之后重新校验依赖图和 `target-bundle-manifest.json`，确认没有残留其他 target core 根包或子入口。

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
- [QUI / QSS 语法与组件系统](./qui-qss.md)
- [语言服务器、VSCode、测试、benchmark](./tooling-testing.md)

## 推荐实施顺序

1. 锁定 contracts、target isolation、manifest / capability 流程。
2. 定义 QUI / QSS 语法和组件 registry。
3. 扩展 native language-server 与 VSCode 插件的项目索引、definitions、references、rename 与 code actions。
4. 完成 renderer base primitives、composite UI、media 路线。
5. 接入 packaging / signing / distribution。
6. 建立 benchmark、验收和发布门禁。
