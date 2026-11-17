---
title: "运行示例故事"
description: "在仓库中体验《明天，请再一次呼唤我》，并区分内容演示与平台验证。"
order: 4
---

## 运行 Web 版本

```bash
git clone https://github.com/QuaDevTeam/QuaEngine.git
cd QuaEngine
pnpm install
pnpm exec turbo run build --filter=demo^...
pnpm --filter demo dev
```

《明天，请再一次呼唤我》讲述声音档案员神代凛、录音员 Mara 与一段提前到来的广播。Demo 共用 Web、Cocos、Godot 与 Native 的叙事逻辑、存档、设置和回看基础。

菜单包含继续阅读、从头开始、读档、章节与设置。已读章节可回到章首重新阅读，未读章节的内容不会直接开放。可在源码中检查具体故事分支和引擎接线。

## 使用独立编辑器

```bash
pnpm dev:editor
```

打开仓库中的 `demo` 目录。启动预览后，可以在代码旁阅读故事，并从源文件位置跳到对应步骤。编辑器与 Demo 的详细使用说明见 [工作区](/docs/editor/workbench)。

## 原生入口

```bash
pnpm dev:native
```

需要 Rust 与当前操作系统工具链。原生运行时使用 JavaScriptCore；不同系统的依赖见 [Native 平台](/docs/platforms/native)。

Godot 使用独立的 GDExtension/QuickJS 宿主，从仓库根目录执行 `pnpm --dir demo build:godot` 后再运行 `pnpm --dir demo run:godot`。完整工具链前提、编辑器入口和限制见 [Godot 指南](/docs/platforms/godot)；Creator 工作区见 [Cocos 指南](/docs/platforms/cocos)。

## 验证范围与素材权利

Demo 主要用于展示引擎的内容组织和技术链路，故事和演出本身仍在持续完善中。另外要注意，Web 流程跑通、原生 GPU 读回、真实操作系统窗口展示以及逐帧跨平台对比验证的是不同层面的问题，通过其中一项并不能直接代表其他几项也已经达标。

Demo 里的故事文本、人物设定、图像、音乐、提示词和其他创作素材不适用引擎的代码开源许可。你可以用它们来评估引擎能力，但不能将其拆出作为可自由复用的开源素材包。具体边界见[开源许可与品牌](/docs/project/license)以及 [Demo 源码说明](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/README.md)。
