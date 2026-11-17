---
title: "Get QuaEngine Editor"
description: "Check Editor release availability, run from source, and understand stable/beta updates and platform verification."
order: 2
---

QuaEngine Editor ships on its own release cycle, separate from the engine packages. As of **October 27, 2026**, there are no public Editor releases or prebuilt stable or beta installers yet. Check [GitHub Releases](https://github.com/QuaDevTeam/QuaEngine/releases) for future availability.

## Run from source

You need Node.js 22.12+ and pnpm 12.3.4. On macOS, building from source also requires Xcode Command Line Tools and Node-API headers; Native game preview additionally requires Rust and Cargo.

```bash
git clone https://github.com/QuaDevTeam/QuaEngine.git
cd QuaEngine
pnpm install --frozen-lockfile
pnpm dev:editor
```

This builds the editor, Native preview layer, project templates, and local SDK before launching. Once open, choose File → New Project (**文件 → 新建项目**) to create a project using the bundled SDK archives. Continue with [projects and files](/docs/en/editor/projects) or the [workbench reference](/docs/en/editor/workbench).

## Channels and updates

The editor checks for updates at launch and every six hours, or whenever you select Help → Check for Updates (**帮助 → 检查更新**). After a new build is downloaded and verified, click the update button in the status bar to save your open files and restart to install.

Bundled boilerplate and runtime components update within compatible version ranges for newly created projects, while existing projects keep their pinned dependencies. Network requests honor your system proxy, PAC scripts, and bypass rules. During an update, your user-data directory and a backup of the previous app are preserved; if the new version fails to finish startup, the updater restores the previous version and shows the error reason.

The release workflows are configured with `editor-stable-latest` and `editor-beta-latest` channels. Beta builds use separate app data and update caches so you can test upcoming changes safely. (Note that these workflow definitions exist in CI, and artifacts become downloadable only after a release is actually published.)

| Platform | Configured artifact name |
| --- | --- |
| macOS Apple silicon | `QuaEngine-Editor-<channel>-macos-arm64.tar.gz` |
| Windows x64 | `QuaEngine-Editor-<channel>-windows-x64.tar.gz` |
| Linux x64 | `QuaEngine-Editor-<channel>-linux-x64.tar.gz` |

## After packages are published

Extract the downloaded `.tar.gz` archive: on macOS, move `.app` to Applications and open it; on Windows, run the extracted `.exe`; on Linux, run `quaengine-editor`. Make sure the installation folder is writable if you plan to use automatic updates.

When downloading a release, check the version, checksums, signing status, and platform notes on the Release page. The macOS release workflow requires Developer ID signing and Apple notarization, whereas Windows builds are currently unsigned and automated Windows and Linux platform tests are deferred.

Editor distributions include source-availability notices for MPL-2.0-covered code—keep `LICENSE` and `NOTICE` intact when redistributing. For packaging your own games, see [production builds](/docs/en/editor/builds).
