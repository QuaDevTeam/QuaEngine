---
title: "把导出产物嵌入父工程"
description: "使用统一模块导出和业务协议，将 Web、Godot、Creator、Unity 或 Native 剧情模块交给父工程，传入参数并接收完成、取消和错误结果。"
order: 6
---

## 导出模块

把 QuaEngine 当作大工程里的一个剧情子模块时，主游戏负责地图、任务、账号、导航与奖励发放，QuaEngine 模块则负责剧情状态、选项、存档和声音意图；父工程提供一块显示区域，再用自己的工具链打包最终应用。

```sh
pnpm exec quack project build --target web --embedded --all
pnpm exec quack project build --target godot --embedded --all
pnpm exec quack project build --target cocos --embedded --all
pnpm exec quack project build --target unity --embedded --all
pnpm exec quack project build --target native --embedded --all # 目前支持在 macOS 本机架构构建
```

导出机制依赖 `@quajs/plugin-embedded`，该包随主源码一并构建（仓库 `demo` 已经配好 workspace 依赖）；执行导出前请先构建公开包产物。每次命令只导出当前指定的目标平台，默认输出到 `dist/embedded/<target>`，也可以通过 `--output <专用目录>` 和 `--result-file <文件>` 自定义输出路径。如果构建失败或中途取消，工具会保留上一次的完整产物，并拒绝覆盖作者自己的工程目录——**请不要把输出路径直接指向父工程**。Native 原生库目前只在 macOS 构建，入口与主应用分开配置。

每个导出目录都会附带 `module.json`（记录目标平台、项目身份、协议版本、入口和文件哈希），以及 `target-bundle-manifest.json`、适用的兼容性声明和独立 README。模块不会打包父应用的启动场景、Game 类或 ProjectSettings。Godot 和 Unity 的原生动态库匹配本次构建主机的系统与 CPU 架构，换平台分发时仍需在对应系统重新编译并验证。

| 父工程 | 需要合入或交付的内容 | 挂载方式与启动入口 |
| --- | --- | --- |
| Web | 完整模块目录以及 `client.js` | SDK 创建 iframe，调用 `mountEmbeddedFrame()` |
| Godot 4.7.x | `project-files/` | 实例化 `module.json` 指定的场景，调用 `open_story()` |
| Creator 3.8.8 | `project-files/`（需要原生媒体时另附 `native/`） | 在父节点上调用生成 runtime 的 `start()` |
| Native C ABI 1 | `lib/`、`include/`、runtime、QPK 与清单 | 父应用创建 handle，提供 `CAMetalLayer` 并驱动 `tick` 和 `poll` |
| Unity 6000.3 | `Packages/com.quajs.unity-host` | 挂在父 Canvas 下，调用 `QuaEngineHost.OpenStory()` |

剧情内容更新时，请把同一次构建出的完整模块一起交付，并在关闭旧会话后再替换文件；如果升级了原生宿主库，还要重启对应的 Editor 或 Player 并重新构建（模块导出不是原生二进制热替换机制）。父工程的账号存档放在生成目录之外。合入父工程时，记得核对文件路径和 metadata 是否有冲突，不要直接覆盖原有配置。版本与兼容边界见[宿主版本与兼容性](/docs/platforms/compatibility)。

## 业务入口：输入、结果与持久化

Godot、Creator、Unity 这类场景目标沿用 `targets.<target>.build.entry`。Web 目标则单独配置嵌入式入口以及允许通信的父站点域名：

```yaml
targets:
  web:
    build:
      embeddedEntry: src/embedded-web.ts
      embeddedViteConfig: vite.embedded.config.ts # 可省略
      embeddedOrigins:
        - https://game.example.test
```

Web 入口需要导出 `bootstrap(services)`，返回初始化好的 `engine` 和 `destroy()`。传入的 `services` 包含 `assets`、`adapter`、`store`、`project`、`layout`、`container`、`signal` 与 `embedding`。导出器会自动创建 Web DOM renderer，业务侧可按需返回 `rendererPlugins`。样式需要由业务入口显式导入，导出器会自动把生成的 CSS 接入 HTML。需要注意，完整独立运行的 Vue 应用入口不能直接当作这里的嵌入式工厂来用。

