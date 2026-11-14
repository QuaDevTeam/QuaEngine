---
title: "Unity 适配与嵌入"
description: "生成 Unity 6.3 LTS 工程或将 UPM 剧情模块嵌入已有 Canvas，了解原生桥、版本和验证边界。"
order: 5
---

## 当前适配范围

Unity 是独立的 `unity-core` 目标。`@quajs/unity-host` 通过 C# uGUI／媒体组件投影画面，每个模块拥有独立的 Rust／QuickJS VM；`@quajs/renderer-unity` 复用 `renderer-scene`，`scene-runtime` 与 Godot 共享字节、资源租约、输入调度和文件存储实现。运行时不依赖 Node 服务、浏览器或 WebView。

首个适配系列为 **Unity 6.3 LTS（6000.3）**，工程默认固定 **6000.3.28f1**。允许配置同系列稳定补丁，不接受其他系列或预发布版本；准确声明随产物写入 `qua-host-compatibility.json`。这是初始实现的版本边界，**尚未完成 Unity Editor／Player 验收**。本机没有 Unity Editor；原生桥和录制宿主测试不能证明 C# SDK 编译或实际渲染成功。

## 从源项目生成工程

准备 Node.js 22.12+、pnpm 12.3.4、Rust/Cargo 和 C 编译器。将目标块并入已有 `qua.project.yaml`；保留项目身份和其他目标：

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

业务入口导出异步 `bootstrap(services)`，返回初始化完成的 `engine` 与 `destroy()`；服务包含 host、assets、adapter、store、project、layout、静态包信任策略及拒绝动态模块的 loader。可选共享 QUI surfaces、features、对白／选项投影与 Godot/Cocos 共用；参考 [demo Unity 入口](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/unity/main.ts)和[共享业务](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/scene/main.ts)。普通插件中不能再次安装目标核心。

```sh
pnpm exec quack project build --target unity --all
```

仓库 demo 可使用 `pnpm --dir demo build:unity`。输出包含 `ProjectSettings/ProjectVersion.txt`、`Packages/manifest.json`、目标清单、兼容性 JSON 和 `Packages/com.quajs.unity-host`。原生插件对应本次构建主机 OS／CPU，换平台需要对应系统重新编译和验证。失败保留上一份产物；生成器拒绝覆盖作者工程及源码路径别名。

使用固定版本 Unity 打开生成目录。匹配生成标记的 Editor helper 会建立 `Assets/QuaEngine/Main.unity`，打开它进入 Play Mode。Unity 首次导入后才会生成真实的 `Packages/packages-lock.json`，应审阅并保留；生成成功不能冒充已经完成 SDK 依赖解析。发布前需要真实 Editor 编译、运行和 Player 构建。

## 嵌入已有 Unity 工程

在 Unity Package Manager 中添加生成目录内的 **`Packages/com.quajs.unity-host` 本地包**。不要复制整个项目覆盖父工程的 Packages、ProjectSettings 或场景。包里的自动场景配置只在匹配 `.qua-generated.json` 的独立生成项目中执行。

在父工程自己的 Canvas 下创建有实际尺寸的 RectTransform，添加 `QuaEngineHost`。关闭 `autoStart`，将生成结果中的 `contentPrefix` 和稳定的账号命名空间写入组件，再启动：

```csharp
module.autoStart = false;
module.contentPrefix = "QuaContent/<生成结果中的 ID>";
module.storageNamespace = "account-42";
module.Ready += OnReady;
module.Closed += OnClosed;
module.Failed += OnFailure;
module.StartModule();
// 导航离开、账号切换或销毁父容器前：
module.StopModule();
```

生命周期 API 在 Unity 主线程调用。Ready／Closed／Failed 通知在原生 tick 之外派发，避免反向 P/Invoke 重入。关闭模块只回收自己的投影节点、VM、媒体和计时资源，不调用 `Application.Quit`；应用帧率控制默认关闭。父工程继续拥有相机、Canvas、业务导航和错误恢复。

关闭会释放模块持有的媒体句柄；Unity 导入资源的缓存回收仍由父工程统一安排，模块不会全局调用 `Resources.UnloadUnusedAssets`。停机的 Promise 排空有时间／次数上限，业务插件不能依赖长延时完成清理；失败会报告并释放原生 VM。

点击模块区域后取得键盘焦点，点击外部或应用失焦时退出；指针先转换为容器局部坐标，再由共享渲染器转换为逻辑舞台坐标。多个组件各自拥有独立 VM；为独立剧情／账号使用不同 `storageNamespace`。仅仅隐藏组件不是完整的剧情／媒体暂停策略，关闭、后台运行及恢复行为仍需产品明确。

## 资源与功能边界

构建时图像／角色转 PNG、音频转 WAV、视频转 MP4，默认保留创作时的资源名称。图像从 QPK 字节解码；音频、视频和 TTF/OTF 字体额外生成以内容 hash 命名的 Unity 导入副本。它们仍来自构建期 QPK，不是动态散资源通道。完整保留 UPM 包的 Runtime/Resources，加载时保持 QPK 身份和 hash 校验。

当前仅支持构建期静态 QPK，拒绝动态 Runtime Packages、脚本模块与插件激活。已有 QuaScript 和逻辑插件可复用，没有 Unity 专属剧情语法。

基础 uGUI 宿主实现变换／透明度、固定逻辑舞台留边、文字与字体、图像区域、纯色框／分边框、指针／键盘、音频总线／音量／循环／seek／变速、VideoPlayer 和原子文件存储。效果、捕获、复杂文字与全部系统控件尚未与其他宿主对齐：字距、部分富文本／整形、模糊、遮罩／混合、渐变、阴影、圆角和可编辑控件需要继续完善。缺失效果会提示，捕获能力不对外声明。

Android、iOS、WebGL、IL2CPP 和 Unity-as-a-Library 分发尚未获得运行验收。后者是把 Unity 运行时嵌入原生应用的另一条集成方向，不能用本 UPM 接入结果替代。

## 验证入口

Quack 的消费者夹具会生成项目，再通过真实 QuickJS C ABI 执行生成的引擎代码，检查启动、对白投影和关闭。绘图桥是录制宿主，不能代替 Unity API 编译与像素／输入验证。

```sh
pnpm exec turbo run build typecheck test --filter=@quajs/unity-host --filter=@quajs/renderer-unity --filter=@quajs/scene-runtime --filter=@quajs/native-contracts --filter=@quajs/quack
cargo test --locked --manifest-path packages/platform/unity-host/runtime/Cargo.toml
```

真实 SDK 验收应覆盖：Editor 导入／C# 编译、Play Mode、剧情与选项、存读档跨重启、字体／音视频、反复启动／关闭、父容器缩放和焦点、两个模块的隔离、模块退出后父工程继续运行，以及目标 Player 构建。记录准确 Editor、OS／CPU、Mono／IL2CPP 和素材版本。更多契约见 [Unity Host](/docs/reference/unity-host)、[Unity renderer](/docs/reference/renderer-unity)与[嵌入指南](/docs/guides/embedding)。
