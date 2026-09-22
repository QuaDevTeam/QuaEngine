---
title: "快速开始"
description: "创建一个 Vue + QuaScript 项目，运行开发预览，再写下第一段对白。"
order: 1
---

## 环境准备

推荐 Node.js 22 LTS 的最新补丁版，使用 pnpm。仓库固定 pnpm `12.3.4`。源码开发中的类型剥离命令需要 Node.js 22.6+；本文文档站的 Vite 8 需要 Node.js 20.19+ 或 22.12+。

```bash
node --version
pnpm --version
```

## 创建项目

```bash
pnpm create qua-game my-story
cd my-story
pnpm install
pnpm run project:validate
pnpm run project:doctor
pnpm dev
```

默认模板是 `visual-novel-vue`，包含引擎、Vue 渲染器、QuaScript 编译、开发资源加载与构建配置。浏览器地址以终端输出为准。

模板已经接好了必要的入口。首次预览会进入示例对白；点击或使用输入插件提供的推进操作，检查故事能否继续。创建失败时先确认注册表可访问以及当前版本的 `create-qua-game` 可用。

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
