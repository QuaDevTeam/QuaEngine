---
title: "QuaScript authoring and drafts"
description: "Edit dialogue and staging with Monaco and statement properties, then review diagnostics, undo, and save."
order: 5
---

## Write and check scripts

Start from the complete `.qs` example in [your first scene](/docs/en/getting-started/first-story). Monaco provides syntax highlighting, `Ctrl+Space` completions, hover docs, `F12` go-to-definition, `Shift+Alt+F` formatting, and `Ctrl/Cmd+Shift+Space` parameter hints. Go-to-definition opens editable source files inside the current project.

Speakers receive consistent dialogue colors, while narration, comments, choices, and TypeScript interpolation keep their syntax colors. Coloring is purely a reading aid and does not register characters or affect runtime identity.

## Edit statement properties

Open Statement Properties (**语句属性**) from the `.qs` document toolbar. The bottom panel follows your cursor, and you can also step through statements with its selector and previous/next buttons. The current workflow pairs Monaco with this standalone property panel (the legacy code/split/visual mode switch has been removed).

Use the form to edit dialogue text, speakers, literal strings, numbers, booleans, and nested object fields on existing commands, or add background, clear-background, voice, BGM, character entrance/exit, sprite, expression, and position commands using project candidates.

Omitting a background command inherits the previous state; clearing requires an explicit clear-background command. Keep in mind that the form describes only the current statement rather than simulating the accumulated scene state up to that line. Drop back into source editing for complex expressions, arrays, and choices. If the file has syntax errors, the form pauses until you fix them.

## Undo and save

Every edit in the form updates the same undoable Monaco draft, and code edits flow back into the form automatically. `Ctrl/Cmd+Z` undoes changes, while disk files and project indexes update only after normal saving. Tabs keep their drafts across switches; handle external disk edits through [saving and conflicts](/docs/en/editor/projects#save-and-resolve-conflicts).

Character and animation tools include an extra Apply to Source step that turns panel edits into a source draft, which still needs to be saved afterward. Panel-local drafts, Monaco drafts, and saved files on disk are distinct layers.

## Diagnostics and navigation

Problems (**问题**) gathers configuration, syntax, and type diagnostics from indexed `.qs` files and your project's TypeScript config with clickable source locations. Dirty open tabs get live diagnostics, whereas unopened files are checked from disk.

If your project installs and configures ESLint, TS/JS checking runs using your project's own parser, rules, and ignore patterns (if unconfigured, ESLint is skipped; missing dependencies or broken configs are reported). The editor never runs auto-fix writes behind your back.

Moving files or renaming character or asset IDs does not automatically rewrite story references. Review the Problems panel afterward and click through affected choices, jumps, and save restores in preview.

## Edit from the running scene

In a Web project wired to the development preview protocol, enable Pick Properties (**拾取属性**) inside Scene Debugging (**场景调试**). Clicking a background or character jumps to its QuaScript source line, and clicking plain single-line dialogue lets you edit the text inline to produce a normal source draft. Interpolated, rich, multiline, or stale lines fall back to opening the source location instead.

This feature is limited to Web development previews and updates on normal save/reload—it never mutates renderer-owned game state directly or lets you scrub the story like a video timeline. Continue with [preview and debugging](/docs/en/editor/preview).
