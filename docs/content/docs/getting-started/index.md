---
title: "快速开始"
description: "从源码启动编辑器，用附带的 SDK 创建 Vue + QuaScript 项目，运行第一段对白。"
order: 1
---

## 环境准备

使用 Node.js **22.12+** 与 pnpm **12.3.4**。macOS 源码构建还需要 Xcode Command Line Tools 和 Node-API 头文件来编译编辑器嵌入层；缺少头文件时构建错误会给出对应 Electron 版本的安装命令。运行 Native/Godot 游戏目标另需 Rust/Cargo。完整依赖说明见 [编辑器工作区](/docs/editor/workbench)。

```bash
node --version
pnpm --version
```

## 从源码启动编辑器

截至 2026-10-21，`create-qua-game` 尚未发布到 npm，编辑器也尚无公开 Release。当前从源码启动编辑器；其内置模板和 SDK 压缩包可创建不依赖未发布 QuaEngine npm 包的新项目。

```bash
git clone https://github.com/QuaDevTeam/QuaEngine.git
cd QuaEngine
pnpm install --frozen-lockfile
pnpm dev:editor
```

`dev:editor` 先构建编辑器依赖、模板和 SDK，再打开工作区。选择“文件 → 新建项目”，填写新项目的父目录和名称，选择常规 Vue / QuaScript 游戏。

默认模板是 `visual-novel-vue`，包含引擎、Vue 渲染器、QuaScript 编译、开发资源加载与构建配置。编辑器将 SDK 存入项目的 `vendor/quajs`，依赖使用本地压缩包；新项目可以移出源码仓库。第三方依赖安装仍需要注册表连接。

## 运行新项目

在编辑器打开刚创建的项目并启动 Web 预览，按界面提示完成依赖安装。也可在新项目目录的终端执行：

```bash
pnpm install
pnpm run project:validate
pnpm run project:doctor
pnpm dev
```

浏览器地址以终端输出为准。首次预览会进入示例对白；点击或使用输入插件的推进操作，检查故事能否继续。若只想体验已有故事，可直接[运行仓库 Demo](/docs/getting-started/demo)。

## 找到要修改的文件

| 文件 | 作用 |
| --- | --- |
| `src/game/scenes/opening.qs` | 第一段故事 |
| `src/game/bootstrap.ts` | 引擎、插件、初始场景和渲染器接线 |
| `qua.project.yaml` | 游戏名称、标识、图标和发布目标 |
| `assets/` | 背景、立绘、音频等原始资源 |
| `src/game/styles.css` | 项目自己的视觉样式 |
| `vite.config.ts` | QuaScript、资源与 Web 构建集成 |

## 确认项目可以构建

```bash
pnpm typecheck
pnpm run assets:build
pnpm build
```

模板图标是 QuaEngine 品牌的开发占位图。发布自己的作品前，应替换成你有权使用的游戏素材，并检查 `qua.project.yaml` 的图标路径。

接下来阅读 [第一幕](/docs/getting-started/first-story)。如果你希望先体验已有故事，可以 [运行仓库 Demo](/docs/getting-started/demo)。
