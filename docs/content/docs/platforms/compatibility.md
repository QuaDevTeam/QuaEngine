---
title: "宿主版本与兼容性"
description: "区分构建基线、导出工程的宿主要求与已经验证的平台，明确各目标的声明范围与 Unity 初始适配的验收边界。"
order: 6
---

## 当前基线声明

下表依据仓库配置整理于 **2026-11-14**。这里的版本基线代表代码与生成器目前针对的宿主环境；实际能跑通多少平台，需要结合各自的运行记录来判断。本地装了更新版本的第三方 SDK，并不自动意味着 QuaEngine 已经兼容该版本。

| 环境 / 目标 | 版本要求或构建基线 | 当前验证边界 |
| --- | --- | --- |
| 源码工具链 | Node.js **22.12+**，pnpm **12.3.4** | CI 使用 Node 22；个别包的 `engines` 字段不代表整个工具链的要求 |
| Web | Vite 8、TypeScript 6；Vue 3、React 19、Svelte 5 适配器 | 精确依赖版本见 lockfile；接入其他宿主框架版本需自测，SSR 仅在客户端挂载 |
| Cocos | **Creator 3.8.8** 生成配置与原生媒体产品 | 当前工程基线，不承诺兼容所有 3.x 或后续大版本；Web/macOS 记录不代表 Android/iOS 已验收 |
| Godot | **Godot 4.7 API**，godot-rust **0.5.5**，rquickjs **0.12.1** | GDExtension 声明最低 4.7；更高小版本需回归，不支持 Godot 5。首批仅测了 macOS，Windows/Linux 需对应系统构建实测 |
| Native | `Cargo.lock` 锁定 crate 依赖，JavaScriptCore 由系统提供 | `.app` 与 C ABI 1 库导出针对 macOS 当前架构；deployment target 为 11.0，旧系统及其他 OS 另需实测 |
| Unity | **6.3 LTS / 6000.3.x**，默认工程固定 **6000.3.28f1** | 初始桌面适配；QuickJS 与契约测试和 Unity Editor、Player、IL2CPP 验收分开，后者尚未完成 |

Godot、Cocos、Unity 及 Native 库导出目录下都会附带一份 `qua-host-compatibility.json`，用来标明声明的 SDK 系列、当前构建主机信息以及尚未完成的运行验收项。目前 Creator 工作区只接受 3.8.8；Godot 声明支持 4.7.x，4.8 或 5.x 需要单独适配。

需要留意的是，Godot `.gdextension` 里的最低版本以及 `project.godot` 中的 feature 标记只是加载基线，不代表所有更高版本都已经测通。生成的原生动态库也只对应当前构建主机的 OS 和 CPU 架构，换平台分发时要重新编译并换上对应版本的 export templates。同理，升级 Cocos 版本时也要连同引擎 profile、原生媒体产物、资源导入 metadata 和 CLI 行为一起重新验证，不能只改配置文件里的版本号。

## 交付工程建议记录哪些信息

在团队内部交付或长期维护导出的工程时，建议留存一份记录，写明：QuaEngine 的版本号与源码 commit、目标 SDK 的精确版本、最低加载版本、实际实测过的版本列表、构建机 OS 与架构、构建 profile、Rust 或原生编译器版本、模板与 SDK 依赖、QPK 身份与哈希、验收日期以及已知未覆盖项。实际依赖以项目配置和 lockfile 为准；`target-bundle-manifest.json` 的作用是记录目标核心隔离与依赖关系，它并不是一张 SDK 测试矩阵。

兼容说明最好直接写在生成工程的 README 和交付记录里，并与生成器保持同步。每当升级第三方 SDK 后，请重建原生桥接代码、重新导入资源并重新打包，再到真实窗口里依次测一遍输入、字体、音视频、存档、退出和卸载，确认无误后再扩大对外声明的兼容版本。升级依赖的完整步骤见[第三方依赖维护](/docs/project/dependencies)。

## Unity 的版本声明

运行 `quack project build --target unity --all` 会同时生成独立测试工程和可嵌入的 UPM 包。配置中的 `targets.unity.editorVersion` 必须是稳定的 `6000.3.NfN` 版本号；生成工程会在 `ProjectVersion.txt` 里锁定该精确版本，UPM manifest 声明最低兼容 6000.3 系列，`qua-host-compatibility.json` 则记录当前的初始适配范围和本机原生插件的 OS/CPU 信息。真实的 `Packages/packages-lock.json` 要等 Unity 首次打开工程导入后才会生成，生成阶段不会伪造 SDK 依赖解析结果。

由于目前是 Unity 6.3 LTS 的初始适配，**本机尚未完成 Unity Editor 和 Player 的实测验收**。现有的 Rust/C ABI 测试和生成器测试使用的是真实 QuickJS 与录制绘图桥，它们能确保协议和生命周期逻辑无误，但不能替代真实的 C# 编译、uGUI 表现、IL2CPP 构建或设备媒体测试，详情见[Unity 适配与嵌入](/docs/platforms/unity)。此外，Unity 官方的 [Unity as a Library](https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/cross-platform-features/unityasa-library) 是把 Unity 嵌入原生应用的另一条路线，与这里的 UPM 模块接入不同。

在文件所有权上，独立生成工程和嵌入用 UPM 包是明确分开的：已有 Unity 应用只需要引入导出的 UPM 包并使用 `QuaEngineHost` 组件；只有带有 `.qua-generated.json` 标记的独立生成工程，才会允许 Editor helper 自动建立初始场景和配置，绝不会反过来覆盖父工程的 `ProjectSettings`、`Packages` 或退出逻辑。

如果你想把 QuaEngine 当作已有产品里的一个模块来集成，请继续阅读[嵌入已有应用](/docs/guides/embedding)。
