# QUI / QSS 语法与组件系统

## 总体判断

QUI 应该是一种 declarative template language，风格接近 Vue 模板，但不是 HTML，也不是 TSX/SFC。

建议明确支持：

- 条件渲染
- 条件显示
- 循环渲染
- key
- named slot
- component import
- dynamic props / class / style
- declarative action descriptor

不建议支持：

- 任意 JS 执行
- imperative method
- async 逻辑
- 直接 store mutation
- renderer 侧决定剧情或状态推进

## 推荐的 QUI 语义

### 条件渲染

```qui
Stack {
  Text(if: view.mode == "audio") { "Audio" }
  Text(else-if: view.mode == "video") { "Video" }
  Text(else) { "Default" }
}
```

`else-if` / `else` 必须紧跟在同一条件链的 `if` / `else-if` 后面；孤立分支或 `else` 之后继续接分支都应该由 native compiler / LSP 诊断。单个节点上的 directive / prop 不能重复声明，避免运行时出现不确定的覆盖规则。

### 循环渲染

```qui
Choice(
  for: (choice, index) in view.choices.items,
  key: choice.id,
  choice: choice,
  action: choice.select(choice.id)
)
```

`for` 支持 `item in source` 和 `(item, index) in source` 两种绑定形式。循环渲染节点必须同时声明稳定的 `key`，否则 native compiler / LSP 应该报错，避免 renderer 侧猜测列表 identity。

### 条件显示

`show` 只控制可见性，不销毁 local widget state。

### named slot

```qui
Panel.modal {
  slot header { Text { props.title } }
  slot body { Text { props.body } }
  slot footer { Button(action: ui.close()) { Text { "Close" } } }
}
```

### import

```qui
import style "./settings.qss";
import tokens "./theme.tokens.json";
import component "./shared/Panel.qui";
```

## 表达式子集

允许：

- `props.*`
- `view.*`
- `settings.*`
- loop bindings
- literals
- object / array literal
- `== != < <= > >= && || ! ??`
- ternary

拒绝：

- assignment
- function definition
- arbitrary call
- `new`
- `await`
- mutation

## Action descriptor

`action:` 必须编译成结构化 descriptor，而不是留给 renderer 或 LSP 重新拆字符串：

- `ui.open("settings")` -> `event: "ui/intent"`, `action: "open"`。
- `ui.close()` -> `event: "ui/intent"`, `action: "close"`。
- `choice.select(choice.id)` -> `event: "choice/select"`, `action: "select"`。
- `save.load("slot-1")` / `settings.update(settings.audio.enabled)` -> `event: "ui/intent"`，并保留 `save.load` / `settings.update` 这样的 namespaced action。

参数第一阶段只允许 literals、references 和可诊断的受限表达式；嵌套函数调用、imperative JS、assignment 和 mutation 必须在 compiler / LSP 层报错。Rust renderer 只消费最终 projection，不负责 action 字符串解析。

结构化 descriptor 进入 native projection 后，Rust `UiIntentProjection` / `RendererIntent` 需要保留 descriptor metadata，并在 `NativeRendererIntent.payloadJson` 里透传给 `@quajs/engine-native`。`action`、`choiceId`、`elementId` 是 renderer resolution 的核心字段，必须由 Rust 解析结果覆盖同名 metadata，避免动态内容伪造 dispatch 身份。

## 组件系统

### 当前应保持稳定的 base primitives

按当前 native capability registry，第一批 base / leaf primitives 应当以这些为准：

- `Fragment`
- `Box`
- `Backdrop`
- `Button`
- `Column`
- `Divider`
- `Grid`
- `Layer`
- `Row`
- `Text`
- `Image`
- `Panel`
- `SafeArea`
- `Scroll`
- `Spacer`
- `Stack`
- `RichText` 作为 text projection 叶子能力

其中 `Text` / `RichText` 属于 text projection，`Backdrop` / `Panel` / `SafeArea` / `Scroll` 是语义节点，`Stack` / `Row` / `Column` / `Grid` / `Fragment` / `Layer` / `Divider` / `Spacer` 是结构节点。

native component registry 需要声明 content model：`children`、`text` 或 `none`。compiler / LSP 应当据此诊断不合法结构：`Text` / `RichText` 只能包含文本或表达式内容，不能嵌套 QUI 组件或 slot；`Image` / `Divider` / `Spacer` 不应声明 child content；named slot 必须是拥有该 slot 的父组件的直接子节点，并且同一父组件下不能重复声明同名 slot。Rust renderer 只消费已经规整好的投影树，不负责猜测这些 authoring 语义。

