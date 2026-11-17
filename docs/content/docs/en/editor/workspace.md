---
title: "Workspace, settings, and tools"
description: "Arrange fixed navigation and docked views, configure appearance, and use search, terminals, and Git."
order: 4
---

## Navigation and docking

Explorer, Search, Source Control, and Story Outline live in a fixed left sidebar switched from the activity bar. They cannot be dragged, split, or merged, though you can resize the sidebar using its divider, arrow keys, or a double-click reset.

Code tabs, preview panes, statement properties, and tool panels are freely dockable. Drag a tab to the center of a group to merge it, or toward an edge to split—right-click or `Shift+F10` gives you the same options. Closing a panel simply hides it; reopen any view from the titlebar layout icon's View (**视图**) picker by searching its name, English ID, or category. Resetting the layout keeps all open drafts and running plugin instances intact.

## Settings and appearance

Press `Ctrl/Cmd+,` or click the gear icon in the lower-left corner to open Settings. You can search by keyword, browse by category, filter modified settings, and reset individual options or everything at once.

| Category | Common settings |
| --- | --- |
| Appearance | Qua or Graphite theme, system, light, or dark mode |
| Code editor | Font, size, line height, indentation, wrap, line numbers, minimap, format on save |
| Terminal | Font size, scrollback lines, cursor blink |
| Workspace | Density, reduced motion, restore layout on next launch |

Settings are stored in your editor profile. Changing appearance updates the workbench, Monaco, terminal, and official plugin panels, while leaving your game visuals and Novel Writer's theme untouched. Layout restoration does not resurrect old shell processes or replace crash recovery for unsaved buffers.

## Project search

`Ctrl/Cmd+Shift+F` searches saved files across the project with case sensitivity, whole-word matching, Rust regex, and comma-separated include/exclude globs (such as `**/*.qs, **/*.ts`). Unsaved drafts are not included. Narrow your globs if you hit result, file-size, or timeout limits.

Story Outline lets you jump straight to indexed scenes and story nodes in source—it is a navigation view and does not create branch targets or alter game progression.

## Integrated terminal

Press ``Ctrl+` `` to toggle the terminal, or ``Ctrl+Shift+` `` to start a new session. Shells open in the current project root (or your home directory when no project is open). You can switch between sessions, clear output, or terminate processes.

While the terminal is focused, keys like `Ctrl+C` go directly to the shell. Copy and paste use `Command+C/V` on macOS and `Ctrl+Shift+C/V` elsewhere. Switching projects or closing the editor terminates managed sessions and child processes, though detached daemons stay outside that cleanup. Sessions and output do not persist across restarts, and the terminal runs with your normal user permissions rather than a directory sandbox.

## Git changes and branches

Source Control groups merge conflicts, staged changes, and working tree changes with tree or list views, read-only diffs, and inline stage/unstage controls. Click the commit button beside the message box (or press `Ctrl/Cmd+Enter`) to commit staged changes—save your files first, since Git diffs only inspect files on disk.

Switching branches offers Save All, Keep Drafts, or Cancel. Normal `git switch` rules determine whether uncommitted disk changes carry over cleanly; if you keep drafts and the target branch modifies the same file, you will be asked to resolve the save conflict afterward. Automatic stash, force checkout, push, and pull are not built in—use the integrated terminal for those workflows.

## Common shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+P` | Quick open |
| `Ctrl/Cmd+Shift+E` / `Ctrl/Cmd+Shift+F` | Explorer / project search |
| `Ctrl/Cmd+S` / `Ctrl/Cmd+Shift+S` | Save current / save all |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Switch document tabs |
| `Ctrl/Cmd+J` | Toggle bottom panel |
| `Ctrl/Cmd+Shift+P` or `F1` | Monaco command palette |
| `F5` / `Shift+F5` | Run or restart / stop preview |
| `F10` | Advance one step |
| `Ctrl/Cmd+Alt+Enter` | Seek preview from source cursor |
| `Ctrl/Cmd+Shift+B` | Open production build |

Active focus, terminal capture, and IME composition can affect which shortcuts trigger. Hover over controls to see their exact shortcut tooltips. Continue with [preview and debugging](/docs/en/editor/preview).
