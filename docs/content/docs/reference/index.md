---
title: "参考手册"
description: "从各包维护的原始文档直接生成，查找接口、配置和完整示例。"
collapsed: true
order: 7
---

## 引擎基础

以下示例默认运行在源码工作区或编辑器生成的 SDK 项目中；如果要通过独立 npm 安装使用，请先核实对应包与版本是否已经公开发布。入门引导见[快速开始](/docs/getting-started)。

- [Engine 全局 API](/docs/reference/engine)：引擎运行时与全局快捷操作。
- [引擎插件开发](/docs/reference/plugin-system)：扩展点与插件生命周期。
- [Pipeline 事件管线](/docs/reference/pipeline)：逻辑层与渲染层之间唯一的事件总线。
- [Store 状态与持久化](/docs/reference/store)：状态容器、快照与存储后端。
- [QuaAssets 资源系统](/docs/reference/assets)：字节级资源读取、包加载与平台适配器契约。
- [故事图与章节选择](/docs/reference/story-graph)：节点、路线与章节解锁投影。
- [嵌入会话插件](/docs/reference/embedded)：模块导出参数传入、持久化钩子与结果回传协议。

## 构建与语言工具

- [QuaScript 语法与编译器](/docs/reference/quascript)：剧本语法、编译选项与配置。
- [Quack 打包参考](/docs/reference/quack)：资源打包、清单、平台目标与增量补丁。
- [Vite 集成](/docs/reference/vite)：项目开发与构建接入。
- [项目脚手架](/docs/reference/create-qua-game)：模板项目初始化工具。
- [QuaScript 语言服务](/docs/reference/language-server) 与 [VS Code 剧本扩展](/docs/reference/vscode)。

## 渲染与平台适配

- Web 家族：[Web 渲染器](/docs/reference/renderer-web)、[Vue 渲染适配器](/docs/reference/renderer-vue)、[React 渲染适配器](/docs/reference/renderer-react)、[Svelte 渲染适配器](/docs/reference/renderer-svelte) 与 [Web 资源适配器](/docs/reference/assets-web)。
- Cocos 家族：[Cocos 渲染器与共享 QUI](/docs/reference/renderer-cocos)、[Creator 宿主与媒体能力](/docs/reference/cocos-host)、[Cocos 存档持久化](/docs/reference/store-cocos)。上手顺序见[Cocos 工作区指南](/docs/platforms/cocos)，媒体对比见[媒体一致性](/docs/platforms/cocos-media)。
- Godot 家族：[Godot 渲染适配器](/docs/reference/renderer-godot)与 [Godot 宿主与独立项目](/docs/reference/godot-host)。起步请看[Godot 独立项目指南](/docs/platforms/godot)。
- Unity 家族：[Unity 渲染适配器](/docs/reference/renderer-unity)与 [Unity 宿主与嵌入包](/docs/reference/unity-host)。范围与限制见[Unity 适配与嵌入](/docs/platforms/unity)。
- 跨宿主共享场景层：[共享场景投影](/docs/reference/renderer-scene)、[共享场景宿主契约](/docs/reference/scene-host)与 [共享场景脚本宿主](/docs/reference/scene-runtime)（供 Cocos、Godot 与 Unity 共用）。
- Native UI：[Native UI 编辑扩展](/docs/reference/native-vscode)。

## 功能插件与深层设计

按功能查阅[功能插件目录](/docs/plugins)，按内部架构查阅[架构与设计](/docs/design)。各平台的最新支持进度以[项目当前进展](/docs/project/status)及源码实现为准。

参考手册的正文会在每次构建文档站时从各包的原始 README 自动同步；如需修正错误，请点击页底的源码链接回到原仓库文件修改，不要直接修改 `.generated` 目录。