`@quajs/native-ui-compiler` 需要把 `NativeQuiDocument.tree` / `parseQuiStructureTree` 作为 projection compiler 与 native LSP 共用的 authoring AST 入口；Rust/wgpu renderer 不能直接解析 QUI/QSS 源文本。

LSP hover 应从同一 registry 暴露组件 `content`、`slots` 和 style parts，避免 VSCode 插件维护第二份组件说明。

### 应尽量做成 composite 的上层组件

以下应该优先作为 `.qui/.qss` composite，而不是 native primitive：

- `Dialog`
- `Drawer`
- `Modal`
- `SaveLoadPanel`
- `SettingsPanel`
- `GalleryPanel`
- `BacklogPanel`
- `AchievementBoard`
- `Toolbar`
- `ConfirmDialog`
- `QuickMenu`

原则是：只要能由 base primitives 组装，就不要进入 Rust primitive 集合。

导入的 composite 组件是 authoring 结构，不是 native-wgpu 的 surface node kind。`import component "./Dialog.qui"`、`Dialog { ... }`、`Drawer { ... }` 这类写法可以通过 compiler / LSP 的 strict component 校验，但进入 `compileNativeUiSurfaceProjection` 后必须被预展开或扁平化成 `Backdrop`、`Panel`、`Scroll`、`Button`、`Text` 等基础节点；最终交给 Rust 的 `NativeUiSurfaceProjection` 不应包含 `Dialog`、`Drawer`、`SaveLoadPanel` 这类高阶 component 名。这样开发者仍然可以复用上层组件，native renderer 也只需要维护稳定、可验证的基础 DTO 面。

## QSS 兼容范围

Rust renderer 只消费 resolved style IR。selector matching、cascade、inheritance、diagnostics 都应留在 TS 工具链层。

`@quajs/native-ui-compiler` 需要通过 `resolveNativeQssDeclarations` 这类 TS 工具链 API，把已解析和校验过的 QSS declaration 归一化成 native surface style IR；`z-index` 输出为 node metadata，其他已支持字段输出为 `NativeQssResolvedStyle`，Rust/wgpu renderer 只消费该投影形状。动态包 surface 编译时还必须显式传入 `contentPackageId` / `requiredRuntimePackages`，由 compiler 写入 node-level `provenance`，让 Rust draw command、资源账本、内存指标和 unload blocker 都能追踪 QUI/QSS surface 来源。

native-wgpu 已支持属性的值诊断必须复用 resolved style parser 语义。`analyzeQssSource` / LSP 应在 authoring 阶段给出 `QSS_INVALID_VALUE`，例如拒绝 `object-fit: stretch`、`background-size: repeat`、不安全的 `background-image: asset("../escape.png")`、不安全的 `background-color: url("native.dll")` / `border-color: ../native.dll` / `color: rgb(300, 0, 0)`，以及不符合 native origin 子集的 `background-position`。Rust renderer 不负责兜底解析或猜测这些无效值，只对 resolved JSON 再做防御性拒绝。

### 当前已确认的基础 style 字段

现有 resolved style / capability 已覆盖的核心字段是：

