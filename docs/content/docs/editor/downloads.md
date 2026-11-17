---
title: "获取 QuaEngine Editor"
description: "查看编辑器发行状态，从源码启动，并了解稳定版和测试版的发布方式。"
order: 2
---

QuaEngine Editor 与引擎各包采用独立发版节奏。截至 **2026-10-27**，仓库尚无公开 Editor Release，目前还没有现成的稳定版或测试版安装包可供下载。后续发行动态可关注 [GitHub Releases](https://github.com/QuaDevTeam/QuaEngine/releases)。

## 当前从源码启动

准备好 Node.js 22.12+ 和 pnpm 12.3.4；在 macOS 上从源码构建还需要安装 Xcode Command Line Tools 以及 Node-API 头文件，运行 Native 游戏预览另需 Rust 和 Cargo。在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev:editor
```

如果还没拉取代码，可以先按[快速开始](/docs/getting-started)克隆仓库。`pnpm dev:editor` 会先构建编辑器、Native 预览嵌入层、项目模板与 SDK；打开后在「文件 → 新建项目」里就能直接使用内置的 SDK 压缩包创建项目。更多内部机制见[工作区开发参考](/docs/editor/workbench)。

## 发布频道与自动更新

编辑器在启动时以及每隔 6 小时会自动检查一次更新，也可以随时在「帮助 → 检查更新」里手动触发。新版下载并校验完哈希后，点击状态栏的更新按钮即可保存未存文档并重启安装。内置模板和 runtime 会在兼容范围内随更新同步，供新建项目使用，已有项目则会继续沿用锁定的依赖版本。

所有网络请求都会优先遵循系统的代理配置、PAC 自动代理脚本和绕过规则。更新过程中会保留原来的用户数据目录和旧版备份；万一新版启动没能在规定时间内完成自检，会自动回滚到旧版并提示失败原因。

已配置的发布工作流包含 `editor-stable-latest`（稳定版）与 `editor-beta-latest`（测试版）两个频道：测试频道拥有独立的应用数据和更新缓存，方便提前体验新特性。（工作流配置好并不代表安装包已经上线，具体以 GitHub Releases 页面的实际产物为准。）

| 平台 | 规划的安装包命名格式 |
| --- | --- |
| macOS Apple Silicon | `QuaEngine-Editor-<channel>-macos-arm64.tar.gz` |
| Windows x64 | `QuaEngine-Editor-<channel>-windows-x64.tar.gz` |
| Linux x64 | `QuaEngine-Editor-<channel>-linux-x64.tar.gz` |

## 拿到安装包后的安装方式

下载 `.tar.gz` 并解压后：macOS 将 `.app` 拖入应用程序目录打开；Windows 直接运行解压目录中的 `.exe`；Linux 运行目录内的 `quaengine-editor`。如果想启用自动更新，请确保应用所在目录具备写入权限。

正式下载前请务必在 Release 页面核对版本号、文件哈希、代码签名与平台说明。在配置好的 CI 流程里，macOS 发布要求完成 Developer ID 签名与 Apple 公证；Windows 目前尚未配置代码签名，且 Windows/Linux 平台的自动化测试现阶段暂未启用。

编辑器安装包会随附 MPL-2.0 覆盖源码的获取说明，二次分发时请保留包内的 `LICENSE` 与 `NOTICE` 文件。
