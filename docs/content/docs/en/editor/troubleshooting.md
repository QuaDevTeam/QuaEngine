---
title: "Editor troubleshooting"
description: "Diagnose setup, dependency, save, preview, plugin, and packaging failures with reproducible evidence."
order: 12
---

## Source startup fails

Run `pnpm install --frozen-lockfile` followed by `pnpm dev:editor` from the repository root so editor dependencies, templates, and the local SDK build cleanly before launch. Launching a stale `dist` folder does not reflect current source.

Verify that Node.js is 22.12+ and pnpm is 12.3.4. On macOS, native embedding build errors usually point to missing Xcode Command Line Tools or the Electron Node-API headers named in the compiler output; running Native game previews also requires Rust/Cargo and system linkers.

## Installation or downloads stall

Check the installation log for the tool name, URL, HTTP status, and first error, then verify your system proxy/PAC settings, network connection, and free disk space. Managed runtimes live inside editor user data and do not overwrite global Node or Rust installs. Cancel and retry if needed, and avoid deleting project folders or writing data to work around network hiccups.

## A file cannot be saved

Look for disk conflicts, external file deletion, moved paths, or permission issues. Keep your unsaved text, run Compare Differences, and explicitly choose Load Disk Version or Keep Local and Save rather than overwriting files externally to bypass revision checks. Automatic crash-draft recovery and three-way merges are not built in yet, so save often and commit important changes to Git.

## Preview fails or seeks incorrectly

| Symptom | Check |
| --- | --- |
| Cannot start | Project manifest, `dev:web`/`dev` or `dev:native` script, installed dependencies, and the first runtime error |
| Native unsupported | Native embedding is macOS-only; Windows and Linux do not fall back to image streaming |
| To Cursor unavailable | `.qs` compile errors, cursor position, `editor-core/runtime` wiring, and registered script factories |
| Wrong variables or earlier state | Seeking replays the current file from its development baseline rather than inferring choices from earlier chapters |
| Reload returns to the start | The active step was deleted or changed too much to match, or the file was not yet seeked |
| Silent audio | Preview mute toggle, in-game volume, browser user-activation click, asset loading, and `AudioContext` state |
| Saves disappear on stop | Temporary Web preview partitions and the Native Demo's in-memory backend clear when the session stops |

## Character or animation changes do not appear

Character recognition relies on the saved static project index, so dynamically registered characters or complex runtime factories may not be indexed. Also note that renaming character or asset IDs does not automatically rewrite story references.

For animations, click Apply to Source (**应用到源文件**) and then save normally. If there is no static `@PlayAnimation` call for that animation, select a scene manually; choices encountered during seeking must be clicked in the preview. Visual drafts stay in the panel while you resolve any source revision conflicts.

## Plugins, writing, and builds

For plugins, verify installed dependencies, devtools enablement, Registry status, and runtime wiring in your game entry (installing a package only adds it to `node_modules`). For Novel Writer, check provider settings, quota, and stage status; review generated text carefully, and remember that exported drafts are not automatically approved.

For production builds, inspect the first failed stage and expanded logs; closing the dialog does not cancel the build, and skipped notarization is not a pass. Always test the generated output directly as described in [production builds](/docs/en/editor/builds).

## Report a problem

Include your source commit or Editor version, OS and CPU architecture, preview target, reproduction steps, the first error message, and a minimal project if possible. Strip API keys, private paths, and sensitive story content from logs, configs, and screenshots, and mention whether the issue happened in development preview, a production build, or a standalone app.
