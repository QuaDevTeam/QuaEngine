---
title: "把导出产物嵌入父工程"
description: "使用统一模块导出和业务协议，将 Web、Godot、Creator、Unity 或 Native 剧情模块交给父工程，传入参数并接收完成、取消和错误结果。"
order: 6
---

## 导出模块

父游戏负责地图、任务、账号、导航和奖励；QuaEngine 模块负责剧情状态、选择、存档和声音意图。父项目提供显示区域，使用自己的工具链构建最终应用。

```sh
pnpm exec quack project build --target web --embedded --all
pnpm exec quack project build --target godot --embedded --all
pnpm exec quack project build --target cocos --embedded --all
pnpm exec quack project build --target unity --embedded --all
pnpm exec quack project build --target native --embedded --all # macOS 当前架构
```

新增的 @quajs/plugin-embedded 随同一份源码构建，并加入源项目依赖；仓库 demo 已配置 workspace 依赖。先构建公开包，再执行导出。每次只构建所选目标。默认输出 `dist/embedded/<target>`，可用 `--output <专用目录>` 修改，用 `--result-file <文件>` 获取结果。构建失败或取消保留上一份产物；拒绝覆盖作者工程。**不要把输出指向父工程。** Native 库当前在 macOS 构建，入口与主应用分开配置，详见下文。

每个模块包含 `module.json`：目标、项目身份、协议版本、入口与文件 hash；另带 `target-bundle-manifest.json`、适用的兼容声明和独立 README。模块不携带父应用的启动场景／Game 类／ProjectSettings。Godot／Unity 的原生库匹配本次构建主机 OS／CPU，换平台仍需重编译与验收。

| 父工程 | 可直接交付的内容 | 挂载和入口 |
| --- | --- | --- |
| Web | 完整模块目录及 `client.js` | SDK 创建 iframe，`mountEmbeddedFrame()` |
| Godot 4.7.x | `project-files/` | 实例化 module.json 指定的场景，`open_story()` |
| Creator 3.8.8 | `project-files/`，需要原生媒体时另带 `native/` | 父节点调用生成 runtime 的 `start()` |
| Native C ABI 1 | `lib/`、`include/`、runtime／QPK／清单 | 父应用创建 handle，提供 CAMetalLayer 并驱动 tick／poll |
| Unity 6000.3 | `Packages/com.quajs.unity-host` | 父 Canvas 的 `QuaEngineHost.OpenStory()` |

内容更新交付同一次构建的完整模块，关闭旧会话后再替换；更换原生宿主库时重启相应 Editor／Player 并重新构建，模块导出不是原生二进制热替换接口。父工程的账号存档不属于生成目录。文件路径与 metadata 冲突须在父工程接入时审查，不能静默覆盖。兼容声明见[宿主版本](/docs/platforms/compatibility)。

## 业务入口：输入、结果与持久化

Scene 目标沿用 `targets.<target>.build.entry`。Web 单独配置业务入口和允许的父站点来源：

```yaml
targets:
  web:
    build:
      embeddedEntry: src/embedded-web.ts
      embeddedViteConfig: vite.embedded.config.ts # 可省略
      embeddedOrigins:
        - https://game.example.test
```

Web 的入口导出 `bootstrap(services)`，返回初始化完成的 `engine` 和 `destroy()`；服务含 assets、adapter、store、project、layout、container、signal 和 embedding。导出器创建 Web DOM renderer；业务可返回 `rendererPlugins`。CSS 由业务入口显式导入，导出器会将生成的 CSS 接入 HTML。Vue 等完整应用入口不能直接当作这个工厂使用。

Godot／Creator／Unity 的业务工厂也会收到 `services.embedding`，保留原有 host、assets 等服务。返回值新增两个可选钩子：

```ts
export async function bootstrap(services) {
  const engine = await createStoryEngine(services) // 项目自己的初始化工厂
  return {
    engine,
    async onEmbeddedOpen(story) {
      const questId = story.parameters.questId
      // 参数进入项目逻辑；剧情推进和交互继续使用 engine/plugin/pipeline。
      const accepted = await playNpcConversation(engine, questId)
      await story.complete({ questId, accepted })
    },
    async beforeEmbeddedResult(outcome) {
      // 需要持久化时在这里等待；不需要持久化可省略本钩子。
      await engine.saveToSlot('embedded-session', {}, {
        preview: { mode: 'disabled' },
      })
    },
    async destroy() { await engine.destroy() },
  }
}
```

