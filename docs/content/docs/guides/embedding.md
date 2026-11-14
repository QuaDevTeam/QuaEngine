---
title: "嵌入已有应用"
description: "在已有 Web、Cocos、Godot、Unity 或 Native 项目中划分宿主与剧情模块的生命周期、输入、存储、资源和构建责任。"
order: 5
---

## 先选择集成边界

已经拿到导出产物时，先看[把导出产物嵌入父工程](/docs/guides/exported-module)：列出各目标需要交付的文件、父工程目录与启动入口。本页继续说明源码集成和共通的生命周期／安全责任。

QuaEngine 可以作为应用中的剧情模块使用。已有应用负责页面、账号、业务导航和权限；engine/store 负责剧情、选择、进度、存档和音频意图，渲染器负责投影。不要让宿主通过修改 DOM、节点或 renderer 快照来改变剧情。

| 方式 | 当前可用入口 | 边界 |
| --- | --- | --- |
| Web 页面中的一个区域 | `QuaWebDomRenderer` 或 Vue/React/Svelte 适配器 | 使用已有构建工具接入公开包；只挂载到模块自己的容器 |
| iframe / WebView 中的 Web 游戏 | 单独部署 Web 产物 | 独立 JS 运行域；WebView 的文件协议、媒体、存储和宿主桥需要产品验证 |
| 已有 Creator / Godot 工程 | Creator 的 start 选项／Godot 模块生命周期 | 使用父容器、限定输入、账号存储与关闭回调；生成目录与作者工程分离 |
| 已有原生应用中的库／子视图 | Native C ABI 1 库导出 | 当前 macOS；独立 JSC VM、父 CAMetalLayer、父 tick／poll；详见模块导出 |
| Unity 工程 | 生成的 UPM 包与 QuaEngineHost | 初始 6.3 LTS 适配；独立 VM／父 Canvas，SDK 运行验收尚未完成 |

**当前 `QuaEngine.getInstance()` 是单例入口。** 同一份引擎模块在一个 JS 运行域中按一个活跃会话集成。多个 renderer 可以订阅同一会话，但不构成多个独立游戏。需要同时运行独立剧情时，用独立 iframe／宿主 JS 运行域，并隔离存储；不要依靠重复打包引擎来绕过单例。`resetInstance()` 只清除入口引用，不会销毁旧会话。

## 接入已有 Web 构建

保留宿主的 Vite 配置、路由和页面入口；按需加入 `@quajs/vite-plugin` 的 QuaScript/QPK 处理。不要为了接入一个区域覆盖宿主的 `index.html`、输出目录或 service worker。不同 Vite 插件的执行次序和 HTML 注入行为需要在宿主工程验证。

使用公开包入口和一组固定版本；仓库开发使用 workspace 包，外部项目可从同一源码提交构建并打包这些包。先核实 npm 发布状态，不能把仓库存在等同于所有包都已发布。无需同时加入 Vue、React、Svelte 或其他平台核心。

在 SSR 应用中，只在客户端挂载阶段创建 Web adapter、引擎和 renderer。服务端不访问 `document`、IndexedDB、AudioContext 或浏览器存储。React Effect 清理和路由切换应串行等待旧会话退出；开发模式重复挂载不能创建并行会话。

下面只展示**已初始化引擎**的渲染区域接线，业务初始化、资源准备和剧情启动由应用的会话工厂负责：

