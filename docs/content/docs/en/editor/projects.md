---
title: "Projects, files, and assets"
description: "Create portable game or plugin projects, manage source assets, and resolve saving conflicts."
order: 3
---

## Create or open a project

Choose File → New Project (**文件 → 新建项目**), enter a parent directory and name, and select a Vue / QuaScript game or plugin template. The editor creates a new child directory without overwriting an existing one. Source, configuration, README, and SDK archives in `vendor/quajs` travel with the project outside the QuaEngine checkout.

For an existing game, open the directory containing `package.json` and `qua.project.yaml`, `.yml`, or `.json`. For plugin publication, open a package declaring `quajs.extension` directly; it needs no fabricated game manifest. Plugin projects use their build workflow and do not show game preview.

## Prepare the environment

Opening a project or starting preview checks Node.js, npm/pnpm, project dependencies, and the required Rust toolchain. Missing tools download into `runtimes` under the editor profile. The UI shows progress, logs, cancellation, and retry without changing global shell configuration.

System SDKs and linkers still need system installation. macOS source builds need Command Line Tools and the correct Electron Node-API headers. Third-party dependencies need network access; package-manager requests follow the editor's system proxy configuration.

## Find and edit files

| File | Typical purpose |
| --- | --- |
| `src/game/scenes/*.qs` | Story and staging |
| `src/game/bootstrap.ts` | Engine, plugins, and renderer wiring |
| `qua.project.*` | Project identity, icons, and build targets |
| `assets/` | Backgrounds, sprites, fonts, and audio |
| `*.animation.json` | Numeric animation source |

Ctrl/Cmd+P opens files by fuzzy path, including `:line:column`. Explorer supports creation, rename, cut/copy/paste, and deletion to the system trash. Rename/move retains open drafts and undo history but does not rewrite imports or asset references; check Problems afterward.

Copies read saved disk contents. Deletion asks for confirmation and retains dirty buffers. Filesystem undo and a Save As recovery flow for deleted files are not currently provided.

## Import and inspect assets

In Assets Browser, choose a folder and Import (**导入**) to copy media, fonts, or packages. All Assets (**全部资源**) corresponds to the project root. Existing names are skipped rather than overwritten. Filter by name/path/type, sort by name/size/modification time, and use grid or list view.

Inspect image format, original dimensions, size, and transparency, or play audio/video locally. Fonts and QPK/ZIP files currently expose file information rather than font layout or package contents. Import does not replace Quack asset builds or create story references automatically.

## Save and resolve conflicts

Ctrl/Cmd+S saves the current document; Ctrl/Cmd+Shift+S saves all. Source drafts from statement, character, animation, and AI tools use the same save lifecycle.

External changes update clean documents automatically. Dirty documents retain their drafts and report conflicts. Compare Differences (**比较差异**), reconcile the draft, then Keep Local and Save (**保留本地并保存**). Saving rechecks the compared disk version and rejects newer external changes. Load Disk Version (**载入磁盘版本**) asks before discarding a draft.

Preview start, source seeking, and production builds save first and stop if saving fails. Indexing and full-text search mainly read disk; live diagnostics on an unsaved document do not mean search results have updated.

## Project indexing

File watching coalesces changes before refreshing files, characters, assets, story nodes, and diagnostics. File counts, depth, and directory traversal are bounded; symlinks, hidden folders, dependencies, and generated directories are not ordinary source trees. Narrow the project when limits are reached, or use Refresh Project (**刷新项目**). Inspection failures preserve open drafts.

Continue with [QuaScript authoring](/docs/en/editor/authoring).
