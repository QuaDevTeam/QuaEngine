---
title: "QuaEngine Editor"
seoTitle: "QuaEngine Editor handbook"
description: "Create projects, author scripts, inspect previews, and build games in the standalone QuaEngine workspace."
collapsed: true
order: 4
---

QuaEngine Editor is a standalone Electron authoring workspace. Write QuaScript / TypeScript in Monaco, edit statement properties, characters, and animations, then run your project's Web or Native development entry.

This section has matching English and Chinese documentation. Use the language selector to switch pages. The current Editor application primarily uses Chinese labels; translated documentation does not change the application's language. English instructions include the relevant Chinese labels where needed.

## Start the editor

Use Node.js 22.12+ and pnpm 12.3.4, then run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm dev:editor
```

See [Get the editor](/docs/en/editor/downloads) for cloning, prerequisites, and release availability. A macOS source build needs Xcode Command Line Tools and the appropriate Node-API headers; Native game preview additionally needs Rust/Cargo.

## Complete an authoring loop

1. [Create or open a project](/docs/en/editor/projects), then check its configuration and dependencies.
2. Edit in Monaco and use [statement properties](/docs/en/editor/authoring) for dialogue and staging commands.
3. Prepare source drafts with the [character browser](/docs/en/editor/character) and [animation editor](/docs/en/editor/animation), then review and save them.
4. [Run and inspect a preview](/docs/en/editor/preview), locate the cursor's step, and exercise affected choices.
5. Resolve disk conflicts, save, and [build production output](/docs/en/editor/builds). Validate the actual target artifact separately.

## Find a workflow

| Task | Guide |
| --- | --- |
| Create games/plugins and manage source assets | [Projects and files](/docs/en/editor/projects) |
| Arrange panels, change themes, use terminals and Git | [Workspace and tools](/docs/en/editor/workspace) |
| Edit dialogue, decorators, and source drafts | [QuaScript authoring](/docs/en/editor/authoring) |
| Inspect elements, storage, resources, and performance | [Preview and debugging](/docs/en/editor/preview) |
| Plan and rewrite with AI | [Novel Writer](/docs/en/editor/novel-writer) |
| Install, enable, or publish plugins | [Plugin marketplace](/docs/en/editor/marketplace) |
| Build Web or macOS Native output | [Production builds](/docs/en/editor/builds) |
| Resolve setup, saving, and preview problems | [Troubleshooting](/docs/en/editor/troubleshooting) |
| Integrate the editor runtime or extension services | [Workbench reference](/docs/en/editor/workbench) · [Registry reference](/docs/en/editor/registry) |

## Current boundaries

Embedded previews target Web and Native. Native layer embedding is currently implemented on macOS only; Windows/Linux do not fall back to screenshot transport. Cocos/Godot use independent workspace generation through the project's toolchain, rather than additional embedded preview options.

Engine/store remains authoritative for game state. Forms and AI writeback create source drafts; preview tools use the project's development protocol. Preview storage, source files, and production saves are different layers; see [storage and resources](/docs/en/editor/preview#storage-and-resources).
