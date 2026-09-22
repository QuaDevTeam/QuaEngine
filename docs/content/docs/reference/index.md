---
title: "参考手册"
description: "从各包维护的原始文档直接生成，查找接口、配置和完整示例。"
collapsed: true
order: 7
---

## 引擎基础

- [Engine API](/docs/reference/engine)：运行时与全局操作。
- [插件系统](/docs/reference/plugin-system)：扩展与生命周期。
- [Pipeline](/docs/reference/pipeline)：唯一事件管线。
- [Store](/docs/reference/store)：状态与持久化。
- [QuaAssets](/docs/reference/assets)：资源字节、包与适配契约。
- [故事图](/docs/reference/story-graph)：节点、路线与章节选择。

## 构建与语言工具

- [QuaScript](/docs/reference/quascript)：语言、编译与配置。
- [Quack](/docs/reference/quack)：资源打包、清单、目标与补丁。
- [Vite 插件](/docs/reference/vite)：项目构建集成。
- [create-qua-game](/docs/reference/create-qua-game)：项目生成。
- [语言服务](/docs/reference/language-server) 与 [VS Code 扩展](/docs/reference/vscode)。

## 渲染与平台

- [Web](/docs/reference/renderer-web)、[Vue](/docs/reference/renderer-vue)、[React](/docs/reference/renderer-react)、[Svelte](/docs/reference/renderer-svelte)。
- [Web 资源适配器](/docs/reference/assets-web)。
- [Native UI 编辑扩展](/docs/reference/native-vscode)。

## 功能与深层设计

按功能查询 [插件目录](/docs/plugins)，按架构查询 [设计文档](/docs/design)。平台状态和限制以 [项目进展](/docs/project/status) 与当前源码为准。

参考正文在每次站点构建时从包 README 生成。修改时请回到页面底部链接的原始文件，不直接编辑 `.generated` 内容。
