---
title: "嵌入已有应用"
description: "在已有 Web、Cocos、Godot、Unity 或 Native 项目中划分宿主与剧情模块的生命周期、输入、存储、资源和构建责任。"
order: 5
---

## 先选择集成边界

如果你手里已经拿到了导出的剧情模块成品，可以先看[把导出产物嵌入父工程](/docs/guides/exported-module)，里面列出了各平台需要交付的文件、父工程目录结构与启动入口。这一页则聚焦于源码级集成，以及通用的生命周期与安全边界。

在嵌入场景中，QuaEngine 负责剧情状态、选项、进度、存档和音频意图，渲染器负责把状态投影成画面；外部应用则负责页面布局、账号体系、业务导航和权限控制。请不要让宿主去直接修改 DOM、场景节点或渲染器快照来推动剧情。

| 集成方式 | 当前可用入口 | 边界说明 |
| --- | --- | --- |
| Web 页面中的一个区域 | `QuaWebDomRenderer` 或 Vue、React、Svelte 适配器 | 用现有构建工具接入公开包，只挂载到模块自己的容器内 |
| iframe / WebView 中的 Web 游戏 | 独立部署的 Web 产物 | 运行在独立 JS 运行域中；WebView 的文件协议、媒体、存储与宿主桥需按产品环境实测 |
| 已有 Creator / Godot 工程 | Creator 的 `start()` 选项 / Godot 模块生命周期 | 挂载在父容器下，使用限定输入、账号存储与关闭回调；生成目录与作者工程分开维护 |
| 已有原生应用中的库或子视图 | Native C ABI 1 库导出 | 目前支持 macOS；独立 JSC VM，由父应用提供 `CAMetalLayer` 并驱动 `tick` 与 `poll` |
| Unity 工程 | 导出的 UPM 包与 `QuaEngineHost` | 初始 6.3 LTS 适配；独立 VM 与父 Canvas，仍待 Unity Editor 与 Player 实测验收 |

**当前 `QuaEngine.getInstance()` 是单例入口。** 同一份引擎模块在同一个 JS 运行域内对应一个活跃会话。多个渲染器可以同时订阅这一个会话，但不能以此同时跑多个彼此独立的剧情。如果确实需要并存多套独立剧情，请使用独立 iframe 或独立的宿主 JS 运行域，并做好存储隔离，不要靠重复打包引擎代码来绕过单例限制。另外，调用 `resetInstance()` 只会清除全局入口引用，并不会帮你销毁旧会话。

## 接入已有 Web 构建

接入时保留宿主原有的 Vite 配置、路由和页面入口，按需引入 `@quajs/vite-plugin` 来处理 QuaScript 和 QPK 资源。不要为了嵌入一块剧情区域而覆盖宿主的 `index.html`、打包输出目录或 service worker，同时记得在宿主工程里检查各个 Vite 插件的执行顺序以及 HTML 注入行为。

请通过公开包入口并锁定同一套版本进行接入。仓库内开发使用的是 workspace 依赖，外部项目则可以从同一源码提交构建并打包这些包（接入前请确认所需的包是否已发布到 npm，不要默认仓库里有的包都已公开发布）。按需只引入当前用的框架适配器即可，不必把 Vue、React、Svelte 或其他平台核心一并打进产物。

在 SSR 应用里，请把 Web 资源适配器、引擎和渲染器的创建全部放到客户端挂载之后。服务端不要触碰 `document`、IndexedDB、`AudioContext` 或浏览器存储 API。如果是在 React Effect 清理或路由切换期间重建会话，记得串行等待旧会话彻底退出，避免开发模式的重复挂载制造出并行会话。

下面示例展示**引擎已完成初始化后**如何挂载剧情渲染区域；业务初始化、资源准备与剧情启动由应用自己的会话工厂负责：

```ts
import type { QuaEngine } from '@quajs/engine'
import { QuaWebDomRenderer } from '@quajs/renderer-web/dom'
import { createVisualNovelWebRendererPlugins } from '@quajs/renderer-web/plugins/preset'

export async function mountStory(container: HTMLElement, engine: QuaEngine) {
  // 由宿主赋予 container 实际宽高；设置 tabIndex 让键盘焦点能进入该区域
  container.tabIndex = 0
  let active = true
  const renderer = new QuaWebDomRenderer({
    container,
    pipeline: engine.getPipeline(),
    assets: engine.getAssets(),
    initialView: engine.getViewState(),
    plugins: createVisualNovelWebRendererPlugins({
      input: {
        target: container,
        pointerTarget: container,
        keyboardTarget: container,
        gamepad: false,
        enabled: () => active && container.contains(container.ownerDocument.activeElement),
      },
    }),
  })
  try {
    await renderer.mount()
  } catch (error) {
    await renderer.unmount()
    throw error
  }
  return async () => {
    active = false
    await renderer.unmount()
  }
}
```

