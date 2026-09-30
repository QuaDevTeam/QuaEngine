---
title: "下载 QuaEngine Editor"
description: "获取独立构建的 QuaEngine Editor 稳定版或测试版。"
order: 2
---

QuaEngine Editor 与引擎包独立发版。选择一个频道，从对应的 GitHub Release 获取安装包。

编辑器启动后及每六小时自动检查更新，也可从「帮助 → 检查更新」手动检查。新版下载并校验完成后，点击状态栏的更新按钮保存文档并重启安装。内置 boilerplate 与 runtime 在兼容范围内更新，供新建项目使用；已有项目保留自己的依赖版本。

网络请求优先遵守系统代理、自动代理配置（PAC）和绕过规则。更新会保留原用户目录与旧版备份；新版启动未完成时自动恢复旧版，并提示失败原因。

## 稳定版

稳定版适合日常创作与团队协作。它只接受稳定编辑器版本和兼容的组件更新。

- [打开稳定版 Release](https://github.com/QuaDevTeam/QuaEngine/releases/tag/editor-stable-latest)
- [macOS Apple 芯片（arm64）](https://github.com/QuaDevTeam/QuaEngine/releases/download/editor-stable-latest/QuaEngine-Editor-stable-macos-arm64.tar.gz)
- [Windows（x64）](https://github.com/QuaDevTeam/QuaEngine/releases/download/editor-stable-latest/QuaEngine-Editor-stable-windows-x64.tar.gz)
- [Linux（x64）](https://github.com/QuaDevTeam/QuaEngine/releases/download/editor-stable-latest/QuaEngine-Editor-stable-linux-x64.tar.gz)

## 测试版

测试版用于提前验证编辑器功能。它与稳定版使用独立的发布频道、应用数据和更新缓存，项目文件仍遵循同一套兼容性契约。

- [打开测试版 Release](https://github.com/QuaDevTeam/QuaEngine/releases/tag/editor-beta-latest)
- [macOS Apple 芯片（arm64）](https://github.com/QuaDevTeam/QuaEngine/releases/download/editor-beta-latest/QuaEngine-Editor-beta-macos-arm64.tar.gz)
- [Windows（x64）](https://github.com/QuaDevTeam/QuaEngine/releases/download/editor-beta-latest/QuaEngine-Editor-beta-windows-x64.tar.gz)
- [Linux（x64）](https://github.com/QuaDevTeam/QuaEngine/releases/download/editor-beta-latest/QuaEngine-Editor-beta-linux-x64.tar.gz)

## 安装

解压下载的 `.tar.gz` 文件。macOS 将 `.app` 移到应用目录后打开；Windows 运行解压目录内的 `.exe`；Linux 运行目录内的 `quaengine-editor`。自动更新需要应用所在目录可写。

下载链接在对应频道首次发布后可用。请在 Release 页面确认版本、签名与平台说明；macOS 发行包由 GitHub Actions 完成 Developer ID 签名与 Apple 公证；Windows 当前未配置代码签名，Windows/Linux 的平台测试暂未启用。

编辑器发行物包含 MPL-2.0 覆盖的源码对应声明；重新分发时请保留安装包中的 `LICENSE` 与 `NOTICE`。