Godot、Creator、Unity 的业务工厂同样会收到 `services.embedding`，并保留原有的 `host`、`assets` 等服务，同时在返回值里增加两个可选的生命周期钩子：

```ts
export async function bootstrap(services) {
  const engine = await createStoryEngine(services) // 由项目自己实现的初始化工厂
  return {
    engine,
    async onEmbeddedOpen(story) {
      const questId = story.parameters.questId
      // 参数进入项目逻辑；剧情推进和交互依然走 engine、plugin 和 pipeline。
      const accepted = await playNpcConversation(engine, questId)
      await story.complete({ questId, accepted })
    },
    async beforeEmbeddedResult(outcome) {
      // 需要等待存档落盘时写在这里；不需要持久化的场景可以省略这个钩子。
      await engine.saveToSlot('embedded-session', {}, {
        preview: { mode: 'disabled' },
      })
    },
    async destroy() { await engine.destroy() },
  }
}
```

这里的 `createStoryEngine` 和 `playNpcConversation` 由你的项目自行实现，业务初始化失败时也要记得清理已申请的资源。`onEmbeddedOpen` 会在引擎和渲染器都就绪后触发，你可以直接返回一个异步长剧情 Promise，不会卡住宿主获取会话句柄。`story.parameters` 是经过深拷贝的独立 JSON 副本；调用 `complete(value)`、`cancel(reason)` 或 `fail(error)` 时，状态都会经由逻辑插件处理，渲染器不参与决定业务结果。

在引擎内部，你也可以通过 `engine.getPluginById('@quajs/plugin-embedded')` 拿到插件实例，或者通过 pipeline 发送带着 `sessionId` 的 `embedded/complete`、`embedded/cancel` 事件。这套机制没有新增任何 QuaScript 专用语法，完整 API 见[嵌入会话插件](/docs/reference/embedded)。

如果剧情通过读档或回滚恢复到较早的节点，会话租约会自动重新绑定到当前宿主的 `sessionId` 和传入参数，不会把上一次旧宿主的结果再重放一遍；父工程在接收结果时，依然应该核对任务或业务身份是否与当前会话匹配。

**完成、取消和错误只会产生一次终态结果，先到者为准。** 引擎会先等待 `beforeEmbeddedResult` 执行完毕再向父工程返回结果；一旦持久化失败，结果就会变成 `error / PERSISTENCE_FAILED`，避免父游戏误发奖励。返回结果后会话会自动清理，并在清理全部完成后再派发关闭通知；如果结果尚未产出就提前关闭，宿主会收到取消结果。另外，持久化与清理钩子请自行设定好超时和取消策略：Godot 与 Unity 的原生 VM 停机排空有时间上限，超时会强制释放并报 `SHUTDOWN_TIMEOUT`；Native C ABI 则由父应用设置关闭期限并主动调用 abort，不会贸然确认存档已完成；Creator 由于和父工程共用同一 JS 运行域，无法强行中止宿主主线程里的任意代码。顺带一提，取消与隐藏界面是两回事，目前还没有能统一暂停所有业务插件的通用暂停 API。

## Web 父项目

将导出的完整 Web 模块部署到 HTTP(S) 服务后，在父页面导入生成的 SDK：

```ts
import { mountEmbeddedFrame } from './story-module/client.js'

const story = mountEmbeddedFrame({
  container: document.querySelector('#story-region'), // 由父页面赋予实际宽高
  url: 'https://story.example.test/',
  sessionId: crypto.randomUUID(),
  storageNamespace: 'my-game/account-42',
  parameters: { questId: 'npc-42' },
})
await story.ready
const outcome = await story.result
await story.closed
// 只在 outcome 为 completed 时校验业务结果，再做幂等的父游戏状态更新。
```

父子页面通信时，双方都会严格校验消息的精确 `origin`、`source`、`sessionId` 以及协议结构；配置中不允许写 `*`、本地 `file://` 协议或任意未声明动作。SDK 只允许发送 `open` 和 `cancel`，接收 `ready`、`result`、`error` 与 `closed`。调用 `destroy()` 会请求取消并等待关闭，超时则会拒绝 Promise 并移除自己创建的 iframe；就算在初始化还没完成时就关闭，子页面加载好之后也会把取消指令转达过去。

