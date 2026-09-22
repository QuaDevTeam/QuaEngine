---
title: "Native：Rust、JSC 与 wgpu"
description: "理解原生运行时、UI 编译和当前操作系统验证边界。"
order: 3
---

## 运行时结构

原生宿主使用 Rust，应用 JavaScript 在 JavaScriptCore 中执行，画面由 wgpu 投影。QUI / TSX 和 QSS 提供原生 UI 的声明与编译路径。游戏状态仍由 TypeScript 引擎和 store 维护。

```bash
pnpm dev:native
pnpm native:e2e
```

这两个仓库命令选择 JavaScriptCore 功能。旧 QuickJS 运行方式已经移除，升级宿主后应重新生成原生 JS、QPK 和 target manifest。

## 平台依赖

| 系统 | JavaScriptCore 来源 | 额外准备 |
| --- | --- | --- |
| macOS | 系统 JavaScriptCore framework | Rust、Xcode Command Line Tools |
| Linux | JavaScriptCoreGTK，优先 4.1 | 对应开发包与系统链接工具 |
| Windows x64 MSVC | 固定版本 bun-webkit / otter-jsc-sys | MSVC 工具链与固定依赖下载 |

发布到 macOS hardened runtime 时需为 JIT 配置签名 entitlement。`nativeRuntime.jscVersion` 必须与签名宿主一致。详细模块解析、执行预算与限制见 [JSC 运行时](/docs/design/native-jsc-runtime)。

## UI 与渲染

阅读 [Native UI 创作评审](/docs/reviews/native-ui-authoring)、[文字排版设计](/docs/design/native-text-layout) 和 [VS Code UI 扩展](/docs/reference/native-vscode)。渲染支持应按实际节点、资源与效果逐项核对，不能把 Web CSS 全部当作 QSS 的现成能力。

## 当前验证边界

2026-09-21 的迁移记录包含 macOS 运行时、原生应用、动态 QPK 与 Demo E2E 验证，也记录了 Windows 交叉目标检查。但该记录没有证明 Windows 实际链接/JIT、Linux 运行和可见 OS 窗口的完整验收。

GPU 读回、平台编译、OS 窗口呈现与 Web/native 逐像素比较分别回答不同问题。请完整阅读 [迁移验证报告](/docs/reviews/native-jsc-migration-2026-09-21) 中的环境与证据限制。
