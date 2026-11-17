---
title: "Production builds and artifact checks"
description: "Build Web or macOS Native games, inspect real stages and failures, and distinguish packaging from publication."
order: 11
---

## Open the build dialog

Save open files and stop any running preview, then select File → Production Build (**文件 → 生产打包…**) from the application menu or press `Ctrl/Cmd+Shift+B` (also available in the macOS system menu bar). Choose an enabled project target, review the listed stages, and click Start Build (**开始打包**).

The editor currently supports production builds for Web output directories and macOS Native `.app` bundles. Cocos and Godot have separate CLI toolchains rather than entries in this dialog—see the [platform guides (Chinese)](/docs/platforms). Plugin packages also use their own build workflow.

## Configuration belongs to the project

Game identity, icons, Developer ID signing, and Apple notarization settings belong in `qua.project.*`, not in editor appearance or user preferences. Keep signing certificates and credentials in supported facilities such as Keychain rather than committing them to project files.

See [Quack production configuration (Chinese)](../../../../../packages/build/quack/docs/production-build.md) for the full CLI and configuration reference. The editor runs your project's existing Quack build chain without injecting a second target core or altering game bootstrap.

## Inspect progress and logs

The dialog tracks actual preparation, asset bundling, and target build stages along with bundle counts, completed/skipped/failed statuses, and elapsed times. If Apple notarization is not configured, it explicitly displays as skipped rather than passed.

Closing the dialog leaves the build running in the background, and reopening it restores live progress. Logs stay collapsed by default and expand automatically on failure; syntax highlighting helps scanning, while overall status comes from the build protocol rather than text matching in logs.

Click Cancel (**取消**) if you need to stop a build—simply closing the dialog does not cancel it. Both failures and cancellations keep the logs and your source drafts intact so you can fix the issue and retry.

## Check the artifact

After completion, reveal the output folder and verify that its version, assets, and entry match the build you just ran:

| Output | Minimum checks |
| --- | --- |
| Web | Serve the production directory over HTTP and click through affected dialogue, choices, asset loading, and save/load (dev preview does not test production bundling or CSP) |
| macOS Native | Launch the `.app` bundle directly and check rendering, input, media playback, and save/load across restarts (build logs and GPU readback alone do not confirm visible runtime behavior) |
| Distribution | Independently verify checksums, signing, notarization, hosting headers, and target-system compatibility |

Keep in mind that generating a production build only writes local artifacts—it does not upload a website, publish to a store, create a GitHub release, or release the editor itself. For editor releases and updates, see [Get the editor](/docs/en/editor/downloads).