`createStoryEngine` 和 `playNpcConversation` 由项目实现。业务初始化失败时也应回收已取得的资源。`onEmbeddedOpen` 在引擎与 renderer 准备完成后运行，允许返回长剧情 Promise，不阻塞宿主获得会话。`story.parameters` 是独立 JSON 副本；`complete(value)`、`cancel(reason)`、`fail(error)` 经逻辑插件处理，renderer 不拥有业务结果。

引擎内也可通过 `engine.getPluginById('@quajs/plugin-embedded')` 取得插件，或发送带 sessionId 的 `embedded/complete`／`embedded/cancel` pipeline 事件。没有新增 QuaScript 专用语法。完整 API 见[嵌入会话插件](/docs/reference/embedded)。

读档／回滚恢复剧情进度时，会话租约会重新绑定当前宿主的 sessionId 与参数，不回放旧宿主的结果；父工程仍需按业务身份验证存档是否适合本次任务。

**完成、取消和错误只产生一次终态，先到者获胜。** `beforeEmbeddedResult` 完成后才发送结果；持久化失败得到 `error / PERSISTENCE_FAILED`，不会确认成功奖励。结果后自动清理会话；关闭通知在清理之后发送。关闭前尚无结果时得到取消结果。持久化／清理钩子应有项目自己的超时和取消策略；Godot／Unity 的原生 VM 停机排空有界，超时会强制释放并报告 SHUTDOWN_TIMEOUT；Native C ABI 由父应用设置关闭期限并明确调用 abort，不会自行确认已完成存档。Creator 与父工程共用 JS 运行域，不能强杀宿主主线程中的任意业务代码。取消和隐藏不同：当前没有覆盖所有业务插件的通用暂停 API。

## Web 父项目

将完整 Web 模块部署到 HTTP(S) 地址。从生成的 SDK 导入：

```ts
import { mountEmbeddedFrame } from './story-module/client.js'

const story = mountEmbeddedFrame({
  container: document.querySelector('#story-region'), // 由父页面给出实际宽高
  url: 'https://story.example.test/',
  sessionId: crypto.randomUUID(),
  storageNamespace: 'my-game/account-42',
  parameters: { questId: 'npc-42' },
})
await story.ready
const outcome = await story.result
await story.closed
// 只对 completed 的业务结果做校验，再幂等更新父游戏。
```

父页面和子页面分别检查消息的精确 origin、source、sessionId 和协议形状；配置不允许 `*`、文件协议或任意动作。SDK 只发送 open／cancel，接收 ready／result／error／closed。`destroy()` 请求取消，等待关闭，超时会拒绝并移除自己创建的 iframe；初始化中关闭也会在子页面加载后转发取消。

同源 iframe 仍需存档命名空间。资源缓存按产品隔离，存档按 storageNamespace 隔离。用户激活、媒体权限、CSP 和跨源存储仍按部署环境验收。初始化在 ready 之前失败或取消时，ready Promise 会拒绝，result 仍提供终态结果。SDK 不提供任意求值、原始 store 写入或散资源推送。

## Godot 父项目

将 `project-files/` 的内容合入父工程，保留目录；不要复制独立项目配置。模块目录类似：

```text
addons/quaengine/                         # 共享 addon 与当前主机原生库
qua_modules/<ID>/module.tscn              # 可实例化的 Control
qua_modules/<ID>/content/qua/             # 编译 JS 与静态 QPK
qua_modules/<ID>/content/target-bundle-manifest.json
```

按 `module.json.entry.scene` 实例化并挂到父容器。模块默认不自动启动：

```gdscript
var story = load("res://qua_modules/<module.json 中的 ID>/module.tscn").instantiate()
story.storage_namespace = "my-game/account-42"
$StoryRegion.add_child(story)
story.story_message.connect(on_story_message) # 完整消息带 sessionId
story.story_result.connect(on_story_result)   # outcome Dictionary
story.module_closed.connect(on_story_closed)
story.open_story("npc-42-attempt-1", {"questId": "npc-42"})
# 主动取消：story.cancel_story()
```

