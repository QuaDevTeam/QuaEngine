---
title: "QuaEngine Editor"
seoTitle: "QuaEngine Editor 使用手册"
description: "从创建项目到编写、调试与打包，按工作流程使用独立的 QuaEngine 创作工作区。"
collapsed: true
order: 4
---

QuaEngine Editor 是独立 Electron 创作工作区。用 Monaco 编写 QuaScript / TypeScript，用语句属性、角色与动画工具编排演出，再运行项目自己的 Web 或 Native 开发入口。

本节提供完整对应的中英文文档。页面右上角可切换语言；当前 Editor 应用界面主要使用中文，文档语言切换不改变应用语言。

## 从创建项目开始

准备 Node.js 22.12+ 与 pnpm 12.3.4，在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev:editor
```

尚未获取源码或需要检查发行状态时，先看[获取编辑器](/docs/editor/downloads)。macOS 源码构建需要 Xcode Command Line Tools 和对应 Node-API 头文件，Native 游戏预览另需 Rust/Cargo。

## 完成一次创作循环

1. 按[项目与文件](/docs/editor/projects)创建或打开游戏，检查配置与依赖。
2. 在 Monaco 编辑正文，打开[语句属性](/docs/editor/authoring)调整对白、角色与演出指令。
3. 在[角色浏览器](/docs/editor/character)和[动画编辑器](/docs/editor/animation)准备源文件草稿，检查后正常保存。
4. 按[预览与调试](/docs/editor/preview)运行 Web / Native、定位到光标并走完受影响的选项。
5. 保存并处理磁盘冲突，按[生产打包](/docs/editor/builds)生成产物，再独立验证目标平台。

## 按任务查阅

| 任务 | 入口 |
| --- | --- |
| 新建游戏、插件或管理资源文件 | [项目与文件](/docs/editor/projects) |
| 调整布局、主题、终端与 Git | [工作区与工具](/docs/editor/workspace) |
| 编辑对白、装饰器与源码草稿 | [QuaScript 创作](/docs/editor/authoring) |
| 查看状态、资源、元素和性能 | [预览与调试](/docs/editor/preview) |
| 使用 AI 规划与改写 | [Novel Writer](/docs/editor/novel-writer) |
| 安装、启停或发布插件 | [插件市场](/docs/editor/marketplace) |
| 生成 Web 或 macOS Native 产物 | [生产打包](/docs/editor/builds) |
| 处理启动、保存与预览错误 | [排障](/docs/editor/troubleshooting) |
| 接入预览协议或开发工具 | [工作区开发参考](/docs/editor/workbench) · [Registry 参考](/docs/editor/registry) |

## 当前边界

编辑器内嵌预览目标为 Web 和 Native；Native 图层嵌入目前仅实现 macOS，Windows/Linux 不回退到截图传输。Cocos/Godot 从项目工具链生成独立工作区，不能据此认为它们已成为编辑器内嵌预览选项。

游戏状态仍由 engine/store 持有。编辑器表单与 AI 回写生成源码草稿，预览调试通过项目接入的开发协议发送意图。预览会话数据、源码文件和正式游戏存档是不同层次，详见[预览数据说明](/docs/editor/preview#存储与资源)。