- `background-color`（safe native color literal 子集：hex、comma-form `rgb(...)` / `rgba(...)`、`transparent`、`currentColor`、基础 named colors；不支持浏览器 `url(...)`、路径字符串、traversal、percentage channel、任意 CSS color function）
- `background-image`（仅支持 `asset("ui/panel.png")` / `asset("ui/panel.png", "images")` 这类 package-relative 结构化资源引用；不支持浏览器 `url(...)`、远程 URL、绝对路径或 `..` traversal）
- `background-size`（native 子集：`cover`, `contain`, `fill`, `none`, `scale-down`，映射到背景图 fit）
- `background-position`（native 子集：`left|center|right`、`top|center|bottom` 和 `0%..100%` 双轴 origin）
- `border-color`（同 `background-color` 的 safe native color literal 子集）
- `border-radius`
- `border-style`（native 子集：`solid` / `none`；缺省等同 `solid`，`none` 会让 Rust draw params 的 border color 为空、width 为 `0`）
- `border-width`
- `color`（同 `background-color` 的 safe native color literal 子集；dialogue rich text 和 UI text resolved JSON 也由 Rust facade 防御性校验）
- `display`（native 子集：仅支持 `none`，编译为 node-level `UiSurfaceNodeProjection.visible: false` fallback；QUI 显式 `show` prop 优先；`block` / `flex` / `grid` 暂不作为 layout 承诺）
- `font-family`
- `font-size`
- `font-style`（native 子集：`normal` / `italic`；编译为 `UiSurfaceResolvedStyle.fontStyle`，Rust 侧只映射到 Text / Button draw params，不做字体合成策略）
- `font-weight`
- `left` / `top` / `right` / `bottom` / `inset` / `width` / `height`（仅作为静态 `UiSurfaceNodeProjection.bounds` fallback；`left/top` 允许负坐标，`right/bottom/inset/width/height` 必须非负；`right/bottom` 只有在父节点已有确定 bounds 且当前节点已有 `width/height` 时，才由 TS compiler 推导最终 `x/y`；`inset` 是 top/right/bottom/left 的非负 shorthand；QUI 显式 `x/y/width/height` prop 优先；这不是完整 CSS `position` 或 layout 算法）
- `min-width` / `max-width` / `min-height` / `max-height`（仅用于 TS compiler 对静态 QSS `width` / `height` fallback 做 clamp；QUI 显式 `width` / `height` prop 优先，不作为完整 layout min/max 算法承诺）
- `letter-spacing`（native 子集：`normal` 或非负 logical px / unitless number；`normal` 编译为 `0`，Rust 侧只映射到 Text / Button draw params）
- `line-height`
- `text-align`
- `text-decoration`（native 子集：`none` / `underline` / `line-through`；编译为 `UiSurfaceResolvedStyle.textDecoration`，Rust 侧映射到 Text / Button draw params，真实装饰线绘制由后续文本 backend 实现）
- `text-overflow`（native 子集：`clip` / `ellipsis`；编译为 `UiSurfaceResolvedStyle.textOverflow`，Rust 侧映射到 Text / Button draw params；真实裁剪和省略号绘制由后续文本 backend 实现）
- `text-transform`（native 子集：`none` / `uppercase` / `lowercase` / `capitalize`；编译为 `UiSurfaceResolvedStyle.textTransform`，Rust 侧映射到 Text / Button draw params；真实大小写转换由后续文本 backend 实现）
- `white-space`（native 子集：`normal` / `nowrap` / `pre` / `pre-line` / `pre-wrap`；编译为 `UiSurfaceResolvedStyle.whiteSpace`，Rust 侧映射到 Text / Button draw params；真实空白折叠、换行和 wrapping 策略归后续文本 backend 实现）
- `object-fit`
- `opacity`
- `overflow`（native 子集：`visible` / `hidden`；`hidden` 编译为 node-level `UiSurfaceNodeProjection.clipChildren: true`，用于裁剪普通 painted surface 的子节点绘制和 pointer 命中；`Scroll` / `SafeArea` 仍使用各自专用裁剪语义）
- `padding` / `padding-top` / `padding-right` / `padding-bottom` / `padding-left`（作为 resolved edge inset metadata 写入 `UiSurfaceResolvedStyle.padding`；当前用于 draw params，完整布局算法仍归后续 layout IR）
- `visibility`（native 子集：`visible` / `hidden`，作为 node-level `UiSurfaceNodeProjection.visible` fallback；QUI 显式 `show` prop 优先）
- `z-index`（作为 resolved node metadata，写入 `UiSurfaceNodeProjection.z_index`，不是浏览器 stacking context）
- `scrollOffsetX` / `scrollOffsetY`（作为 `Scroll` 节点的 resolved projection metadata，影响子节点绘制和命中测试坐标；不是 QSS cascade 字段，也不是 renderer 持久滚动状态）

### 建议的 QSS 兼容分期

| 阶段 | 目标 | 建议属性 |
| --- | --- | --- |
| P0 | 先把 native surface 跑起来 | 上述基础字段 |
| P1 | 补齐常用视觉布局 | 已落地 `display: none` 隐藏子集、`z-index`、`visibility` visible/hidden 子集、`overflow` visible/hidden 子集、`border-style` solid/none 子集、`font-style` normal/italic 子集、`letter-spacing` normal/non-negative number 子集、`text-decoration` none/underline/line-through 子集、`text-overflow` clip/ellipsis 子集、`text-transform` none/uppercase/lowercase/capitalize 子集、`white-space` normal/nowrap/pre/pre-line/pre-wrap 子集、结构化 `background-image: asset(...)`、`background-size` fit 子集、`background-position` origin 子集、`padding` edge inset metadata、静态 `left` / `top` / `right` / `bottom` / `inset` / `width` / `height` bounds fallback，以及 TS 编译期 `min-width` / `max-width` / `min-height` / `max-height` bounds clamp；待补齐 `position`, `margin`, `gap` |
| P2 | 进一步接近熟悉的 CSS 体验 | 部分 `transform`, `shadow`, `transition` 及少量视觉增强 |