```ts
import type { QuaEngine } from '@quajs/engine'
import { QuaWebDomRenderer } from '@quajs/renderer-web/dom'
import { createVisualNovelWebRendererPlugins } from '@quajs/renderer-web/plugins/preset'

export async function mountStory(container: HTMLElement, engine: QuaEngine) {
  // 宿主给 container 实际宽高；tabIndex 让键盘焦点进入这个区域
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

这段清理只释放它创建的 renderer。若路由同时拥有 engine，会话退出时还需先取消宿主异步任务和事件订阅，执行 renderer 清理，再 `await engine.destroy()`。由 getInstance 创建的单例在完整销毁后自动释放，之后可带配置新建会话。共享引擎由宿主统一销毁，子组件不能自行 reset。清理失败要报告并阻止新会话重叠；初始加载失败也要回收已经取得的资源。

容器可以是分栏或弹窗中的区域，不必占满屏幕；必须给它非零宽高。渲染器按容器尺寸缩放固定逻辑舞台并留黑边，不能用页面 `vw/vh` 反写剧情坐标。样式由应用显式导入并限定范围，避免全局 reset 覆盖宿主控件。坐标转换复用 Web layout helpers。

## 输入、隐藏和媒体

默认 Web 输入可监听整个 document，独立游戏的默认行为需要在嵌入时收紧。明确指针／键盘目标、焦点进入与退出、快捷键优先级和手柄归属；宿主按钮及工具栏标记 `data-qua-input-ignore`。用户应通过 Tab 或显式“进入剧情”操作获得焦点，避免抢走宿主输入框。

CSS 隐藏、关闭弹窗或 `pausePlaytime()` **不会自动暂停剧情、自动播放、快进、动画和音频**。宿主必须定义“保留后台运行”还是“退出会话”；需要暂停时通过 engine／功能插件的状态与 pipeline 意图分别控制输入、自动推进和音频，不能只停 renderer 或改媒体元素。当前没有一个涵盖所有插件的通用嵌入暂停 API。焦点离开时也要处理仍按住的 skip／fast-forward，避免隐藏后继续推进。

音频解锁依赖真实用户激活；iframe、WebView 和宿主媒体策略都可能阻止自动播放。按产品要求限制解锁事件范围，决定与宿主音乐的混音／独占行为，并验证电话中断、切后台和恢复。卸载要释放 AudioContext／媒体句柄、对象 URL、计时器与观察器，不能把“画面已移除”视为资源已经停止。

## 资源、账号和存档隔离

Web adapter 默认数据库名是 `QuaAssetsDB` 和 `QuaStore`。同源多产品或多账号不能直接共用默认存档库；为 `createWebAssetsAdapter({ databaseName })` 和 `createWebStoreStorage({ dbName })` 显式指定稳定命名空间，例如产品 ID、环境、账号 ID。资源库只在版本身份、信任和授权边界一致时共享；账号退出清理私有数据，不随路由卸载删除玩家存档。

静态产物从自己的部署 base 解析 manifest、QPK 和媒体 URL，不能假设站点根目录。开发 VFS 不能作为生产加载器。嵌入方明确网络超时、取消、重试、缓存配额、离线状态和缺少 Runtime QPK 的恢复提示。生产包保持 hash／签名验证，存档保留包依赖；不能通过宿主桥单独推送剧情 JS 或资源来绕过 QPK 生命周期。

宿主账号切换必须先保存或明确放弃当前会话，再销毁、切换存储并重建。宿主业务状态只能通过逻辑 API／插件输入，奖励与支付等外部副作用由宿主以幂等事务处理，不能跟随渲染重绘、回放或回滚再次发放。

## 宿主通信与安全

同一运行域使用 engine/plugin API；游戏内部所有通知和用户意图仍经过 pipeline。宿主桥是外部边界适配器，不能变成 renderer 与逻辑之间的第二条总线。

模块导出已提供 qua-embedded v1 协议与 Web SDK，限定 open／cancel 请求和 ready／result／error／closed 消息，使用 sessionId、超时及终态去重，详见[模块导出](/docs/guides/exported-module)。自定义协议扩展仍需明确业务版本与请求关联。校验 `event.origin`、`event.source`、消息结构和动作白名单，发送时指定精确 `targetOrigin`。不要暴露任意脚本求值、文件路径、原始 store 写入或未经验证的 jump。WebView 的原生消息 handler 也应采用同样边界。权限、CSP、iframe sandbox、同源或跨源存储和用户手势要求由宿主部署一起验证。

返回宿主前确认已完成的存档和业务回调；取消／失败不能伪装成完成。宿主导航离开后，迟到的资源请求或回调不能操作已经销毁的会话。

## 嵌入已有 Creator / Godot 项目

**不要将 `projectDir` 指向作者工程。** 当前生成器管理整个输出目录，成功重建会替换它。先生成到专用目录，再在独立集成分支组织 adapter、资源和启动代码，维护哪些文件由工具生成、哪些由宿主拥有；禁止双向手改同一生成文件。

Godot 宿主提供 `auto_start`、`standalone`、`content_root`、`storage_namespace`、`start_module()`／`stop_module()` 和 ready／closed／failed 信号；嵌入设 `standalone=false`，使用父 Control 尺寸和焦点、独立存储／音频总线，退出不关闭父工程。Creator 生成 runtime 的 `start(rootNode, options)` 接受 `embedded`、`input`、`layout`、`storageNamespace`、`onClose`；嵌入必须提供限定输入和尺寸 bridge，销毁回收 renderer／app／assets 后通知宿主。完整例子分别见 [Godot](/docs/platforms/godot) 与 [Cocos](/docs/platforms/cocos)。

生成器仍交付独立工作区，不能把整个目录覆盖作者工程。父工程负责场景／Canvas／Camera、资源导入和实际 SDK 接线；嵌入入口不代表任意工程都已自动适配。Unity 使用生成的 UPM 包及父 Canvas 下的 QuaEngineHost，详见 [Unity](/docs/platforms/unity)。

一个产物仍只允许一个目标核心；共享代码复用 `scene-host`／`renderer-scene`，不引入另一个平台的 bootstrap。Godot 的 QuickJS 宿主和静态 QPK 边界不因嵌入改变。现有独立项目测试不能直接证明作者工程嵌入可用；版本、平台和验证范围见[兼容性声明](/docs/platforms/compatibility)。

## 集成交付验收

在真实宿主中验证：反复进入／退出、初始化中关闭、加载失败后重试、分栏缩放与安全区、宿主输入框不被快捷键影响、按住快进时失焦、隐藏后媒体行为、两次打开恢复存档、账号隔离、断网与包缺失、迟到回调和卸载后的资源释放。iframe 还要测试跨源消息拒绝、刷新与返回导航。记录宿主版本、平台、引擎提交和素材版本；独立 demo、类型检查与 mock 不替代这些验收。
