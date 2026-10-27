---
title: "Production builds and artifact checks"
description: "Build Web or macOS Native games, inspect real stages and failures, and distinguish packaging from publication."
order: 11
---

## Open the build dialog

Save and stop preview, then choose File → Production Build (**文件 → 生产打包…**) in the application menu, or press Ctrl/Cmd+Shift+B. The macOS system menu exposes the same command. Select an available project target, inspect the steps, and choose Start Build (**开始打包**).

The editor currently builds a Web production directory or a macOS Native `.app`. Cocos/Godot engine support does not imply additional targets in this dialog; use their [platform toolchains (Chinese)](/docs/platforms). Plugin packages use their separate build workflow.

## Configuration belongs to the project

Game identity, icons, Developer ID signing, and Apple notarization belong in `qua.project.*`, rather than editor appearance/user settings. Keep credentials in supported facilities such as Keychain, outside project source.

See [Quack production configuration (Chinese)](../../../../../packages/build/quack/docs/production-build.md) for the complete CLI/configuration contract. The editor runs the existing project build chain without assembling another target core or changing game bootstrap.

## Inspect progress and logs

The dialog reports actual preparation, asset packaging, and target stages, bundle counts, completed/skipped/failed status, and durations. Unconfigured Apple notarization explicitly reports skipped, which is not notarization success.

Closing the dialog lets the build continue; reopening preserves progress. Logs default to collapsed and open on failure. Highlighting aids reading, while completion comes from the build protocol rather than success words in logs.

Use Cancel (**取消**) to stop a build. Failures/cancellation preserve logs and source drafts; fix the cause before retrying. Closing the dialog is not cancellation.

## Check the artifact

Reveal the output after completion and confirm its version, resources, and entry belong to this build:

| Output | Minimum checks |
| --- | --- |
| Web | Serve the production directory over HTTP; exercise affected dialogue, choices, asset loading, and save/load. Development preview does not validate production resource packaging |
| macOS Native | Launch the actual `.app`; inspect rendering, input, media, save/restart. Logs or GPU readback alone do not prove visible runtime acceptance |
| Distribution | Separately verify hashes, signing, notarization, hosting/distribution settings, and target-system behavior |

Building a game does not upload a website, publish a store listing/GitHub release, or release the editor itself. Editor stable/beta distribution and updates are described in [Get the editor](/docs/en/editor/downloads).
