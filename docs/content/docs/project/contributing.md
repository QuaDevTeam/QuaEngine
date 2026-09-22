---
title: "参与共建"
description: "从可复现的问题和聚焦的改动开始，保持文档与实现一致。"
order: 2
---

## 从源码工作

```bash
git clone https://github.com/QuaDevTeam/QuaEngine.git
cd QuaEngine
pnpm install
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run lint
```

日常修改优先使用相关包的 filter，避免每次重建整个仓库。运行测试时保留真实验证范围：mock、生产浏览器、GPU 读回和物理窗口并不是同一层级。

## 架构约定

逻辑与状态由 engine/store 持有，通信经过 pipeline。非核心能力通过插件提供。通用核心不依赖 DOM、Blob 或平台存储。动态内容使用 QPK，打包只激活当前平台核心。

开始修改前阅读仓库 [AGENTS.md](https://github.com/QuaDevTeam/QuaEngine/blob/main/AGENTS.md) 与相关包说明。新增用户功能要同步维护对应 skill 与文档。

## 提交内容

说明真实问题、改动后的行为、验证方式和仍未验证的部分。附最小复现、具体平台和版本，避免把敏感日志或私有素材放进 issue。

IDE 源码采用 MPL-2.0；提交前阅读其 [贡献约定](https://github.com/QuaDevTeam/QuaEngine/blob/main/packages/editor/CONTRIBUTING.md)。文档修正可以直接修改教程源文件或对应包 README，不编辑生成输出。
