---
title: "创作指南"
description: "从结构清晰的剧本，到角色、分支和音画演出。"
order: 2
---

## 推荐创作顺序

先用纯文本跑通一幕的对白与选项，再逐步增加背景、角色、动画和音频。每加入一个会影响存档或跳转的能力，马上验证当前位置恢复与目标跳转。

| 阶段 | 阅读 |
| --- | --- |
| 编写文本 | [QuaScript](/docs/authoring/quascript) |
| 设计路线 | [选择与故事图](/docs/authoring/branching) |
| 安排角色 | [角色与演出](/docs/authoring/characters) |
| 背景、音乐、转场 | [音画演出](/docs/authoring/staging) |
| 管理资源 | [资源工作流](/docs/guides/assets) |
| 用可视化工具修改 | [编辑器](/docs/editor) |

## 文本与工程各自负责什么

QuaScript 负责清晰表达台词、动作指令和选择。复杂计算、项目配置、插件安装、平台服务与发布接线放在 TypeScript 和构建配置中。

不要在剧本中硬编码开发机路径，也不要从渲染器 UI 直接修改故事变量。角色表情和音频状态需要进入引擎投影，才能在读档和回看时恢复。
