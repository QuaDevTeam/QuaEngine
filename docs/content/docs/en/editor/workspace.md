---
title: "Workspace, settings, and tools"
description: "Arrange fixed navigation and docked views, configure appearance, and use search, terminals, and Git."
order: 4
---

## Navigation and docking

Explorer, Search, Source Control, and Story Outline form a fixed left sidebar, selected through the activity bar. They cannot be dragged, split, or merged. Resize the sidebar with its divider, arrow keys, or double-click reset.

Code, preview, statement properties, and tool panels are dockable. Drop a tab in the center of a group to merge or at an edge to split. Right-click or Shift+F10 offers equivalent operations. Closing a view hides it; reopen it through the titlebar layout icon's View (**视图**) picker, searching by name, English ID, or category. Resetting layout preserves document drafts and feature instances.

## Settings and appearance

Ctrl/Cmd+, or the lower-left gear opens Settings. Search by category, filter modified values, reset one item, or reset all.

| Category | Common settings |
| --- | --- |
| Appearance | Qua / Graphite, system / light / dark |
| Code editor | Font, size, line height, indentation, wrap, line numbers, minimap, format on save |
| Terminal | Font size, scrollback, cursor blink |
| Workspace | Density, reduced motion, restore layout at next startup |

Settings live in the current editor profile. Themes update the workbench, Monaco, terminal, and official plugins while the game and Novel Writer keep their own appearance. Restoring layout does not restart old shell processes or recover every unsaved document after a crash.

## Project search

Ctrl/Cmd+Shift+F searches saved project text with case, whole-word, Rust regex, and include/exclude globs. Separate globs with commas, for example `**/*.qs, **/*.ts`. Unsaved drafts are excluded. Narrow the search when result, file-size, or time limits are reached.

Story Outline navigates indexed scenes and story nodes. It does not create branch destinations or change game progress.

## Integrated terminal

Ctrl+backtick shows/hides the terminal; Ctrl+Shift+backtick creates a session. A new shell starts in the project, or the home directory without a project. Switch sessions, clear the display, or terminate a process.

While focused, Ctrl+C and similar keys go to the shell. Copy/paste uses Command+C/V on macOS and Ctrl+Shift+C/V elsewhere. Project replacement and shutdown terminate managed sessions and their children; detached daemons are outside that guarantee. Sessions/output do not survive editor restart. The terminal runs with your privileges and is not a project-directory sandbox.

## Git changes and branches

Source Control groups conflicts, staged changes, and worktree changes. Use tree/list views, read-only diffs, and stage/unstage controls. The commit button next to the message, or Ctrl/Cmd+Enter, commits staged content. Save first: Git diffs do not include unsaved editor drafts.

Branch switching offers Save All, Keep Drafts, or Cancel. Normal `git switch` decides whether disk changes can be preserved. Keeping a draft can still produce a later save conflict if the destination branch changes that file. Automatic stash, force switch, push, and pull are not provided; use the terminal under your project's workflow.

## Common shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+P | Quick open |
| Ctrl/Cmd+Shift+E / Ctrl/Cmd+Shift+F | Explorer / project search |
| Ctrl/Cmd+S / Ctrl/Cmd+Shift+S | Save current / all |
| Ctrl+Tab / Ctrl+Shift+Tab | Switch document tabs |
| Ctrl/Cmd+J | Toggle bottom panel |
| Ctrl/Cmd+Shift+P or F1 | Monaco command palette |
| F5 / Shift+F5 | Run or restart / stop preview |
| F10 | Advance one step |
| Ctrl/Cmd+Alt+Enter | Seek from the source cursor |
| Ctrl/Cmd+Shift+B | Open production build |

Focus, terminal input, and IME composition affect shortcuts. Hover controls for their actions. Continue with [preview and debugging](/docs/en/editor/preview).
