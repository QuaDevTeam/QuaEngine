---
title: "选择你的舞台"
description: "比较 Web、Cocos、Godot、Unity 与 Native 的运行时、构建入口和平台验证边界。"
collapsed: true
order: 5
---

## 平台比较

| 平台 | 实现方式 | 推荐起点 | 当前边界与注意 |
| --- | --- | --- | --- |
| Web | DOM / WebAudio + Vue、React、Svelte 薄适配器 | 默认 Vue 脚手架 | 需遵循浏览器安全策略与自动播放限制 |
| Cocos | Cocos renderer + Creator Host + 共享 QUI | 从 Demo 生成独立 Creator 工作区 | 基于本机 Creator 3.8.8 的 Web 与 macOS 构建；通用 Host 可选能力按需降级 |
| Godot | Godot 4.7 API + Rust GDExtension / QuickJS + 共享场景投影 | 从 Demo 生成独立 Godot 项目 | 首批已完成 macOS 验证；仅支持静态 QPK；Windows 与 Linux 需自行实测 |
| Unity（初始适配） | Unity 6.3 LTS + Rust / QuickJS + 共享场景投影 | 生成工程或接入 UPM 包 | 仍待真实 Unity Editor、Player 与 IL2CPP 运行验收 |
| Native | Rust + JavaScriptCore + wgpu | 仓库 Demo 或 Native 工具链 | 跨平台运行验证及与 Web 的视觉一致性仍在持续完善 |

默认脚手架提供的是 Vue 模板；虽然仓库也提供了 React 和 Svelte 渲染器，但目前还没有为它们单独配齐同等数量的开箱模板。

准确的宿主版本、最低加载要求与当前已验证范围见[宿主版本与兼容性](/docs/platforms/compatibility)。Unity 的 6.3 LTS 适配与 UPM 嵌入包详情见 [Unity 适配与嵌入](/docs/platforms/unity)。如果要把 QuaEngine 嵌入到现有应用里，请先看[嵌入已有应用](/docs/guides/embedding)。

## 平台之间共享什么

QuaScript 剧本、场景流程、故事状态、资源身份、存档依赖和功能插件都可以跨平台复用。Cocos、Godot 和 Unity 还共同使用 `@quajs/renderer-scene` 与 `@quajs/scene-host`，把同一套 QUI/TSX 和 QSS 界面投影到各自宿主。至于 DOM、对象 URL、WebAudio 解锁、Cocos/Godot 节点和 wgpu 纹理，则属于各平台自己的实现细节，不会混进引擎核心。

需要注意的是，Godot 使用独立的 QuickJS 宿主，而 Native 使用 JavaScriptCore。运行期能否动态加载 Runtime QPK 取决于目标宿主开放的能力——例如 Godot 目前明确拒绝动态包和可执行模块。

## 一个产物只保留一套目标核心

项目打包会从当前选定的平台 resolver 出发。项目依赖图、渲染器子入口和最终产出的 `target-bundle-manifest.json` 都必须排除其他平台的核心模块。Web、Cocos、Godot、Unity、Native 这五个目标家族彼此互斥，不能先把所有启动壳都打进去再指望打包器自动裁剪。

你可以继续按平台查看：[Web](/docs/platforms/web)、[Cocos](/docs/platforms/cocos)、[Godot](/docs/platforms/godot)、[Unity](/docs/platforms/unity) 或 [Native](/docs/platforms/native)。

如果想具体对比 Cocos 平台下音频、视频和数值动画的真实支持情况，可以查阅[Cocos 媒体一致性](/docs/platforms/cocos-media)（该报告对比的是生产 Web、Creator Web 与 Cocos macOS 三端）。