主线程调用；等 `module_closed` 后再移除节点／打开下次会话。`stop_module()` 也会尝试结算取消并清理。addon 固定在 `res://addons/quaengine`，不同模块共用时须核对版本，不覆盖不匹配的原生库。

**将导出的 `export-filter.txt` 合并进父项目 preset 的 include_filter。** 它包含模块 JS／QPK／清单路径；Editor 能打开不能证明 Player 已带齐原始文件。保留父项目自己的其余导出设置并安装匹配 export templates。实际业务结果信号在原生 tick 外派发，关闭消息在原生清理后派发。

## Creator 父项目

合入 `project-files/`，检查资源路径及 UUID 冲突，保留 `.meta`；资源当前按生成路径加载。导出器已经剔除独立 `QuaBootstrap.ts`、`main.scene` 和 Game 类。

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
// 主动取消可用 await story.cancel()，之后仍等待 destroy()。
```

限定输入和父容器尺寸 bridge 的结构见 [Creator 接入](/docs/platforms/cocos#嵌入已有-creator-工程)。同一 runtime 按一个活跃会话工作，销毁完成后可再次打开。嵌入不会退出父应用。

macOS 原生媒体文件已单独提取到 `native/`，附 `integration.cmake`。父工程需把这段构建接入，并在已有 JSB 初始化中注册 `registerQuaCreatorAudio`／`registerQuaCreatorVideo`；不替换父工程 Game 类。Web 视频的 Canvas 透明与叠放仍由父工程整合。原生构建接线属于目标 SDK 的父工程集成要求，Web 验证不能替代它。

## Unity 父项目

安装导出的本地 UPM 包，在父 Canvas 的 RectTransform 下挂载 `QuaEngineHost`，设置 `autoStart=false`、module.json 中的 contentPrefix 和账号 storageNamespace：

```csharp
module.StoryMessage += OnStoryMessage; // JSON envelope，含 sessionId 和 type
module.StoryResult += OnStoryResult;   // outcome JSON
module.Closed += OnStoryClosed;
module.OpenStory("npc-42-attempt-1", "{\"questId\":\"npc-42\"}");
// 主动取消：module.CancelStory(); 导航离开可 StopModule()。
```

模块包不含自动创建父场景的 Editor helper。消息在 native tick 之外派发，Closed 在 VM／媒体资源释放后派发；保留父工程的 Canvas、相机、导航与设置。多个组件有独立 VM；同名 UPM 包与原生插件不能重复安装来合并不同导出产品。

**Unity 当前仍待真实 Editor C# 编译、Play Mode、Player 和 IL2CPP 验收。** Rust／录制绘图桥消费者验证业务协议，不能证明 Unity API 或实际画面通过。详细范围见 [Unity](/docs/platforms/unity)。

## Native 父应用

`--target native --embedded` 导出当前 macOS 架构的动态库和静态库，使用系统 JavaScriptCore 与 wgpu/Metal。配置独立业务工厂；不复用独立应用的窗口入口：

```yaml
icons:
  source: assets/images/icon.png # 模块身份 metadata，父应用保留自己的图标
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

源项目依赖同一版本集合的 `@quajs/assets-native`、`@quajs/store-native`、`@quajs/engine-native` 和 `@quajs/plugin-embedded`。业务工厂返回 engine／destroy 与共通结果 hook；服务提供原生 host、assets、adapter、store、project、layout、embedding。`store` 使用磁盘存储；可以返回纯函数 `projectNativeView(view)` 定制 native DTO，或返回 `featureSurfaces` 使用默认投影。状态仍归 engine，输入仍经过 pipeline。

模块含 `lib/libquajs_native.dylib`、`lib/libquajs_native.a`、`include/qua_native.h`、`runtime.mjs`、`qua/`、`native-module.json` 和完整清单。**整体交付并在父构建固定 module.json 的 SHA-256**；创建 handle 时传入预期 hash，库会先验证清单与文件。父发布流程还要验证实际链接的 SDK。不要从同一可写目录读取“预期 hash”并把它当作独立信任来源。