即便部署在同一域名下，同源 iframe 依然需要按账号隔离存档：`storageNamespace` 用于区分玩家存档，资源缓存按产品边界隔离。真实环境下的用户点击激活、媒体播放权限、CSP 与跨源存储策略，仍需结合你的部署域名实测。如果会话在 `ready` 之前就失败或取消了，`ready` Promise 会拒绝，但你依然可以从 `result` 里拿到最终结果。SDK 本身不开放任意脚本求值、原始 store 写入或零散资源推送接口。

## Godot 父项目

把导出的 `project-files/` 目录合并进你的 Godot 父工程并保持原有目录结构，不要覆盖父工程自己的配置。导出文件结构如下：

```text
addons/quaengine/                         # 共享 addon 与当前构建主机的原生库
qua_modules/<ID>/module.tscn              # 可实例化的 Control 节点
qua_modules/<ID>/content/qua/             # 编译后的 JS 与静态 QPK
qua_modules/<ID>/content/target-bundle-manifest.json
```

按照 `module.json` 里 `entry.scene` 指向的路径实例化场景并挂进父容器。模块默认关闭了自动启动，你可以按业务时机手动打开：

```gdscript
var story = load("res://qua_modules/<module.json 中的 ID>/module.tscn").instantiate()
story.storage_namespace = "my-game/account-42"
$StoryRegion.add_child(story)
story.story_message.connect(on_story_message) # 完整消息体，包含 sessionId
story.story_result.connect(on_story_result)   # outcome Dictionary
story.module_closed.connect(on_story_closed)
story.open_story("npc-42-attempt-1", {"questId": "npc-42"})
# 需要主动取消时：story.cancel_story()
```

所有控制接口都在主线程调用；离开时请等 `module_closed` 信号发出后再销毁节点或开启下一段会话。调用 `stop_module()` 同样会尝试按取消流程结算并清理资源。由于 addon 固定放在 `res://addons/quaengine`，如果父工程里同时接入了多个剧情模块，合入前务必核对它们的引擎版本一致，避免用不匹配的原生库互相覆盖。

**记得把导出的 `export-filter.txt` 合并进父工程导出预设的 `include_filter` 中。** 里面列出了模块所需的 JS、QPK 和清单路径——在 Godot 编辑器里能正常运行，并不代表导出成 Player 时这些非 `.tres` 文件会自动被打进去。保留父工程原有的其他导出设置，并安装对应版本的 export templates。在内部调度上，业务结果信号会在原生 tick 循环之外派发，关闭通知则在原生资源清理完成之后发出。

## Creator 父项目

将 `project-files/` 合入父工程时，记得检查资源路径和 UUID 是否冲突，并保留 `.meta` 文件（资源目前会按生成路径加载）。导出器已经自动剔除了独立启动用的 `QuaBootstrap.ts`、`main.scene` 和 Game 类。

```ts
import { start } from './qua-runtime/runtime.js'
const story = await start(storyRegion, {
  request: {
    protocol: 'qua-embedded', version: 1, type: 'open',
    sessionId: 'npc-42-attempt-1',
    storageNamespace: 'my-game/account-42',
    parameters: { questId: 'npc-42' },
  },
  input: scopedInputBridge,
  layout: containerLayoutBridge,
  onMessage: message => console.info(message.type),
})
const outcome = await story.result
await story.destroy()
// 主动取消可调用 await story.cancel()，结束后同样需要等待 destroy()。
```

