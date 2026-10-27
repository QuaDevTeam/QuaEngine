---
title: "Get QuaEngine Editor"
description: "Check Editor release availability, run from source, and understand stable/beta updates and platform verification."
order: 2
---

QuaEngine Editor releases independently from engine packages. As checked on **October 27, 2026**, there are no public Editor releases or downloadable stable/beta packages. Check [GitHub Releases](https://github.com/QuaDevTeam/QuaEngine/releases) for subsequent availability.

## Run from source

Use Node.js 22.12+ and pnpm 12.3.4. macOS source builds additionally need Xcode Command Line Tools and Node-API headers; Native game preview also needs Rust/Cargo.

```bash
git clone https://github.com/QuaDevTeam/QuaEngine.git
cd QuaEngine
pnpm install --frozen-lockfile
pnpm dev:editor
```

This builds the editor, Native preview layer, templates, and SDK. Choose File → New Project (**文件 → 新建项目**) to use the bundled SDK archives. Continue with [projects and files](/docs/en/editor/projects) or the [development reference](/docs/en/editor/workbench).

## Channels and updates

The editor checks for updates at startup and every six hours. Help → Check for Updates (**帮助 → 检查更新**) checks manually. After download and verification, use the status-bar update action to save documents and restart for installation.

Bundled boilerplate/runtime components update within compatibility ranges for new projects. Existing projects keep their dependency versions. Requests follow system proxy, PAC, and bypass rules. Updates retain the user-data directory and a previous-version backup; failed startup triggers restoration and a failure message.

The configured release workflow uses `editor-stable-latest` and `editor-beta-latest`. Stable accepts stable editor/components; beta has its own application data and cache. Configured channels do not prove that any artifact has been published.

| Platform | Configured artifact name |
| --- | --- |
| macOS Apple silicon | `QuaEngine-Editor-<channel>-macos-arm64.tar.gz` |
| Windows x64 | `QuaEngine-Editor-<channel>-windows-x64.tar.gz` |
| Linux x64 | `QuaEngine-Editor-<channel>-linux-x64.tar.gz` |

## After packages are published

Extract the `.tar.gz`. On macOS, move the `.app` to Applications and open it; on Windows run the extracted `.exe`; on Linux run `quaengine-editor`. Updating requires a writable installation directory.

Verify version, hashes, signing, and platform notes on the actual Release page. The macOS workflow requires Developer ID signing and Apple notarization, which does not establish that an unpublished artifact is signed/notarized. Windows code signing is not configured; Windows/Linux platform tests are currently deferred.

Editor distributions carry corresponding-source notices for MPL-2.0-covered code. Retain `LICENSE` and `NOTICE` when redistributing. Game production builds are a separate workflow described in [production builds](/docs/en/editor/builds).
