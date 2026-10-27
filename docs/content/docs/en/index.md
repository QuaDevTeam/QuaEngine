---
title: "Welcome to QuaEngine"
description: "Create a visual novel with QuaScript and TypeScript, starting with the editor and your first scene."
order: 0
---

QuaEngine is a TypeScript visual novel engine with an Electron editor. Write dialogue and choices in QuaScript, compose audiovisual staging with plugins, and choose a Web, Cocos, Godot, or Native target.

## Start here

| Task | Guide |
| --- | --- |
| Create and run a project | [Quick start](/docs/en/getting-started) |
| Write dialogue, interpolation, and choices | [Your first scene](/docs/en/getting-started/first-story) |
| Compare rendering targets | [Platform guide (Chinese)](/docs/platforms) |
| Explore authoring tools | [Editor guide](/docs/en/editor) |
| Check implementation and platform limits | [Project status (Chinese)](/docs/project/status) |

## Three contracts

**The engine owns story state.** Scenes, dialogue, choices, progress, and audio intent belong to the engine/store. Renderers project that state and send player intents through `@quajs/pipeline`.

**Features are plugins.** Backgrounds, audio, animation, gallery, inventory, and achievements are optional features. Projects enable the capabilities they need.

**Content ships in packages.** Quack builds assets into QPKs. Supported targets can mount incremental content as Runtime QPK Packages, with engine-owned trust checks, dependencies, migrations, and lifecycle.

## Language coverage

The quick start, first-scene tutorial, and Editor handbook are available in English and Chinese. Other creator guides are currently in Chinese; package references retain their source language. Links marked “Chinese” open those original pages. The language selector enables only translations that exist for the current page.

APIs are still evolving. Pin your dependencies and validate reading, branching, and save/load on your own target devices before release.