### 建议支持的 selector 语义

- type selector
- class selector
- id selector
- descendant / child
- pseudo-state -> renderer state 映射
- style part selector

### 不建议在第一阶段承诺的 CSS 特性

- 全量浏览器 cascade
- `@media` 作为主布局手段
- `@keyframes`
- 任意 CSS function
- 浏览器 `url(...)` / 网络资源；native 背景资源必须走 `asset(...)` resolved IR
- QUI `src` / `image` 资源 prop 必须是包内相对字符串字面量，并且 `asset-type` 必须是白名单形态的 native asset kind；compiler 对 URL、绝对路径、`..` traversal、非字面量资源表达式发出 `QUI_INVALID_ASSET_REFERENCE`，projection 不应把这些不安全资源传给 Rust。
- 任意未白名单化 property
- 依赖浏览器 box model 的复杂行为

QSS 应该是“CSS 子集 + 设备无关的确定性 IR”，不是把 CSS 原样搬进 Rust。

## 组件 registry / compatibility metadata

建议统一用 serializable registry 描述：

- component name
- kind: `base / composite / project / capability`
- props
- slots
- events / actions
- style parts
- asset props
- capability flags
- renderer targets

runtime package compatibility metadata 也应该落到这个 registry 上：

- required `quiComponents`
- required `qssFeatures`
- required `assetKinds`
- optional counterparts
- `nativeCode: false`

已分析的 QUI / QSS 文档可以通过 `createNativeUiSurfaceCompatibilityFromDocuments` 直接派生 native UI surface compatibility：

- QUI tree 中出现过的 component node 进入 `quiComponents`。
- QSS rules 中出现过的 declaration name 进入 `qssFeatures`。
- QUI `src` / `image` 资源 prop 和 QSS `background-image: asset(...)` 中的 asset kind 进入 `assetKinds`。
- 最终输出仍由 `@quajs/native-contracts` 的 `createNativeUiSurfaceCompatibility` 规整，固定包含 `native-wgpu.ui.surface@1`、`qui` / `qss` / `tokens` 和 `nativeCode: false`。

当动态 UI 小包已经只保留 resolved `NativeUiSurfaceProjection`，包构建器可以使用 `createNativeUiSurfaceCompatibilityFromProjection`：

- 从 projection node `kind` 收集 `quiComponents`。
- 从 `style`、`zIndex`、`clipChildren` 等 resolved 字段收集对应 `qssFeatures`。
- 从 `image` / `backgroundImage` 收集 asset kind。
- `projectionFields` 仅用于测试、诊断和 capability 覆盖审计，不写入 runtime compatibility block，避免把 `visible`、`opacity`、`scrollOffsetX` / `scrollOffsetY`、`provenance` 等已解析投影字段误当成 QSS declaration 能力。
- projection 派生的 compatibility 只能声明投影里实际存在的基础 `kind`；source QUI 中导入过的 `Dialog` / `Drawer` 等 composite 名如果已经预展开，不应从 resolved projection 重新声明为 native renderer 必须支持的 component。

这个能力用于 dynamic UI package manifest / third-party native renderer entry 的 metadata 生成，不是运行时授权机制本身；runtime startup 和 QPK activation 仍必须以 signed native host capability manifest 做最终校验。

## 组件扩展策略

开发者扩展应该走三条路：

1. `.qui` 内本地 component。
2. package-local `.qui` import。
3. official composite library。

不应该让第三方 package 通过 native code 去“发明一个 renderer primitive”。
扩展组件发布时应同时提供可静态分析的 `.qui` / `.qss` 源或构建产物，让 packager 能在 QuickJS 执行前完成组件展开、QSS 解析、compatibility metadata 派生和 `nativeCode: false` 校验。真正需要新增 primitive 的能力必须进入官方 native renderer capability 版本，而不是随动态小包下发。

## 与 media 的关系

视频 / 音频相关 surface 建议先走 composite + capability gate 路线：

- 视频先支持 poster / fallback / deterministic warning。
- 音频先支持投影、资源账本、命令计划和 backend stub。
- 真正的 decode / playback backend 进入 native app binary 后，再把能力升级成正式 capability。
