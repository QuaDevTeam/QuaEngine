# Native 目标开发规范与插件兼容方案

## 目标

未来 QuaEngine 新能力不能只按 Web 思路设计再让 Cocos / native 补洞。每个 renderer-facing 能力在进入稳定 API 前都要明确：

- 平台无关 engine / plugin contract 是什么。
- Web、Cocos、Native 三端分别如何投影或降级。
- 哪些 state 由 engine/store/plugin 权威持有。
- 哪些资源和 handles 是 renderer-local transient state。
- 第三方插件如何声明 native renderer 版本和 capability 兼容性。

## 能力归类

新增能力先归类，再写代码：

| 类型 | 可以放哪里 | 示例 | 规则 |
| --- | --- | --- | --- |
| 平台无关 engine 能力 | `packages/core/*`、`packages/game/*`、平台无关 plugin | story graph、save/load metadata、audio intent、UI overlay state | 不 import Web / Cocos / Native runtime adapter |
| Web target core | Web resolver 私有入口 | `@quajs/renderer-web`、Vue/React/Svelte adapter、Web renderer plugin subentry | 只能由 `web-core-resolver` 注入 |
| Cocos target core | Cocos resolver 私有入口 | `@quajs/cocos-host`、`@quajs/renderer-cocos` | 只能由 `cocos-core-resolver` 注入 |
| Native target core | Native resolver 私有入口 | `@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、Rust runtime / renderer metadata | 只能由 `native-core-resolver` 注入 |
| 普通 game/plugin | plugin package shared entry | inventory、achievement、gallery logic | shared entry 必须平台无关；target entry 分别声明 |
| Dynamic Runtime QPK | Quack-built QPK | QS / JS / resources / QUI / QSS / tokens | 只能内容更新，不允许 native code |

## 新能力三端评审顺序

未来 engine 新能力如果会影响 renderer、assets、store、runtime package、UI、media 或插件兼容性，评审必须先回答四个问题，再进入实现：

1. 平台无关 contract 是否可以放在 core/game/plugin shared entry，且不 import Web / Cocos / Native 任一 target adapter。
2. Web、Cocos、Native 是否分别需要 target entry、capability id、fallback policy 或 host bridge 字段。
3. 该能力在 Runtime QPK 中是否只是 QS / JS / resources / QUI / QSS / tokens；如果需要 native code，只能随新的 signed native app release 发布，不能动态下发。
4. 打包产物是否仍由当前目标 resolver 唯一注入 core plugin，project template、debug/release shell、installer、updater、smoke runner 和 Runtime QPK 是否仍只是 manifest consumer。

新增能力不能通过 shared preset、ordinary plugin resolver 或 Runtime QPK executable dependency 注入 target core。Web / Cocos / Native 都要有自己的兼容声明和负例测试；不能只把 native 做严，也不能让 Web / Cocos 产物容忍 native core adapter。

## 三端项目打包的核心插件红线

打包到 Cocos、Web、Native 项目时，核心插件不能串。这里的核心插件不是普通 plugin，也不是模板层可以再补一次的依赖；它只能由当前目标的 packager resolver 注入一次。

- Web 工程只允许 `web-core-resolver` 注入 Web core，不能携带 Cocos host / renderer、`@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native` 或 Rust native runtime / renderer metadata。
- Cocos 工程只允许 `cocos-core-resolver` 注入 Cocos core，不能携带 Web renderer / framework adapter，也不能携带 native engine/assets/store/runtime/renderer。
- Native 工程只允许 `native-core-resolver` 注入 native core，不能携带 `@quajs/renderer-web`、Web framework adapter、Web renderer subentry、Cocos host 或 Cocos renderer subentry。

project template、startup shell、debug/release shell、installer、updater、smoke runner、ordinary plugin、shared preset、Runtime QPK 和第三方 shared entry 都不是 core plugin 注入点。它们只能读取已验证的 active-target `target-bundle-manifest.json`；重新声明当前 active core、先构造三端 core union 再过滤、或通过 Runtime QPK executable dependency 携带任一 target core，都必须按打包失败处理。

多目标构建也必须拆成独立 artifact plan。允许共享平台无关 schema、manifest emitter、dependency graph normalizer 和 validation helper；不允许共享已经 materialize 的 Web / Cocos / Native core plugin 数组、renderer entry 列表、bootstrap shell 或 umbrella preset。

## PR 合并前 Target-Core Checklist

任何 touching engine capability、plugin manifest、Runtime QPK、project generator、debug/release shell、installer、updater、smoke runner 或 native authoring tooling 的 PR，都必须把 target-core 隔离作为显式检查项，而不是留到发布前人工确认：

- 新能力先归类为 platform-neutral、Web target entry、Cocos target entry、Native target entry 或普通 plugin；不能创建一个包含 Web / Cocos / Native core 的 shared preset。
- Web / Cocos / Native 三端都要说明 active target entry、fallback policy、capability metadata 和测试路径；即使本次只实现 native，也要写清 Web / Cocos 是否保持现状或降级。
- 打包路径必须从当前目标 resolver 开始：Web 只调用 `web-core-resolver`，Cocos 只调用 `cocos-core-resolver`，Native 只调用 `native-core-resolver`。
- project template、startup shell、debug/release shell、installer、updater、smoke runner、LSP、benchmark 和 Runtime QPK 只能读取已验证 manifest；它们不能重新声明 active core，也不能先携带三端 core union 再过滤。
- fixture 必须同时覆盖 `specifier` 和 `packageName`，包括 bare subentry、`?query` / `#hash`、Windows 路径、`node_modules` 路径和 pnpm `.pnpm` store 路径。
- Release promotion 前必须用 post-bundle graph 证明当前 artifact 只有 active core family；非 `post-bundle` 的 project/template/shell/installer/updater/smoke graph 不能出现任何 target core，连 active core 也不能二次声明。

