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

## 三目标打包隔离门禁

Web、Cocos、Native 打包是三条互斥目标链路，不是同一套核心插件列表的三种输出格式。每个目标产物都必须先 materialize 唯一的 `TargetCoreSelection`，再解析普通 game/plugin 和 Runtime QPK；任何 shared preset、普通 `plugins`、generated resolver、renderer entry 或 Runtime QPK executable dependency 里出现 Web / Cocos / Native target core 根包或子入口，都必须作为 release blocker。

验收时至少覆盖这些门禁：

- `validateExclusiveTargetBootstrap`：最终依赖图只能注册一个 target core family。
- `validateOrdinaryPluginListTargetIsolation`：普通插件列表不能包含 target core adapter。
- `validateTargetPluginManifest`：第三方插件只能选择当前 target entry，shared entry 不能 import 任一 target core。
- `validateTargetBundleManifest`：`target`、`targetCoreResolver`、selected adapters、renderer entries、Runtime QPK dependency 必须同属一个 core family。
- Runtime QPK：可以声明多端 compatibility metadata，但不能携带或激活任何 Web / Cocos / Native core adapter。

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
