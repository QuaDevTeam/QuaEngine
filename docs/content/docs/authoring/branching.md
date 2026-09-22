---
title: "选择与故事图"
description: "让每个可见选项都有明确、可恢复的叙事目标。"
order: 2
---

## 选择不会凭空创建节点

```qs
- 去海边 -> seaside
- 留在书店 -> bookshop
```

这段语法生成选择与跳转请求。你仍然需要在故事图或项目跳转处理器中定义目的地。模板的 `settings` 与 `continue` 是宿主显式处理的目标，不是语言内置关键字。

## 目标类型

| 写法 | 目标 |
| --- | --- |
| `seaside` | 故事节点 |
| `#letter` | 脚本标签 |
| `scene:station#arrival` | 场景与入口 |
| `script:chapter-two#opening` | 脚本模块与节点 |
| `package:chapter-two#opening` | Runtime QPK 中的节点 |

目标注册与跳转的 TypeScript 接口见 [故事图参考](/docs/reference/story-graph)。选择生成后，引擎等待 `user/choice_select`，记录 `ctx.choice` 并执行跳转，渲染器只展示选项和发送选择意图。

## 条件与不可用选项

```qs
- 打开房门 -> room if scope.hasKey
```

这要求 `hasKey` 存在于剧本的 Scope。需要显示禁用原因、稳定选项 ID 或缩略图时，用 `@Choice(text, target, options)`。不要把 `@Choice` 与背景等非选择装饰器混在同一个块内。

## 章节选择与已读状态

章节列表来自带 `chapterSelect` 元数据的节点和引擎拥有的解锁记录。不要另存一份由 UI 决定的章节解锁状态。开发时至少验证：首次阅读、完成一章、重新载入、跳转章首，以及未解锁入口是否仍被保护。

## 运行期扩展章节

新增 QPK 可以继续同一场景、路线或时间线。节点、检查点、存档和回看条目必须保留 `contentPackageId` 与所需运行期包信息，不能仅凭场景 ID 判断依赖已经齐全。

下一步阅读 [Runtime QPK](/docs/guides/runtime-packages) 与 [故事图参考](/docs/reference/story-graph)。
