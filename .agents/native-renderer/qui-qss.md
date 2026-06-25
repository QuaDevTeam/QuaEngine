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

## QSS 兼容范围

Rust renderer 只消费 resolved style IR。selector matching、cascade、inheritance、diagnostics 都应留在 TS 工具链层。

### 当前已确认的基础 style 字段

现有 resolved style / capability 已覆盖的核心字段是：

- `background-color`
- `border-color`
- `border-radius`
- `border-width`
- `color`
- `font-family`
- `font-size`
- `font-weight`
- `line-height`
- `text-align`
- `object-fit`
- `opacity`
- `z-index`（作为 resolved node metadata，写入 `UiSurfaceNodeProjection.z_index`，不是浏览器 stacking context）

### 建议的 QSS 兼容分期

| 阶段 | 目标 | 建议属性 |
| --- | --- | --- |
| P0 | 先把 native surface 跑起来 | 上述基础字段 |
| P1 | 补齐常用视觉布局 | 已落地 `z-index`；待补齐 `padding`, `margin`, `gap`, `width`, `height`, `min/max-*`, `overflow` |
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

## 组件扩展策略

开发者扩展应该走三条路：

1. `.qui` 内本地 component。
2. package-local `.qui` import。
3. official composite library。

不应该让第三方 package 通过 native code 去“发明一个 renderer primitive”。

## 与 media 的关系

视频 / 音频相关 surface 建议先走 composite + capability gate 路线：

- 视频先支持 poster / fallback / deterministic warning。
- 音频先支持投影、资源账本、命令计划和 backend stub。
- 真正的 decode / playback backend 进入 native app binary 后，再把能力升级成正式 capability。
