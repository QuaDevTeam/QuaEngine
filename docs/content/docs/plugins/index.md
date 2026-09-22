---
title: "按需组合功能插件"
description: "引擎负责叙事，插件为故事提供音画、收集、设置与扩展能力。"
collapsed: true
order: 3
---

## 插件与渲染插件要配对

逻辑插件拥有功能状态、API 与投影，渲染插件显示对应投影并发送用户意图。Web 的复用实现放在 `@quajs/renderer-web/plugins/*`，Vue、React、Svelte 通过薄适配器使用它们。

```ts
import { BackgroundPlugin } from '@quajs/plugin-background'
import { AudioPlugin } from '@quajs/plugin-audio'

// engine 是项目已经创建的 QuaEngine 实例。
engine.use(new BackgroundPlugin()).use(new AudioPlugin())
```

具体注册时序、渲染 preset 和样式导入应以目标平台模板为准。官方 Web 渲染器不会隐式导入视觉样式。

## 功能目录

| 功能 | 包 / 文档 |
| --- | --- |
| 背景、视频、分层和 CG | [Background](/docs/plugins/background) |
| BGM、语音、音效与总线 | [Audio](/docs/plugins/audio) |
| 时间轴与关键帧 | [Animation](/docs/plugins/animation) |
| 立绘、表情与 UI 皮肤 | [Sprite](/docs/plugins/sprite) |
| 字体与回退 | [Fonts](/docs/plugins/fonts) |
| 回看、回溯和语音重放 | [Backlog](/docs/plugins/backlog) |
| 图库与内容解锁 | [Gallery](/docs/plugins/gallery) |
| 成就、奖励与提示 | [Achievement](/docs/plugins/achievement) |
| 道具、分类与数量 | [Inventory](/docs/plugins/inventory) |
| 玩家与开发者设置 | [Settings](/docs/plugins/settings) |
| 资源等待与重试 | [Asset loading](/docs/plugins/asset-loading) |
| 故事路线与章节选择 | [Story graph](/docs/reference/story-graph) |

## 编写自己的插件

从 [插件系统](/docs/reference/plugin-system) 开始，定义引擎拥有的状态、生命周期和 pipeline 事件。构建支持 Runtime QPK 的功能时，还要明确来源标记、依赖收集、幂等迁移和卸载清理。

提供编辑器面板的插件参阅 [编辑器插件契约](/docs/design/editor-plugins) 和 [市场发布](/docs/editor/registry)。Web / Cocos / Native 的 target core 不属于可随意注册的普通插件。
