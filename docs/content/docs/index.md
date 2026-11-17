---
title: "欢迎来到 QuaEngine"
description: "从第一句对白，到一个可以交付的视觉小说世界。这里是创作者与开发者共同的手册。"
order: 0
---

QuaEngine 是一套基于 TypeScript 的视觉小说引擎。你可以用 QuaScript 写对白与分支，用插件组织音画演出，在独立编辑器里完成创作，再把作品部署到 Web、Cocos、Godot 或 Native 平台；此外，Unity 也提供了 6.3 LTS 的初始适配。

## 从这里开始

| 你想做什么 | 推荐入口 |
| --- | --- |
| 第一次使用，先跑一个项目 | [快速开始](/docs/getting-started) |
| 写对白、旁白和选项 | [第一幕](/docs/getting-started/first-story) · [QuaScript](/docs/authoring/quascript) |
| 在可视化工具中工作 | [编辑器](/docs/editor) · [角色](/docs/editor/character) · [动画](/docs/editor/animation) |
| 加背景、音乐与立绘 | [功能插件](/docs/plugins) |
| 选择平台或运行 Godot 项目 | [平台比较](/docs/platforms) · [Godot 指南](/docs/platforms/godot) |
| 嵌入已有应用、确认宿主版本 | [嵌入接入](/docs/guides/embedding) · [兼容性](/docs/platforms/compatibility) |
| 将剧情模块放入 Unity | [Unity 初始适配与嵌入](/docs/platforms/unity) |
| 查具体函数、配置和包 | [参考手册](/docs/reference) |
| 分发游戏或增量章节 | [构建与发布](/docs/guides/releasing) · [Runtime QPK](/docs/guides/runtime-packages) |

## 先了解三个基本原则

**故事状态归引擎所有。** 场景、台词、人物位置、选项、设置与音频意图都由 engine 和 store 管理。渲染器只负责读取投影并展示画面，再把玩家的点击和选择通过 pipeline 传回引擎。

**功能按插件按需组合。** 背景、音频、动画、图库、物品和成就都不是强耦合在内核里的死模块，项目只启用自己需要的那部分能力即可。

**内容通过资源包交付。** 开发期可以直接走 Vite 虚拟资源文件系统快速预览；正式发布时使用 Quack 打成资源包。运行期新增内容则以 Runtime QPK 的形式挂载，由引擎统一校验信任策略、依赖关系与生命周期。

## 如何阅读这套文档

「快速开始」「写下第一幕」与「QuaEngine Editor」章节提供了[英文版本](/docs/en)，其余创作指南目前为中文；参考手册保留了各包维护者的原始语言和代码示例。参考页会在构建文档站时从仓库 README 与设计文档自动同步，页底都有直达对应源码的链接。历史评审记录带有具体的测试日期和环境限制，阅读时请以最新的平台支持说明为准。

各项功能与平台限制的现状见[项目进展](/docs/project/status)。由于引擎还在快速演进、API 尚未最终定型，新建项目时建议锁定依赖版本。
