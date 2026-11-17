---
title: "Native：Rust、JSC 与 wgpu"
description: "理解原生运行时、UI 编译和当前操作系统验证边界。"
order: 5
---

## 运行时结构

Native 宿主采用 Rust 编写，JavaScript 业务代码运行在 JavaScriptCore（JSC）中，画面则通过 wgpu 渲染。QUI/TSX 与 QSS 为原生端提供了一套完整的 UI 声明和编译管线，而剧情状态依然由 TypeScript 引擎与 store 掌握。

```bash
pnpm dev:native
pnpm native:e2e
```

这两条仓库命令会自动开启 JavaScriptCore 特性。Native 目标原先使用的 QuickJS 路径已经彻底移除，升级宿主后记得重新生成原生 JS、QPK 以及 `target-bundle-manifest.json`。[Godot 目标](/docs/platforms/godot)走的是另一套独立的 GDExtension + QuickJS 宿主，不在这条迁移路径上。

## 平台依赖

| 操作系统 | JavaScriptCore 来源 | 额外准备 |
| --- | --- | --- |
| macOS | 系统自带 JavaScriptCore framework | Rust、Xcode Command Line Tools |
| Linux | JavaScriptCoreGTK（推荐 4.1） | 对应开发头文件包与系统链接器 |
| Windows x64 MSVC | 固定版本的 bun-webkit / otter-jsc-sys | MSVC 工具链与固定依赖下载 |

在 macOS 上以 Hardened Runtime 分发时，记得在签名 entitlements 里允许 JSC JIT。另外，`target-bundle-manifest.json` 中的 `nativeRuntime.jscVersion` 必须和实际签名宿主的 JSC 版本完全匹配。模块解析、执行预算与沙箱边界见 [JavaScriptCore 运行时](/docs/design/native-jsc-runtime)。

## UI 与渲染

更多细节可以参考[Native / Web 渲染一致性检查](/docs/reviews/native-web-render-parity)、[Native UI 创作评审](/docs/reviews/native-ui-authoring)、[Native 文字排版](/docs/design/native-text-layout)以及 [Native UI 编辑扩展](/docs/reference/native-vscode)。目前不支持把任意 Web CSS 属性直接当作 QSS 的现成能力来写，具体支持哪些节点、资源和滤镜效果请按实际实现核对。

## 当前验证边界

2026-09-21 的迁移验证记录涵盖了 macOS 运行时、原生应用启动、动态 QPK 加载以及 Demo E2E 流程，也跑过了 Windows 交叉编译检查；但该记录并不包含 Windows 实际链接与 JIT、Linux 运行以及可见操作系统窗口的完整验收。

GPU 离屏读回、编译通过、真实窗口呈现以及与 Web 的逐像素对比分别对应不同的验证层级，阅读历史数据时请结合[迁移验证报告](/docs/reviews/native-jsc-migration-2026-09-21)里的环境条件。

## 导出给父应用作为原生库

`quack project build --target native --embedded --all` 可以导出 C ABI 1 的动态库与静态库，并附带独立的 Cocoa 父窗口示例。父应用负责管理 Metal 视图、主事件循环与界面导航，独立的 JSC VM 接收 `open` 和 `cancel` 指令并返回业务结果，`close` / `closed` 则表示资源回收完毕。配置方式、文件锁、哈希锁定、签名及输入边界见[Native 父应用集成](/docs/guides/exported-module#native-父应用)。该入口目前仅支持构建 macOS 本机架构（Editor 自带的私有 compositor 预览不走这里），暂不提供 Windows、Linux、移动端 SDK 或 IME 输入法支持。
