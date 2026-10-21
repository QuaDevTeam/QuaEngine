---
title: "选择你的舞台"
description: "比较 Web、Cocos、Godot 与 Native 的运行时、构建入口和平台验证边界。"
collapsed: true
order: 5
---

## 平台比较

| 平台 | 实现 | 适合的起点 | 当前边界 |
| --- | --- | --- | --- |
| Web | DOM / WebAudio + Vue、React、Svelte 薄适配器 | 默认 Vue 脚手架 | 浏览器安全与自动播放策略 |
| Cocos | Cocos renderer + Creator Host + 共享 QUI | 从 demo 生成独立 Creator 工作区 | 本机 Creator 3.8.8 Web/macOS；通用 Host 可选能力降级 |
| Godot | Godot 4.7+ + Rust GDExtension / QuickJS + 共享场景投影 | 从 demo 生成独立 Godot 项目 | 首批 macOS 验证；仅静态 QPK；Windows/Linux 需实测 |
| Native | Rust + JavaScriptCore + wgpu | 仓库 Demo / Native 工具链 | 平台运行验证和 Web 视觉一致性仍持续完善 |

默认脚手架是 Vue 模板；存在 React 和 Svelte 渲染器并不代表已有同等数量的开箱即用模板。

## 平台间共享什么

QuaScript、场景、故事状态、资源身份、存档依赖和功能插件可以复用。Cocos/Godot 还共用 `@quajs/renderer-scene` 与 `@quajs/scene-host`；共享 QUI/TSX 与 QSS 可投影到不同宿主。DOM、对象 URL、WebAudio 解锁、Cocos/Godot 节点和 wgpu 纹理是各自的实现细节，不应进入跨平台引擎核心。

Godot 的 QuickJS 与 Native 的 JavaScriptCore 是两套独立宿主。动态 Runtime QPK 是否可用取决于目标注入的能力；Godot 当前明确拒绝动态包和可执行模块。

## 一个产物只有一个核心目标

打包从当前平台 resolver 开始。项目图、渲染子入口和最终 `target-bundle-manifest.json` 都要排除其他目标的 core。Web、Cocos、Godot、Native 四个目标家族互斥，不能先装入所有启动壳再期待打包器自动裁掉它们。

继续阅读 [Web](/docs/platforms/web)、[Cocos](/docs/platforms/cocos)、[Godot](/docs/platforms/godot) 或 [Native](/docs/platforms/native)。

Cocos 的[媒体一致性](/docs/platforms/cocos-media)单独列出音频、视频和数值动画的实际支持与未验收范围。该报告的三端为生产 Web、Creator Web 和 Cocos macOS。
