---
title: "Editor troubleshooting"
description: "Diagnose setup, dependency, save, preview, plugin, and packaging failures with reproducible evidence."
order: 12
---

## Source startup fails

Run `pnpm install --frozen-lockfile` and `pnpm dev:editor` from the repository root. The latter builds editor dependencies, templates, and SDK before launch. Opening an old `dist` does not validate current source.

Check Node.js 22.12+ and pnpm 12.3.4. On macOS, native embedding build errors need Command Line Tools and the Electron Node-API headers named in the error. Running Native games additionally needs Rust/Cargo and system linking tools.

## Installation or downloads stall

Inspect the tool, URL, status code, and first error in installation logs. Check system proxy/PAC, network, and free disk space. Managed runtimes live in editor user data without replacing global Node/Rust. Cancel and retry when appropriate; do not delete projects or writing data to fix network failures.

## A file cannot be saved

Check disk conflicts, deletion, path replacement, and permissions. Preserve unsaved text, compare differences, then explicitly load disk or save the local draft. Do not bypass revision checks with external overwrites. General crash-draft recovery and automatic three-way merge are not currently provided; save important work and use version control.

## Preview fails or seeks incorrectly

| Symptom | Check |
| --- | --- |
| Cannot start | Project manifest, `dev:web`/`dev` or `dev:native` script, dependencies, and first runtime error |
| Native unsupported | Embedding is macOS-only; Windows/Linux have no image-transport fallback |
| To Cursor unavailable | `.qs` errors, cursor source, `editor-core/runtime` integration, and registered script factories |
| Wrong variables/earlier state | Seeking replays the target file from its development baseline, rather than inferring previous chapters' choices |
| Reload returns to the start | Step deleted/unmatched, or file not previously located; restoration has a bounded scope |
| Silent audio | Preview mute, game volume, browser activation, asset loading, and AudioContext state |
| Saves disappear on stop | Temporary Web partition or Native Demo's memory backend |

## Character/animation changes do not appear

Character recognition uses the saved static project index. Dynamic registration or arbitrary runtime factories may not be resolvable. Renaming character/resource IDs does not rewrite story references.

For animation, Apply to Source (**应用到源文件**) and then save. Without a static `@PlayAnimation` call, select a scene manually. Unresolved choices require real player selection. Retain local visual drafts while resolving source revisions.

## Plugins, writing, and builds

Check installed dependencies, enablement, Registry reasons, and runtime entries for plugins. Successful installation does not prove runtime integration. For writing, inspect provider settings, quota, and stage state; generated content needs human review, and an exported draft is not automatically approved.

For builds, inspect the first failed stage and logs. Closing the dialog does not cancel, and skipped notarization is not success. Inspect the actual output as described in [production builds](/docs/en/editor/builds).

## Report a problem

Record source/Editor version, OS/architecture, preview target, reproduction steps, first error, and a minimal project. Remove credentials, private paths, and sensitive story content from logs/configuration/screenshots. Identify whether evidence comes from development preview, production output, or a standalone app.