这段清理函数只释放它自己创建的 `renderer`。如果当前路由还同时掌管 `engine` 的生命周期，退出时应当先取消宿主的异步任务和事件订阅、卸载渲染器，最后再执行 `await engine.destroy()`。通过 `getInstance` 创建的单例在完整销毁后会自动清除引用，之后才可以重新配置并开启下一轮会话；如果是共享引擎，则应由宿主统一销毁，子组件不要私自 reset。一旦清理出错要及时上报并阻止新会话叠加启动，初始加载失败时同样要回收已经申请的资源。

挂载容器可以是侧边分栏或弹窗中的一块区域，不需要占满整个屏幕，但必须有非零的宽高。渲染器会按容器尺寸等比缩放固定的逻辑舞台并自动留出黑边，不要拿页面的 `vw`/`vh` 反过来算剧情坐标。样式也应由应用显式导入并限制作用域，防止全局样式重置污染宿主控件；坐标换算请直接复用 Web layout helpers。

## 输入、隐藏与媒体控制

独立游戏模式下，Web 输入插件默认会监听整个 `document`，嵌入已有应用时必须收紧监听范围。请在配置里明确指针和键盘的作用目标、焦点进入与离开条件、快捷键优先级以及手柄归属；宿主自己的按钮和工具栏可以加上 `data-qua-input-ignore` 属性，防止误触推进对话。玩家通常应通过 Tab 键或点击「进入剧情」按钮来把焦点切入剧情区，避免抢走宿主输入框的按键。

需要注意，用 CSS 隐藏容器、关闭弹窗或者调用 `pausePlaytime()` **都不会自动暂停剧情推进、自动阅读、快进、动画和音频**。宿主需要明确在切到后台时是「保持后台运行」还是「彻底退出会话」；如果确实需要暂停，应当通过引擎或对应功能插件的状态与 pipeline 意图分别控制输入、自动推进和音频，而不能只停掉渲染器或直接去操作媒体 DOM 元素。目前并没有一个能一键暂停所有插件的通用嵌入暂停 API。此外，焦点离开剧情区时别忘了复位还按着的快进/跳过按键，以免隐藏后剧情还在默默往下走。

浏览器里的音频解锁依赖真实的用户点击；iframe、WebView 以及宿主自身的媒体策略都可能拦截自动播放。请按产品需要限定解锁事件的监听范围，梳理好剧情声音与宿主背景音乐的混音或独占策略，并测试来电中断、切后台以及恢复后的表现。卸载会话时要确保 `AudioContext`、媒体句柄、对象 URL、定时器和观察器全部释放，不能以为画面看不见了声音就停了。

## 资源、账号与存档隔离

Web 适配器默认的 IndexedDB 库名是 `QuaAssetsDB` 和 `QuaStore`。同一域名下的多款产品或多个玩家账号不能共用默认库名——请为 `createWebAssetsAdapter({ databaseName })` 和 `createWebStoreStorage({ dbName })` 显式传入稳定的命名空间（例如拼上产品 ID、环境标识和账号 ID）。资源缓存库也只在版本身份、信任策略与授权边界完全一致时才考虑共享；账号登出时记得清理私有数据，但不要在普通路由切换时误删玩家的存档。

静态资源必须基于模块自身的部署 base 路径去解析清单、QPK 和媒体 URL，不要假定一定挂载在站点根目录；开发期用的 VFS 也绝不能带到生产环境里加载资源。嵌入方还要规划好网络超时、请求取消、重试提示、缓存配额以及缺少 Runtime QPK 时的提示方案。生产包继续保持哈希和签名校验，存档保留所需运行期包依赖，不要通过宿主消息桥零散推送脚本或资源来绕过 QPK 生命周期。