## Rust Native Bridge Plugin

engine 需要一个 native 专用 plugin 来和 Rust native host 对接，但它仍然是 engine adapter，不是 renderer state owner。

`@quajs/engine-native` 必须负责：

- 读取 Rust `QuaNativeHostInfo`。
- 向 QuaEngine 暴露 readonly native app/runtime/renderer metadata。
- 安装 native assets/store/runtime module loader/trust policy adapters。
- 在 runtime package activation 前检查 native renderer package、version、capability ids、QUI components、QSS features、asset kinds 和 `nativeCode: false`。
- 把 Rust emitted `NativeRendererIntent` 翻译成现有 `@quajs/pipeline` render-to-logic events。
- 在 runtime package unload 后释放 package-owned QuickJS namespace handles。
- 校验 `target-bundle-manifest.json.nativeRuntime` 中的 `quickjsVersion`、`nativeRuntimeVersion`、`assetAdapterVersion`、`storeAdapterVersion` 与 Rust host info 一致。

`@quajs/engine-native` 不得负责：

- 渲染。
- 游戏状态推进。
- save/load 权威状态。
- 任意 Rust API 透传。
- 动态 native code 加载。
- Web/Cocos target core 注入。

## Assets / Store Native Versions

native artifact manifest 和 runtime host info 必须同时携带：

- `nativeRuntime.nativeRuntimeVersion`
- `nativeRuntime.quickjsVersion`
- `nativeRuntime.assetAdapterVersion`
- `nativeRuntime.storeAdapterVersion`

`@quajs/assets-native` 和 `@quajs/store-native` 的版本不是普通 npm 依赖装饰字段，而是 native signed runtime contract 的一部分。QuaEngine 启动时要用这些版本判断当前 JS adapter 是否匹配 signed Rust app。Runtime QPK 不能覆盖这些字段，只能声明自己要求的兼容范围。

## 第三方插件 Manifest