父应用按 C 头文件顺序接入：

1. `qua_native_create(configJson, length, &handle)`，config 含绝对 moduleDirectory、moduleManifestSha256、可写 storageDirectory。
2. 主线程提供自己持有的 CAMetalLayer，设 `framebufferOnly=NO` 和物理 drawableSize，再调用 `qua_native_attach_metal_layer`。父应用保留 NSView、窗口与事件循环；库不创建隐藏窗口或退出进程。
3. `qua_native_open` 传入标准 open JSON。父 timer 驱动 `qua_native_tick`，用 `qua_native_poll` 取出 ready／result／error／closed；没有从库回调父应用的重入问题。poll 先以空 buffer 查询字节数，再复制完整 UTF-8，不含结尾 NUL；不足的 buffer 不消费消息。
4. 将焦点区域的指针／advance／focus 输入传给 `qua_native_input`；resize 传物理像素及 backing scale，指针 x/y 使用左上角为原点的视图 points。仅在 story 视图持有焦点时转发快捷键。
5. 导航退出调用 close，继续 tick／poll 至 closed，再 destroy 和移除视图。关闭超时由父应用明确选择 abort；强制释放不保证业务结果或最后一次存档。重新打开使用新 handle。

所有 handle 绑定创建线程；附着 Metal 的会话必须全程在 macOS 主线程。每个 handle 有独立 VM，不同账号使用不同 storageNamespace。同一模块／账号命名空间采用独占锁，防止并行写入；记录通过原子文件替换保存，父应用可跨进程再次打开恢复。它不是跨记录数据库事务，也不自动加密。进程异常退出后的 session.lock／records.pending 需要父应用在确认旧进程不再存活后恢复，不能抢占活跃会话。升级完整模块前先关闭旧实例；更换 SDK 后重启父应用。

动态库放入父应用 Frameworks，配置 runpath 并随最终应用签名；导出时的 ad-hoc 签名只用于本机构建。父应用另行验证 sandbox 存储授权、JSC JIT entitlement、后台音频和系统中断。一个父进程使用同一 SDK 版本，不能重复加载冲突 install name 的不同 dylib。

模块自带 `examples/macos-parent.m`（独立 Cocoa／Metal 父窗口）及 `examples/protocol.c`（无窗口真实 JSC 消费者）。Cocoa 编译命令在源码中，测试用父应用继续计时、缩放区域并接收结果。ABI 1 尚不提供 IME、wheel、gamepad；Windows／Linux SDK、iOS／Android 与 universal 二进制导出也未实现。macOS 11.0 是构建 deployment target，不代表已在该系统完成运行验证。

## 协议和验收

协议标识 `qua-embedded`，版本 1，输入必须是有限 JSON；拒绝循环、访问器、保留原型键和非 JSON 对象，限制深度 24 与保守的 64 KiB 编码预算。sessionId 为 1–128 个字母、数字、下划线、点或连字符；storageNamespace 为安全的相对命名空间。参数不是代码，也不能更新脚本或资产；内容保持构建期 QPK 与 hash 校验。

result.outcome 为 `completed + value`、`cancelled + reason` 或 `error + code/message`。父项目核对 sessionId 和业务结果版本，使用幂等事务处理奖励／支付；回放、读档和重试不应重复发放。清理失败另有 error 消息，不能将它当作成功关闭。

消费者测试覆盖 Web／Godot／Creator／Unity 导出、目标隔离、文件 hash 和真实 QuickJS 结果往返；`demo/scripts/embedded-module-smoke.mjs <四目标模块父目录>` 验证真实浏览器与 Godot 的完成、取消、持久化错误、初始化关闭和父工程继续。Creator 使用 `demo/scripts/cocos-embedding-smoke.mjs <cocos模块目录>` 验证 Web 结果及输入释放。Native 库另由 `native-embedded-project.test.ts` 验证真实 JSC／跨进程存档；设置 `QUA_NATIVE_VISUAL_SMOKE=1` 运行独立 Cocoa 父窗口验收。SDK、原生媒体、设备和业务奖励仍需在最终父项目按[验收清单](/docs/guides/embedding#集成交付验收)验证。
