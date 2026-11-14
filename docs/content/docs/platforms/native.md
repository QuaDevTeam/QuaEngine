---
title: "Native：Rust、JSC 与 wgpu"
description: "理解原生运行时、UI 编译和当前操作系统验证边界。"
order: 5
---

## 运行时结构

原生宿主使用 Rust，应用 JavaScript 在 JavaScriptCore 中执行，画面由 wgpu 投影。QUI / TSX 和 QSS 提供原生 UI 的声明与编译路径。游戏状态仍由 TypeScript 引擎和 store 维护。

```bash
pnpm dev:native
pnpm native:e2e
```

这两个仓库命令选择 JavaScriptCore 功能。Native 目标的旧 QuickJS 运行方式已经移除，升级宿主后应重新生成原生 JS、QPK 和 target manifest。[Godot 目标](/docs/platforms/godot)使用独立的 GDExtension + QuickJS 宿主，不属于这条迁移路径。

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

## 导出为父应用的库

`quack project build --target native --embedded --all` 提供 C ABI 1、动态／静态库与独立 Cocoa 父窗口示例。父应用持有 Metal 视图、事件循环与导航，独立 JSC VM 接收 open／cancel 并返回业务结果；close／closed 表示资源回收。配置 `targets.native.build.embeddedEntry` 与 `cargoManifest`，完整接线、存储锁、hash pin、签名与输入边界见[Native 模块交付](/docs/guides/exported-module#native-父应用)。当前只构建 macOS 本机架构，不声明 Windows／Linux／移动端 SDK 或 IME 完成；Editor 的私有 compositor 预览不参与此入口。
