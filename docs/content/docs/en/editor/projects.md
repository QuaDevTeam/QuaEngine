---
title: "Projects, files, and assets"
description: "Create portable game or plugin projects, manage source assets, and resolve saving conflicts."
order: 3
---

## Create or open a project

Choose File → New Project (**文件 → 新建项目**), pick a parent folder and project name, and select a Vue / QuaScript game or plugin template. The editor creates a fresh subdirectory without overwriting existing folders. Source files, configuration, README, and local SDK archives in `vendor/quajs` are copied into the project so it stays portable outside the QuaEngine repository.

To open an existing game, select a folder containing `package.json` and `qua.project.yaml`, `.yml`, or `.json`. To publish a plugin, you can open a package directory that declares `quajs.extension` directly without needing a game manifest. Plugin projects run their own build workflow and do not display a game preview pane.

## Prepare the environment

When you open a project or start a preview, the workbench checks Node.js, npm or pnpm, project dependencies, and any required Rust toolchain. Missing tools are downloaded into `runtimes` inside the editor profile directory, with progress, logs, cancellation, and retry controls in the UI—your global shell configuration is left untouched.

System SDKs and linkers still need to be installed on the OS. On macOS, source builds require Command Line Tools and the matching Electron Node-API headers. Installing third-party packages requires network access and follows the editor's system proxy settings.

## Find and edit files

| File | Typical purpose |
| --- | --- |
| `src/game/scenes/*.qs` | Story dialogue and staging |
| `src/game/bootstrap.ts` | Engine, plugin, and renderer wiring |
| `qua.project.*` | Project identity, icons, and build targets |
| `assets/` | Backgrounds, sprites, fonts, and audio |
| `*.animation.json` | Numeric animation source |

Press `Ctrl/Cmd+P` to fuzzy-open files by path, with optional `:line:column` navigation. Explorer supports creating, renaming, cutting, copying, pasting, and moving files to the system trash. Renaming or moving a file preserves open drafts and undo history, though it does not automatically rewrite script imports or asset paths—check the Problems panel afterward.

Copying reads the saved file from disk. Deleting asks for confirmation while keeping any unsaved editor buffers intact. Filesystem-level undo and a Save As recovery flow for deleted files are not currently provided.

## Import and inspect assets

In Assets Browser, pick a target folder and click Import (**导入**) to copy media, fonts, or packages (All Assets / **全部资源** maps to the project root). Existing filenames are skipped rather than overwritten. You can filter by name, path, or type, sort by name, size, or modified time, and switch between grid and list views.

For images, you can inspect format, original pixel dimensions, file size, and alpha transparency; audio and video files play directly inside the browser. Fonts and QPK/ZIP archives currently show file metadata only rather than font glyph previews or archive contents. Keep in mind that importing assets into folders does not replace Quack asset builds or automatically add references to your scripts.

## Save and resolve conflicts

`Ctrl/Cmd+S` saves the active document, and `Ctrl/Cmd+Shift+S` saves all modified documents. Source drafts produced by statement properties, character tools, animation tools, and AI writeback all go through this same save flow.

When a file changes on disk outside the editor, clean tabs update automatically while dirty tabs keep your draft and warn about a conflict. Use Compare Differences (**比较差异**) to inspect the changes, adjust your draft, and click Keep Local and Save (**保留本地并保存**) to write it out—saving rechecks the disk version first so newer external edits are not silently overwritten. If you prefer to discard local edits, Load Disk Version (**载入磁盘版本**) prompts for confirmation before reloading.

Starting a preview, seeking from source, and running production builds all save open files first and abort if saving fails. Project indexing and full-text search primarily read saved disk files, so live diagnostics in an unsaved tab do not mean search results have updated yet.

## Project indexing

The file watcher batches rapid changes before refreshing files, characters, assets, story nodes, and diagnostics. Traversal is bounded by file count, depth, and directory limits, and skips symlinks, hidden folders, dependencies, and generated directories. Narrow your project layout or click Refresh Project (**刷新项目**) if you hit a limit. Inspection errors never discard open drafts.

Continue with [QuaScript authoring](/docs/en/editor/authoring).
