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

日常修改时建议用 `--filter` 定位到受影响的包，不必每次都全量重编整个仓库。运行测试时也要区分不同层级的验证范围：mock 单元测试、浏览器实测、GPU 离屏读回与真实物理窗口测试各自解决不同的问题。

升级第三方依赖时请遵循[第三方依赖维护](/docs/project/dependencies)，用 `pnpm deps:report` 一并检查三个独立工作区；涉及平台 SDK 版本变动时，记得同步更新[宿主版本与兼容性](/docs/platforms/compatibility)。

## 架构约定

逻辑与权威状态由 engine 和 store 持有，模块间通信统一走 pipeline；非核心能力通过插件扩展；通用核心不能依赖 DOM、Blob 或平台特定存储；动态内容以 QPK 包形式交付，且每次打包只激活当前所选平台的核心。

动手改动前建议先读一遍仓库根目录的 [AGENTS.md](https://github.com/QuaDevTeam/QuaEngine/blob/main/AGENTS.md) 和对应包的说明文档。如果修改了面向用户的特性，别忘了同步更新对应的 skill 和文档。

## 提交规范

提 Issue 或 PR 时，请说明真实场景遇到的问题、改动后的行为、已执行的验证方式以及尚未覆盖的范围。附上最小复现工程、具体平台与版本信息，切勿把敏感日志或未授权的私有素材提交上来。

IDE 源码采用 MPL-2.0 协议，提交编辑器改动前请阅读其[贡献约定](https://github.com/QuaDevTeam/QuaEngine/blob/main/packages/editor/CONTRIBUTING.md)。如果只是修正文档，直接编辑 `docs/content/` 下的教程源文件或对应包的 README 即可，不要去改 `.generated` 目录。
