---
title: "欢迎来到 QuaEngine"
description: "从第一句对白，到一个可以交付的视觉小说世界。这里是创作者与开发者共同的手册。"
order: 0
---

QuaEngine 是以 TypeScript 为基础的视觉小说引擎。你可以用 QuaScript 写对白与分支，用插件组织音画演出，在独立编辑器里创作，再选择 Web、Cocos 或 Native 作为舞台。

## 从这里开始

| 你想做什么 | 推荐入口 |
| --- | --- |
| 第一次使用，先跑一个项目 | [快速开始](/docs/getting-started) |
| 写对白、旁白和选项 | [第一幕](/docs/getting-started/first-story) · [QuaScript](/docs/authoring/quascript) |
| 在可视化工具中工作 | [编辑器](/docs/editor) · [角色](/docs/editor/character) · [动画](/docs/editor/animation) |
| 加背景、音乐与立绘 | [功能插件](/docs/plugins) |
| 查具体函数、配置和包 | [参考手册](/docs/reference) |
| 分发游戏或增量章节 | [构建与发布](/docs/guides/releasing) · [Runtime QPK](/docs/guides/runtime-packages) |

## 先理解三个约定

**故事状态由引擎持有。** 场景、台词、人物位置、选项、设置与音频意图属于 engine/store。渲染器读取投影，再通过 pipeline 把玩家点击传回引擎。

**功能通过插件组合。** 背景、音频、动画、图库、物品与成就不是不可拆卸的引擎内核。项目只启用自己需要的能力。

**内容通过资源包交付。** 开发期资源可以走 Vite 虚拟资源文件系统；正式资源通过 Quack 打包。新增运行期内容以 QPK Runtime Package 挂载，由引擎统一处理信任、依赖与生命周期。

## 如何阅读这套文档

入门与创作指南采用中文，参考手册保留各包维护者的原始语言和代码示例。参考页在构建时从仓库 README 和设计记录生成，页底可以回到对应源码。历史评审带有日期和验证环境，不能代替当前平台支持说明。

当前功能与平台限制见 [项目进展](/docs/project/status)。引擎尚未承诺稳定 API，开始一个新项目时请固定依赖版本。
