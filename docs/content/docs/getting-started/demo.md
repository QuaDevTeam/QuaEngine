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
pnpm --filter demo dev
```

《明天，请再一次呼唤我》讲述声音档案员神代凛、录音员 Mara 与一段提前到来的广播。Demo 共用 Web 与 Native 的叙事逻辑、存档、设置和回看基础。

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

## 验证范围与素材权利

Demo 是引擎的内部内容与技术演示，故事和演出仍在迭代。通过 Web 流程测试、原生 GPU 读回、操作系统窗口展示和逐帧跨平台对比，是不同层次的证据；其中一项通过并不自动代表其他项完成。

Demo 的故事、人物、图像、音乐、提示词和其他创作素材不采用引擎开源许可。可以按其许可评估引擎，不能把这些内容当作可复用素材包。参阅 [许可说明](/docs/project/license) 和 [Demo 源码说明](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/README.md)。
