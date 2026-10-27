---
title: "获取 QuaEngine Editor"
description: "查看编辑器发行状态，从源码启动，并了解稳定版和测试版的发布方式。"
order: 2
---

QuaEngine Editor 与引擎包独立发版。截至 **2026-10-27**，仓库尚无公开 Editor Release，当前没有可下载的稳定版或测试版安装包。可在 [GitHub Releases](https://github.com/QuaDevTeam/QuaEngine/releases) 查看后续发行状态。

## 当前从源码启动

准备 Node.js 22.12+、pnpm 12.3.4；macOS 源码构建另需 Xcode Command Line Tools 和 Node-API 头文件。运行 Native 游戏预览另需 Rust/Cargo。从仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev:editor
```

还未获取仓库时，先按[快速开始](/docs/getting-started)克隆源码。此命令构建编辑器、Native 预览层、模板与 SDK；新项目通过“文件 → 新建项目”使用附带的 SDK 压缩包。完整开发说明见[工作区手册](/docs/editor/workbench)。

## 发布频道与更新

编辑器启动后及每六小时自动检查更新，也可从「帮助 → 检查更新」手动检查。新版下载并校验完成后，点击状态栏的更新按钮保存文档并重启安装。内置 boilerplate 与 runtime 在兼容范围内更新，供新建项目使用；已有项目保留自己的依赖版本。

网络请求优先遵守系统代理、自动代理配置（PAC）和绕过规则。更新会保留原用户目录与旧版备份；新版启动未完成时自动恢复旧版，并提示失败原因。

已配置的发布流程使用 `editor-stable-latest` 与 `editor-beta-latest` 两个频道标签。稳定频道只接受稳定编辑器和兼容组件；测试频道用于提前验证功能，使用独立的应用数据和更新缓存。频道配置本身不代表安装包已经发布。

| 平台 | 已配置的安装包命名 |
| --- | --- |
| macOS Apple 芯片 | `QuaEngine-Editor-<channel>-macos-arm64.tar.gz` |
| Windows x64 | `QuaEngine-Editor-<channel>-windows-x64.tar.gz` |
| Linux x64 | `QuaEngine-Editor-<channel>-linux-x64.tar.gz` |

## 安装包发布后

解压下载的 `.tar.gz` 文件。macOS 将 `.app` 移到应用目录后打开；Windows 运行解压目录内的 `.exe`；Linux 运行目录内的 `quaengine-editor`。自动更新需要应用所在目录可写。

请在实际 Release 页面确认版本、哈希、签名与平台说明。macOS 发布工作流要求 Developer ID 签名与 Apple 公证；未发布的构建不能据此声称已经签名或公证。Windows 当前未配置代码签名，Windows/Linux 的平台测试暂未启用。

编辑器发行物包含 MPL-2.0 覆盖的源码对应声明；重新分发时请保留安装包中的 `LICENSE` 与 `NOTICE`。