第三方 plugin 可以声明多目标支持，但 shared entry 必须平台无关，active artifact 只能 materialize 当前 target entry。

推荐 metadata：

```json
{
  "qua": {
    "plugin": {
      "id": "studio.example",
      "engine": "^0.8.0",
      "renderers": {
        "web": {
          "renderer": "@quajs/renderer-web",
          "version": "^0.8.0",
          "entry": "./dist/web.js"
        },
        "cocos": {
          "renderer": "@quajs/renderer-cocos",
          "version": "^0.8.0",
          "entry": "./dist/cocos.js"
        },
        "native": {
          "renderer": "@quajs/native-renderer",
          "version": "^0.8.0",
          "capabilityIds": ["native-wgpu.ui.surface@1"],
          "assetKinds": ["qui", "qss", "tokens", "image"],
          "quiComponents": ["Box", "Text", "Button", "Panel"],
          "qssFeatures": ["background-color", "color", "font-size"],
          "nativeCode": false
        }
      }
    }
  }
}
```

native entry 是 compatibility declaration，不是 native binary entry。第三方想扩展 UI，应提供 `.qui` / `.qss` source 或 compiled surface projection / style IR；如果需要新增 Rust primitive，必须通过官方 native renderer capability 版本发布，而不是放进 Runtime QPK。

## Existing Plugin Compatibility

现有插件都需要建立 native compatibility fixture：

| 插件 / 能力 | Native 兼容目标 | 验收点 |
| --- | --- | --- |
| background | image/layered background、video poster/fallback | package provenance、fit/origin、fallback metrics、无真实 decode 时不声明 playback capability |
| audio | projection/resource ledger/backend command plan；真实 playback 后再升级 capability | audio memory、active track、Stop/Release teardown、无 backend 时不声明 `native-wgpu.audio@1` |
| character / sprite | character projection、sprite atlas / texture request | logical stage coordinate、package-aware asset lookup、unload blocker |
| dialogue / choices | Text/RichText/Button/choice intent | text payload guard、choice/select pipeline bridge |
| settings / backlog / gallery / achievement | composite QUI UI + engine/plugin state | 上层 panel 由 base components 组装，不进 Rust primitive |
| fonts | font asset registration / fallback text path | font resource ledger、缺字体不阻断 fallback text |
| animation/effects | engine-owned animation projection | logical stage interpolation、renderer transient handles |

每个 fixture 都要给出三类结论之一：projection-compatible、native renderer work required、contract extension required。contract extension 必须改 owning plugin contract，不能把 renderer-local 状态写进 native。

## Web / Cocos / Native 同步设计要求

新增 engine 能力的 PR / 设计文档必须回答：

- Web renderer 如何消费。
- Cocos renderer 如何消费。
- Native renderer 如何消费或降级。
- 对 `@quajs/render-core` / plugin projection 是否需要新增平台无关字段。
- 对 Runtime QPK manifest / save/load required packages 是否有影响。
- 对 target-bundle manifest、plugin metadata、capability registry 是否有影响。
- 对 benchmark、memory ledger、package unload guard 是否有影响。

如果 native 只能 fallback，必须写明 fallback policy 和 capability id。不能把 Web-only DOM、Cocos-only host component 或 native-only Rust handle 放进平台无关 engine state。

## Review Blockers

以下情况必须阻塞：

- shared entry import Web / Cocos / Native target core。
- 普通 plugin / Runtime QPK 声明 target core executable dependency。
- native Runtime QPK 携带 native payload 或 `nativeCode` 缺失 / 为 true。
- native renderer 版本来自 QPK 而不是 Rust host info。
- assets/store/native runtime version 未写入 target-bundle manifest 或未在启动时比较。
- Dialog / Drawer / SettingsPanel 等上层 UI 作为 Rust primitive 下发。
- Rust renderer 解析 QUI/QSS source，而不是消费 TS compiler 输出的 resolved projection。
- 新能力只补 Web，不写 Cocos/native 兼容结论和测试计划。
