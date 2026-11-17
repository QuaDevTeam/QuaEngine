---
title: "QuaEngine Editor"
seoTitle: "QuaEngine Editor handbook"
description: "Create projects, author scripts, inspect previews, and build games in the standalone QuaEngine workspace."
collapsed: true
order: 4
---

QuaEngine Editor is a standalone Electron authoring workspace. You can write QuaScript and TypeScript in Monaco, adjust statement properties, characters, and animations visually, and run your project's Web or Native development preview side by side.

This section is mirrored in both English and Chinese—use the language switcher at the top right to jump between them. Note that the Editor application UI currently uses Chinese labels, so switching documentation language does not translate the app itself; English guides include the matching Chinese UI labels where helpful.

## Start the editor

With Node.js 22.12+ and pnpm 12.3.4 installed, run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm dev:editor
```

See [Get the editor](/docs/en/editor/downloads) for cloning instructions, prerequisites, and release status. Building from source on macOS requires Xcode Command Line Tools and the matching Node-API headers; Native game preview also requires Rust and Cargo.

## Complete an authoring loop

1. [Create or open a project](/docs/en/editor/projects), then check its configuration and dependencies.
2. Edit dialogue and staging in Monaco, using [Statement Properties](/docs/en/editor/authoring) for quick inline adjustments.
3. Prepare character and animation source drafts with the [character browser](/docs/en/editor/character) and [animation editor](/docs/en/editor/animation), then review and save them.
4. [Run and inspect a preview](/docs/en/editor/preview), jump to the cursor's step, and click through the affected choices.
5. Resolve any disk conflicts, save, and generate [production builds](/docs/en/editor/builds). Always verify the final target artifact directly on its platform.

## Find a workflow

| Task | Guide |
| --- | --- |
| Create games or plugins and manage source assets | [Projects and files](/docs/en/editor/projects) |
| Arrange panels, switch themes, and use terminals or Git | [Workspace and tools](/docs/en/editor/workspace) |
| Edit dialogue, decorators, and source drafts | [QuaScript authoring](/docs/en/editor/authoring) |
| Inspect elements, storage, resources, and performance | [Preview and debugging](/docs/en/editor/preview) |
| Plan and rewrite scenes with AI | [Novel Writer](/docs/en/editor/novel-writer) |
| Install, toggle, or publish plugins | [Plugin marketplace](/docs/en/editor/marketplace) |
| Build Web or macOS Native output | [Production builds](/docs/en/editor/builds) |
| Resolve setup, saving, and preview issues | [Troubleshooting](/docs/en/editor/troubleshooting) |
| Integrate the editor runtime or extension services | [Workbench reference](/docs/en/editor/workbench) · [Registry reference](/docs/en/editor/registry) |

## Current boundaries

Embedded preview targets Web and Native. Native layer embedding is currently implemented on macOS only, while Windows and Linux report unsupported rather than falling back to screenshot streaming. Cocos and Godot generate standalone workspaces through the project toolchain instead of appearing in the embedded preview menu.

Engine/store remains the single source of truth for game state. Editor forms and AI writeback only produce source drafts, and preview debugging communicates through the project's development protocol. Keep in mind that preview session storage, source files on disk, and production player saves are separate layers—see [storage and resources](/docs/en/editor/preview#storage-and-resources).