限定范围的输入和容器尺寸 bridge 写法见[嵌入已有 Creator 工程](/docs/platforms/cocos#嵌入已有-creator-工程)。同一个 runtime 实例同一时间只运行一个活跃会话，等销毁彻底完成后才能再次调用 `start()`。关闭模块不会退出父应用。

macOS 用的原生媒体文件已经被单独提取到了 `native/` 目录，里面附带 `integration.cmake`。父工程需要把这段 CMake 接入自己的原生构建，并在现有的 JSB 初始化代码中注册 `registerQuaCreatorAudio` 与 `registerQuaCreatorVideo`，无需替换父工程原本的 Game 类。Web 端视频播放所需的 Canvas 透明背景与层级叠放，也由父工程自行统筹配置。原生构建集成需要直接在目标 SDK 的父工程里验收，Web 端的验证不能替代这一步。

## Unity 父项目

在 Unity Package Manager 中安装导出的本地 UPM 包，在父 Canvas 的 `RectTransform` 下挂载 `QuaEngineHost`，将 `autoStart` 设为 `false`，并填入 `module.json` 提供的 `contentPrefix` 以及玩家账号的 `storageNamespace`：

```csharp
module.StoryMessage += OnStoryMessage; // JSON 封包，包含 sessionId 与 type
module.StoryResult += OnStoryResult;   // outcome JSON
module.Closed += OnStoryClosed;
module.OpenStory("npc-42-attempt-1", "{\"questId\":\"npc-42\"}");
// 主动取消：module.CancelStory(); 导航离开时调用 StopModule()。
```

导出的模块包不包含会自动帮你新建父场景的 Editor helper。消息回调都在 native tick 之外派发，`Closed` 会在 VM 与媒体资源彻底释放后触发；父工程自己的 Canvas、相机、导航和全局设置保持不动。多个 `QuaEngineHost` 组件各自持有独立的 VM，但不能通过重复安装同名 UPM 包或原生插件来硬拼多个不同的导出产物。

**目前 Unity 目标仍待在真实 Unity Editor 中完成 C# 编译、Play Mode、Player 打包和 IL2CPP 验收。** 现阶段的 Rust 与录制绘图桥测试主要验证业务协议本身，不能代表 Unity C# API 编译或真实画面表现已经通过。具体范围见[Unity 适配与嵌入](/docs/platforms/unity)。

## Native 父应用

执行 `--target native --embedded` 会导出当前 macOS 架构的动态库与静态库，底层使用系统自带的 JavaScriptCore 与 wgpu / Metal。需要为它配置专门的嵌入式业务入口，不能直接复用独立桌面应用的窗口入口：

```yaml
icons:
  source: assets/images/icon.png # 仅作为模块身份元数据，父应用保留自己的图标
targets:
  native:
    enabled: true
    platforms: [macos]
    profiles: [release]
    build:
      cargoManifest: ../QuaEngine/packages/native/Cargo.toml
      embeddedEntry: src/embedded-native.ts
      embeddedViteConfig: vite.embedded-native.config.ts # 可省略
```

源工程需要依赖同一版本集合的 `@quajs/assets-native`、`@quajs/store-native`、`@quajs/engine-native` 和 `@quajs/plugin-embedded`。业务工厂按前面提到的约定返回 `engine`、`destroy` 以及结果钩子，传入的 `services` 包含原生 `host`、`assets`、`adapter`、`store`、`project`、`layout` 和 `embedding`。`store` 默认落盘存储；你还可以返回纯函数 `projectNativeView(view)` 来定制 native DTO，或者返回 `featureSurfaces` 使用默认投影。无论哪种方式，状态依然归引擎管理，输入依然走 pipeline。

导出产物包含 `lib/libquajs_native.dylib`、`lib/libquajs_native.a`、`include/qua_native.h`、`runtime.mjs`、`qua/`、`native-module.json` 以及完整清单。**请将整份产物打包交付，并在父应用的构建配置里写死 `module.json` 的预期 SHA-256**——创建 handle 时把预期哈希传进去，库会在启动前校验清单与所有文件（不要从同一个可写目录里读取预期哈希，那样起不到独立信任校验的作用）。父应用发布流程里也应当核对实际链接进去的 SDK 版本。

父应用请按 C 头文件里的生命周期顺序接入：

1. 调用 `qua_native_create(configJson, length, &handle)`，配置里提供绝对路径的 `moduleDirectory`、`moduleManifestSha256` 以及可写的 `storageDirectory`。
2. 在主线程上把父应用自己持有的 `CAMetalLayer`（设置 `framebufferOnly = NO` 与物理 `drawableSize`）通过 `qua_native_attach_metal_layer` 绑给引擎。父应用保留 `NSView`、窗口和主事件循环，库本身不会偷偷创建隐藏窗口或退出进程。
3. 调用 `qua_native_open` 传入标准的 `open` JSON。随后由父应用的 timer 驱动 `qua_native_tick`，并用 `qua_native_poll` 拉取 `ready`、`result`、`error`、`closed` 消息（没有从原生库反向回调父应用的重入风险）。调用 `poll` 时先传空 buffer 查询字节数，再分配足够空间读取完整 UTF-8（不含结尾 `NUL`）；buffer 长度不足时不会消费掉这条消息。
4. 只在故事视图拥有焦点时，把焦点区域内的指针、推进和焦点事件通过 `qua_native_input` 传给模块；窗口缩放时传入物理像素和 backing scale，指针 `x`/`y` 则采用左上角为原点的视图坐标（points）。
5. 导航退出时先调用 close，并继续循环 `tick` 和 `poll` 直到收到 `closed`，然后再销毁 handle 并移除视图。如果遇到关闭超时，由父应用自己决定是否明确调用 abort；强制释放不保证业务结果或最后一次存档已经写入。需要再次开启剧情时，请创建新的 handle。

每个 handle 都严格绑定创建它的线程，挂载了 Metal 图层的会话更是必须全程运行在 macOS 主线程上。每个 handle 拥有独立的 JSC VM，不同玩家账号应使用不同的 `storageNamespace`。同一模块和账号命名空间之间会加上独占文件锁防止并发写坏数据，记录更新采用原子文件替换，父应用跨进程重新打开也能继续读档（注意这套存储不是跨记录的数据库事务，也不会自动加密）。如果上一次进程异常崩溃留下 `session.lock` 或 `records.pending`，父应用在确认旧进程确实不再存活后才应执行恢复，绝不能去抢占仍在运行的活跃会话。升级完整模块前请先关闭旧实例，更换 SDK 后则应重启父应用；同一进程内不要重复加载 install name 冲突的不同版本 dylib。

正式打包时，把动态库放进父应用的 `Frameworks` 目录，配置好 runpath 并随主应用一起签名（导出产物自带的 ad-hoc 签名仅方便本机测试）。父应用还需要自行验证 sandbox 存储授权、JSC JIT entitlement、后台音频策略和系统中断处理。

导出目录自带了 `examples/macos-parent.m`（独立 Cocoa / Metal 父窗口示例）和 `examples/protocol.c`（无窗口的纯 JSC 协议消费示例），Cocoa 编译命令写在源码注释里，可用于测试父窗口持续计时、缩放和接收结果。目前 C ABI 1 暂未提供 IME 输入法、滚轮和手柄支持，Windows、Linux、iOS、Android 与 universal 二进制导出也尚未实现；`macOS 11.0` 仅是构建时的 deployment target，不代表已在对应旧系统上实际跑过。

## 协议和验收

`qua-embedded` v1 协议要求输入必须是合法的有限 JSON：拒绝循环引用、getter 访问器、原型链保留键以及非 JSON 对象，深度限制在 24 层、编码大小限制在 64 KiB 以内。`sessionId` 限制为 1 到 128 位的字母、数字、下划线、点或连字符；`storageNamespace` 必须是安全的相对命名空间。参数只是数据，不能当作代码执行，也不能用来更新脚本或推送资源；内容更新仍然严格受限于构建期 QPK 与哈希校验。

`result.outcome` 的形态为 `completed`（带 `value`）、`cancelled`（带 `reason`）或 `error`（带 `code` 与 `message`）。父工程在发放奖励或处理支付前，务必核对 `sessionId` 和业务结果版本并做幂等控制，防止重放、读档或重试时重复发奖。如果清理过程失败，还会额外产生 error 消息，不要把这种情况当成正常关闭。

仓库里的消费者测试已经覆盖了 Web、Godot、Creator 和 Unity 的导出流程、目标隔离、文件哈希以及真实 QuickJS 结果往返；`demo/scripts/embedded-module-smoke.mjs <四目标模块父目录>` 会用真实浏览器和 Godot 验证完成、取消、持久化报错、初始化期间关闭以及父工程继续运行；Creator 另有 `demo/scripts/cocos-embedding-smoke.mjs <cocos模块目录>` 验证 Web 结果与输入释放；Native 库则由 `native-embedded-project.test.ts` 验证真实 JSC 与跨进程存档，设置 `QUA_NATIVE_VISUAL_SMOKE=1` 还能拉起真实的 Cocoa 父窗口做视觉验证。最终集成到你的父工程后，仍需按照[集成交付验收清单](/docs/guides/embedding#集成交付验收)走一遍真机实测。
