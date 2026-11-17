---
title: "Unity 适配与嵌入"
description: "生成 Unity 6.3 LTS 工程或将 UPM 剧情模块嵌入已有 Canvas，了解原生桥、版本和验证边界。"
order: 5
---

## 当前适配范围

Unity 是独立的 `unity-core` 目标。`@quajs/unity-host` 通过 C# uGUI 和媒体组件投影画面，每个组件实例拥有独立的 Rust/QuickJS VM；`@quajs/renderer-unity` 复用 `@quajs/renderer-scene`，而 `@quajs/scene-runtime` 则与 Godot 共用字节流、资源租约、输入调度和文件存储逻辑。运行时不依赖 Node 服务、浏览器或 WebView。

首个适配的目标系列是 **Unity 6.3 LTS（6000.3）**，默认工程版本固定为 **6000.3.28f1**。配置允许选用同系列的稳定补丁版本，但会拒绝其他大版本或预发布版本；具体的版本声明会随产物一并写入 `qua-host-compatibility.json`。由于当前属于初始桌面适配，**尚未在真实的 Unity Editor 和 Player 上完成实测验收**（当前构建环境没有安装 Unity Editor，因此底层的原生桥与录制宿主测试只能验证协议和逻辑正确性，不能代替真实的 C# 编译和画面渲染测试）。

## 从源项目生成工程

开始前请准备好 Node.js 22.12+、pnpm 12.3.4、Rust/Cargo 和 C 编译器。把下面的目标配置并入你现有的 `qua.project.yaml`，保留项目的身份信息和已有目标：

```yaml
targets:
  unity:
    enabled: true
    editorVersion: 6000.3.28f1
    projectDir: dist/unity/workspace
    layout: landscape
    build:
      entry: src/targets/unity/main.ts
      viteConfig: vite.unity.config.ts
      profile: debug
```

业务入口导出异步的 `bootstrap(services)` 函数，返回初始化好的 `engine` 与 `destroy()`。传入的 `services` 包含 `host`、`assets`、`adapter`、`store`、`project`、`layout`、静态包信任策略以及拒绝动态模块的 loader。共享的 QUI surfaces、features 以及对白和选项投影都可以与 Godot、Cocos 共用，具体示例见 [Demo Unity 入口](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/unity/main.ts) 和 [共享业务入口](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/scene/main.ts)。注意不要在普通插件里再次引入目标核心。

```sh
pnpm exec quack project build --target unity --all
```

仓库里的 Demo 可以直接运行 `pnpm --dir demo build:unity`。输出目录里包含 `ProjectSettings/ProjectVersion.txt`、`Packages/manifest.json`、目标清单、兼容性 JSON 以及 `Packages/com.quajs.unity-host`。其中生成的原生插件只对应本次构建主机的操作系统和 CPU 架构，换到其他系统分发时需要在对应平台重新编译。生成失败时会保留上一次的结果，且生成器拒绝覆盖作者自己的工程目录或源码路径。

请用对应固定版本的 Unity Editor 打开生成目录。匹配 `.qua-generated.json` 标记的 Editor helper 会自动创建 `Assets/QuaEngine/Main.unity`，打开该场景即可进入 Play Mode。需要注意的是，真正的 `Packages/packages-lock.json` 要等 Unity 首次导入工程后才会产生（建议随后审阅并提交锁定）；打包交付前也必须在真实 Editor 中完成编译、运行以及 Player 构建验证。

## 嵌入已有 Unity 工程

在你的 Unity 工程里，通过 Unity Package Manager 的本地包入口添加生成目录中的 **`Packages/com.quajs.unity-host`** 即可，千万不要把整个生成工程复制过去覆盖原有的 `Packages`、`ProjectSettings` 或场景。内置的自动建场景脚本只会对带有 `.qua-generated.json` 标记的独立生成工程生效，不会碰你的父工程。

在父工程自己的 Canvas 下建一个具有实际宽高的 `RectTransform`，挂载 `QuaEngineHost` 组件。先把 `autoStart` 设为 `false`，填入导出配置里的 `contentPrefix` 和按玩家账号隔离的 `storageNamespace`，再手动启动：

```csharp
module.autoStart = false;
module.contentPrefix = "QuaContent/<生成结果中的 ID>";
module.storageNamespace = "account-42";
module.Ready += OnReady;
module.Closed += OnClosed;
module.Failed += OnFailure;
module.StartModule();
// 导航离开、切换账号或销毁父容器前：
module.StopModule();
```

