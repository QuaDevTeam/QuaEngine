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

渲染器可以持有 DOM 节点、纹理、动画句柄和瞬时焦点，不能私自维护另一份场景进度。这样存档、重放与跨平台输出才有一致的依据。

## 常用名词

| 名称 | 含义 | 维护位置 |
| --- | --- | --- |
| Scene | 场景生命周期和叙事入口 | Engine / SceneManager |
| GameStep | 对话、动作、选择等可等待步骤 | QuaScript 编译结果 / TypeScript |
| View projection | 当前应当被呈现的只读视图 | Engine / Store |
| Pipeline | 逻辑通知与玩家意图的唯一管线 | `@quajs/pipeline` |
| Renderer | 将投影变成图像、界面和声音 | Web / Cocos / Native |
| QPK | Quack 构建的资源或运行期内容包 | Quack / QuaAssets |
| RuntimeContentManager | 动态包激活、依赖、卸载和保存检查 | Engine |

## 逻辑舞台与屏幕

横屏预设使用 `1920 × 1080`，竖屏预设使用 `1080 × 2340`。角色、背景偏移和动画轨道都先在逻辑坐标里创作。渲染器按容器大小等比缩放并居中，比例不一致时出现留边，不裁掉作者构图。

互动内容通常应落在安全区域。设备像素比、窗口大小和系统安全区只影响显示，不应写回剧情状态。详见 [舞台适配设计](/docs/design/mobile-rendering-adaptation)。

## 选择一个发布目标

一次构建只激活 Web、Cocos、Native 中的一套 target core。普通插件和 Runtime QPK 不得自行插入其他平台的启动适配器。生成的 `target-bundle-manifest.json` 才是启动壳与打包器的依据。

理解这些约定后，阅读 [插件概览](/docs/plugins) 和 [运行期内容](/docs/guides/runtime-packages) 会更容易。
