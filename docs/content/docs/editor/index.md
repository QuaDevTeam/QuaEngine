---
title: "QuaEngine Editor"
seoTitle: "QuaEngine Editor 使用手册"
description: "从创建项目到编写、调试与打包，按工作流程使用独立的 QuaEngine 创作工作区。"
collapsed: true
order: 4
---

QuaEngine Editor 是基于 Electron 的独立创作工作区。你可以在内置的 Monaco 编辑器里写 QuaScript 和 TypeScript，通过语句属性、角色与动画面板编排演出，然后直接运行项目自带的 Web 或 Native 开发预览。

本节提供了完全对应的中英文文档，通过页面右上角的语言切换器即可切换。需要留意的是，目前 Editor 软件本身的界面主要为中文，切换文档语言不会改变软件界面语言。

## 从创建项目开始

准备好 Node.js 22.12+ 与 pnpm 12.3.4 后，在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev:editor
```

如果还没克隆仓库，或者想了解正式安装包发布情况，可以先看[获取编辑器](/docs/editor/downloads)。macOS 源码构建需要 Xcode Command Line Tools 和对应版本的 Node-API 头文件；如果要预览 Native 游戏画面，另需安装 Rust 和 Cargo。

## 一次完整的创作流程

1. 参考[项目、文件与资源](/docs/editor/projects)新建或打开游戏项目，检查配置和依赖状态。
2. 在 Monaco 中编写剧本正文，打开[语句属性](/docs/editor/authoring)调整对白、角色和演出指令。
3. 使用[角色浏览器](/docs/editor/character)和[动画编辑器](/docs/editor/animation)生成源码草稿，核对无误后正常保存。
4. 按[预览、定位与调试](/docs/editor/preview)启动 Web 或 Native 预览，定位到光标所在行，实际点一遍受影响的选项分支。
5. 保存文件并处理好磁盘冲突后，按[生产打包与产物检查](/docs/editor/builds)导出产物，并在对应目标平台上单独做一次实测。

## 按任务查阅

| 你想做什么 | 推荐入口 |
| --- | --- |
| 新建游戏、插件或管理资源文件 | [项目、文件与资源](/docs/editor/projects) |
| 调整布局、主题、集成终端与 Git | [工作区、设置与工具](/docs/editor/workspace) |
| 编辑对白、装饰器与源码草稿 | [QuaScript 创作与源码草稿](/docs/editor/authoring) |
| 检查元素树、存储、资源和性能 | [预览、定位与调试](/docs/editor/preview) |
| 使用 AI 规划、改写与审核稿件 | [Novel Writer 写作助手](/docs/editor/novel-writer) |
| 安装、启停或发布编辑器插件 | [安装与发布插件](/docs/editor/marketplace) |
| 打包 Web 或 macOS Native 产物 | [生产打包与产物检查](/docs/editor/builds) |
| 排查启动、保存与预览报错 | [Editor 常见问题](/docs/editor/troubleshooting) |
| 接入预览协议或开发编辑器扩展 | [工作区开发参考](/docs/editor/workbench) · [Registry 服务参考](/docs/editor/registry) |

## 当前功能边界

编辑器内嵌预览目前面向 Web 与 Native 两种目标，其中 Native 图层内嵌目前仅支持 macOS（Windows 和 Linux 暂不支持，也不会回退到截图传输）。Cocos 和 Godot 需要通过项目工具链单独生成各自的工作区，并不在这个内嵌预览菜单里。

游戏状态依然归 engine 和 store 所有。编辑器里的可视化表单与 AI 回写生成的都是源码草稿，预览调试工具也是通过项目接入的开发协议向引擎发送意图。另外，预览时的临时会话数据、磁盘上的源码文件和正式游戏的玩家存档分属不同层级，具体说明见[存储与资源](/docs/editor/preview#存储与资源)。