所有生命周期方法都必须在 Unity 主线程调用。`Ready`、`Closed` 和 `Failed` 事件会在原生 tick 循环之外派发，避免反向 P/Invoke 触发重入问题。停止模块时，只会回收它自己的投影节点、QuickJS VM、媒体句柄和定时器，不会调用 `Application.Quit`，默认也不会去接管全局帧率控制；相机、Canvas、业务导航和错误恢复依然完全归父工程管理。

关闭模块时会释放其持有的媒体句柄，但 Unity 导入资源缓存的回收策略仍由父工程自己统筹（模块不会擅自调用全局 `Resources.UnloadUnusedAssets`）。停机阶段的 Promise 排空设有时间和次数上限，业务插件不要依赖超长延时才能完成清理；如果发生超时或异常，系统会上报错误并释放原生 VM。

输入焦点方面，点击模块区域内会获得键盘焦点，点到外部或应用切到后台时自动退出焦点；指针坐标会先转换成容器内的局部坐标，再由共享渲染器反算回逻辑舞台坐标。多个 `QuaEngineHost` 组件之间互相独立、各有各的 VM，不同剧情或账号使用不同的 `storageNamespace` 即可隔离数据。另外，仅仅把组件设为不可见并不会暂停剧情或媒体播放，切后台与恢复策略需要由产品自己明确定义。

## 资源与功能边界

构建阶段会把普通图像和角色立绘转为 PNG、音频转为 WAV、视频转为 MP4，默认保留作者原本的资源名称。图像直接从 QPK 字节解码；音频、视频和 TTF/OTF 字体则会额外生成以内容哈希命名的 Unity 导入副本——这些副本同样源自构建期 QPK，并不是散装动态资源通道。整合时请完整保留 UPM 包内的 `Runtime/Resources` 目录，运行期加载依然保持 QPK 身份与哈希校验。

Unity 目标目前仅支持构建期静态 QPK，不支持动态 Runtime Packages、运行期脚本模块或动态插件激活。现有的 QuaScript 语法与逻辑插件可以直接复用，不需要写 Unity 专属剧本语法。

基础 uGUI 宿主已经支持变换与透明度、固定逻辑舞台留边、文本与字体、图像区域、纯色矩形和分边框、指针与键盘输入、AudioSource 多总线/音量/循环/seek/变速、`VideoPlayer` 播放以及原子文件存储。不过，在特效、画面捕获、复杂文字排版以及全套系统控件上，目前还没有与其他宿主完全拉齐：例如字距调整、部分富文本与字形整形、模糊、遮罩与混合模式、渐变、阴影、圆角以及可编辑输入框等仍有待补齐。遇到暂不支持的特效时会给出警告，画面捕获能力目前也未对外开放。

此外，Android、iOS、WebGL、IL2CPP 以及 Unity-as-a-Library 分发模式目前都还未经过实机验收（Unity-as-a-Library 是把 Unity 本身嵌进原生应用的另一条集成方案，不能把本次 UPM 模块接入等同于该能力已通）。

## 验证入口

仓库里 Quack 的消费者测试夹具会完整生成项目，并通过真实的 QuickJS C ABI 执行生成出的引擎代码，检查启动、对白投影与关闭流程（这里使用的是录制状态的绘图桥，不能代替 Unity 自身的 C# 编译以及真实画面和输入验证）：

```sh
pnpm exec turbo run build typecheck test --filter=@quajs/unity-host --filter=@quajs/renderer-unity --filter=@quajs/scene-runtime --filter=@quajs/native-contracts --filter=@quajs/quack
cargo test --locked --manifest-path packages/platform/unity-host/runtime/Cargo.toml
```

在真实的 Unity Editor 环境中，建议重点验收：包导入与 C# 编译、Play Mode 运行、剧情推进与选项、跨重启存读档、字体与音视频播放、反复启动关闭、父容器缩放与焦点抢占、双模块并行隔离、模块退出后父工程继续运行，以及目标平台的 Player 打包。验收记录请注明实际的 Editor 版本、操作系统与 CPU 架构、Scripting Backend（Mono / IL2CPP）和素材版本。更多接口契约见 [Unity Host](/docs/reference/unity-host)、[Unity 渲染适配器](/docs/reference/renderer-unity) 以及[嵌入已有应用](/docs/guides/embedding)。