当玩家在宿主里切换账号时，务必先保存或明确放弃当前剧情会话，再销毁引擎、切换存储命名空间并重新初始化。宿主的业务状态只能通过逻辑 API 或插件输入引擎；奖励发放、支付确认这类外部副作用，必须由宿主用幂等事务来处理，不能随着渲染重绘、剧情回放或回滚再发一次。

## 宿主通信与安全边界

在同一个 JS 运行域内，直接使用引擎和插件 API 通信即可；游戏内部的通知和玩家意图依然走 `@quajs/pipeline`。宿主桥是服务于外部系统边界的适配器，不能演变成渲染器与引擎逻辑之间的第二条事件总线。

使用模块导出时，SDK 已经提供了 `qua-embedded` v1 协议，只开放 `open`、`cancel` 请求以及 `ready`、`result`、`error`、`closed` 消息，内置 `sessionId`、超时控制与终态去重，详见[把导出产物嵌入父工程](/docs/guides/exported-module)。如果在此之外扩展自定义协议，也需要明确业务版本号与请求关联 ID。接收消息时严格校验 `event.origin`、`event.source`、消息结构和动作白名单，发送时指定精确的 `targetOrigin`；切勿暴露任意脚本求值、本地文件路径、原始 store 写入或未经校验的跳转指令。WebView 的原生消息处理同样应当遵循这些限制，并结合实际部署环境测试权限、CSP、iframe `sandbox` 属性、跨源存储策略与用户手势限制。

向宿主返回业务结果前，要先确认存档和业务回调已经落地完成；玩家主动取消或发生异常时，也不能把状态伪装成正常完成。当宿主页面导航离开后，即便还有迟到的资源回调，也绝不能再去操作已经销毁的会话。

## 嵌入已有 Creator 与 Godot 工程

**千万不要把 `projectDir` 直接指向你正在开发的父工程。** 当前的工程生成器会接管整个输出目录，重建成功后会直接替换该目录。正确的做法是先输出到专用生成目录，再在独立的集成分支里整理适配层、资源和启动代码，清晰划分哪些文件归生成器管理、哪些由宿主自己维护，避免双向手改同一个生成文件。

Godot 宿主脚本提供了 `auto_start`、`standalone`、`content_root`、`storage_namespace`、`start_module()`、`stop_module()` 以及 `ready` / `closed` / `failed` 信号。嵌入时把 `standalone` 设为 `false`，让它遵循父 `Control` 的尺寸和焦点、使用独立的存储空间和音频总线，关闭模块时不会顺带关掉整个父工程。Creator 导出的 runtime 提供了 `start(rootNode, options)`，支持 `embedded`、`input`、`layout`、`storageNamespace` 和 `onClose` 选项；嵌入时必须传入限定范围的输入和尺寸桥接器，销毁时会清理渲染器、应用实例和资源后再通知宿主。完整写法分别参考 [Godot 独立项目](/docs/platforms/godot) 与 [Cocos 与 Creator 工作区](/docs/platforms/cocos)。

生成器交付的是独立工作区结构，父工程仍然需要负责接入自己的场景、Canvas、Camera、资源导入以及实际 SDK 接线。Unity 则通过导出的本地 UPM 包，在父 Canvas 下挂载 `QuaEngineHost` 来运行，详情见[Unity 适配与嵌入](/docs/platforms/unity)。

每个发布产物里依然只允许存在一套目标核心。跨平台共用逻辑可以复用 `@quajs/renderer-scene` 和 `@quajs/scene-host`，但绝不能在其中混入另一个平台的启动代码。嵌入后，Godot 的 QuickJS 宿主和静态 QPK 限制也不会改变。独立项目的跑通不等于宿主接入一切就绪，版本范围和当前验证边界见[宿主版本与兼容性](/docs/platforms/compatibility)。

## 集成交付验收

正式交付前，建议在真实宿主环境里逐项实测：反复打开和退出剧情、在初始化尚未完成时提前关闭、加载失败后点击重试、分栏布局缩放与安全区适配、确保快捷键不会误触宿主输入框、按住快进键时窗口失焦的处理、隐藏窗口后的媒体暂停表现、连续两次打开模块能否正确读档、多账号存储隔离、断网与缺少 QPK 时的表现、迟到异步回调的处理，以及卸载后的内存与资源释放。如果是 iframe 集成，还要额外测试跨源消息拦截、页面刷新以及浏览器后退导航。验收记录里记得写清楚宿主版本、操作系统、引擎提交记录与素材版本——单元测试和 mock 都不能代替这轮真机实测。
