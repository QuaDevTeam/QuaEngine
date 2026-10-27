---
title: "Quick start"
description: "Run the editor from source, create a Vue and QuaScript project with its bundled SDK, and preview your story."
order: 1
---

## Prerequisites

Use **Node.js 22.12+** and **pnpm 12.3.4**. On macOS, building the editor also requires Xcode Command Line Tools and Node-API headers; the build reports the installation command for the required Electron headers when missing. Native/Godot game targets additionally require Rust/Cargo.

## Run the editor

As of **October 27, 2026**, `create-qua-game` is not published on npm and there are no public Editor releases. Start from a source checkout:

```bash
git clone https://github.com/QuaDevTeam/QuaEngine.git
cd QuaEngine
pnpm install --frozen-lockfile
pnpm dev:editor
```

This builds the editor, preview dependencies, templates, and SDK before opening the workspace. Choose **File → New Project** (the current editor UI uses Chinese labels: **文件 → 新建项目**), select the Vue / QuaScript game template, and enter the parent directory and project name.

The default `visual-novel-vue` template includes the engine, Vue renderer, script compiler, development assets, and build configuration. SDK archives are copied to `vendor/quajs` and used as local dependencies, so the project can move outside this repository. Installing third-party dependencies still needs registry access.

## Preview your project

Open the new project in the editor and start its Web preview. Follow the dependency installation prompts. Alternatively, run these commands from the new project's directory:

```bash
pnpm install
pnpm run project:validate
pnpm run project:doctor
pnpm dev
```

Open the address printed in the terminal. Advance the sample dialogue and check that the story continues.

## Find the source files

| File | Purpose |
| --- | --- |
| `src/game/scenes/opening.qs` | Your first scene |
| `src/game/bootstrap.ts` | Engine, plugins, initial scene, and renderer wiring |
| `qua.project.yaml` | Game identity, icons, and targets |
| `assets/` | Backgrounds, sprites, audio, and other source assets |
| `src/game/styles.css` | Your game's visual styles |
| `vite.config.ts` | Script, asset, and Web build integration |

## Build the game

```bash
pnpm typecheck
pnpm run assets:build
pnpm build
```

Replace the template's QuaEngine placeholder icons with artwork you have permission to distribute, then check the paths in `qua.project.yaml`.

Continue with [your first scene](/docs/en/getting-started/first-story). The [editor workbench reference](/docs/en/editor/workbench) covers the complete setup and preview workflow.
