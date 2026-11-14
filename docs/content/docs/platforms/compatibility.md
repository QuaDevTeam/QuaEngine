---
title: "宿主版本与兼容性"
description: "区分构建基线、导出工程的宿主要求与已经验证的平台，明确各目标的声明范围与 Unity 初始适配的验收边界。"
order: 6
---

## 当前声明

以下依据仓库当前配置整理于 **2026-11-14**。版本基线说明代码和生成器的要求；已验证范围要结合实际运行记录。安装更新版本的第三方 SDK，并不会自动扩大 QuaEngine 的兼容承诺。

| 环境／目标 | 版本要求或构建基线 | 验证边界 |
| --- | --- | --- |
| 源码工具链 | Node.js **22.12+**，pnpm **12.3.4** | CI 使用 Node 22；包自身 `engines` 不等于整个工具链的要求 |
| Web | Vite 8、TypeScript 6；Vue 3／React 19／Svelte 5 适配器 | 精确依赖见 lockfile；其他宿主框架版本需接入测试，SSR 仅客户端挂载 |
| Cocos | **Creator 3.8.8** 生成配置与原生产品 | 当前工程基线；不承诺所有 3.x／未来版本。Web/macOS 记录不等于 Android/iOS 验收 |
| Godot | **Godot 4.7 API**，godot-rust **0.5.5**，rquickjs **0.12.1** | GDExtension 声明最低 4.7；更高小版本需回归，不声明 Godot 5。首批 macOS；Windows/Linux 需对应系统构建与实测 |
| Native | Cargo.lock 锁定 crate 依赖，JavaScriptCore 由平台提供 | `.app` 与 C ABI 1 库导出为 macOS 当前架构；库 deployment target 11.0，实际旧系统、其他 OS 和设备另需验证 |
| Unity | **6.3 LTS / 6000.3.x**，默认工程固定 **6000.3.28f1** | 初始桌面适配；QuickJS／契约验证与 Unity Editor／Player／IL2CPP 验收分开，后者尚未完成 |

Godot、Cocos、Unity 及 Native 库生成目录还包含 `qua-host-compatibility.json`，区分声明的 SDK 系列、当前主机和待完成的 SDK 运行验收。Creator 工作区当前只接受 3.8.8；Godot 声明 4.7.x，4.8／5 需要另行适配。

Godot 的 `.gdextension` 最低版本和 `project.godot` 的 feature 字段是加载基线，不代表已经测试所有更高版本。生成的动态库只对应构建主机的 OS／架构；换平台需重编译，并安装与 Editor 版本匹配的 export templates。Cocos 的引擎 profile、原生产品、导入器 metadata 和 CLI 行为需要一起验证，不能只改版本字符串。

## 每个交付工程需要携带什么

交付或维护导出工程时记录：QuaEngine 的版本／源码提交、目标 SDK 的准确版本、最低加载版本、实际测试版本列表、OS／CPU、构建 profile、Rust／原生编译器、模板／SDK 依赖、QPK 身份与 hash、验证日期及未覆盖能力。精确版本以项目配置和 lockfile 为依据；`target-bundle-manifest.json` 用于目标隔离和依赖，不应把它误当作 SDK 测试矩阵。

兼容说明放在生成工程 README 和交付记录中，并与生成器保持同步。升级 SDK 后重建原生桥、重新导入资源、打包，在实际窗口验证输入、字体、视频、音频、存档、退出和卸载，再扩大测试版本范围。构建成功不能单独证明运行兼容。升级流程见[依赖维护](/docs/project/dependencies)。

## Unity 的版本声明

当前 `quack project build --target unity --all` 生成独立工程和可嵌入 UPM 包。`targets.unity.editorVersion` 必须是稳定的 `6000.3.NfN`；项目的 ProjectVersion.txt 固定准确版本，UPM manifest 声明 6000.3 最低系列，兼容性 JSON 记录初始边界和本机插件 OS／CPU。Unity 自己导入后产生 packages-lock，不能提前捏造完整 SDK 依赖解析结果。

初始实现以 Unity 6.3 LTS 为目标，**尚无本机 Unity Editor／Player 运行验收**。Rust/C ABI 与生成消费者测试使用真实 QuickJS 和录制绘图桥，不能证明 C# 编译、uGUI、IL2CPP 或设备媒体表现。详见 [Unity 适配与嵌入](/docs/platforms/unity)。Unity 官方的 [Unity as a Library](https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/cross-platform-features/unityasa-library) 是将 Unity 嵌入原生应用的另一条方向，本次 UPM 接入不等于该能力已验收。

独立工程与嵌入包分别管理文件所有权。已有 Unity 应用只接入生成的 UPM 包和宿主组件；匹配生成标记的独立工程才允许 Editor helper 创建初始场景和设置，不能覆盖父工程的 ProjectSettings、Packages 或退出流程。

将引擎作为已有产品的一部分使用，继续阅读[嵌入已有应用](/docs/guides/embedding)。
