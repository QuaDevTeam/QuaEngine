---
title: "理解引擎的几个概念"
description: "场景、步骤、投影、管线和资源包如何共同运行一个视觉小说。"
order: 3
---

## 一次点击如何变成下一句对白

1. QuaScript 编译为可执行的 `GameStep[]`，交给场景和引擎运行。
2. 当前步骤把角色、对白、选项等写入引擎拥有的状态。
3. 引擎通过 `@quajs/pipeline` 发布渲染投影。
4. 渲染器把投影画到屏幕上，点击时发送用户意图。
5. 引擎接收意图并决定是否继续、跳转或打开界面。

渲染器自己可以维护 DOM 节点、纹理、动画句柄或悬停焦点这类临时细节，但绝不私自保存另一份剧情进度。只有让引擎掌握全部权威状态，存档读档、剧情回放和多平台表现才有统一依据。

## 常用名词

| 名称 | 含义 | 维护位置 |
| --- | --- | --- |
| Scene | 场景生命周期和叙事入口 | Engine / SceneManager |
| GameStep | 对话、动作、选择等可等待步骤 | QuaScript 编译结果 / TypeScript |
| View projection | 当前应当被呈现的只读视图 | Engine / Store |
| Pipeline | 逻辑通知与玩家意图的唯一管线 | `@quajs/pipeline` |
| Renderer | 将投影变成图像、界面和声音 | Web / Cocos / Godot / Native |
| QPK | Quack 构建的资源或运行期内容包 | Quack / QuaAssets |
| RuntimeContentManager | 动态包激活、依赖、卸载和保存检查 | Engine |

## 逻辑舞台与屏幕

横屏预设使用 `1920 × 1080` 的逻辑分辨率，竖屏预设使用 `1080 × 2340`。角色位置、背景偏移和动画轨道都在这套逻辑坐标里创作。渲染器会根据实际容器大小等比缩放并居中显示，屏幕比例不一致时自动留出黑边，不会裁切画面或扭曲作者的构图。

对白、选项等关键互动内容建议放在安全区域内。设备像素比（DPR）、窗口尺寸和系统安全区只影响画面如何投影到屏幕上，不应写回剧情状态。详见[逻辑舞台与屏幕适配](/docs/design/mobile-rendering-adaptation)。

## 选择一个发布目标

每次构建只会激活 Web、Cocos、Godot、Unity、Native 这五套目标核心中的一套。普通功能插件和 Runtime QPK 不能自行塞入其他平台的启动代码。打包后生成的 `target-bundle-manifest.json`，才是启动壳和平台打包器认准的唯一清单。

理清这些基本概念后，再继续阅读[功能插件](/docs/plugins)和[追加章节与 Runtime QPK](/docs/guides/runtime-packages)会顺畅很多。
