---
title: "QuaScript authoring and drafts"
description: "Edit dialogue and staging with Monaco and statement properties, then review diagnostics, undo, and save."
order: 5
---

## Write and check scripts

Start with the complete `.qs` example in [your first scene](/docs/en/getting-started/first-story). Monaco supports highlighting, Ctrl+Space completion, hover help, F12 definitions, Shift+Alt+F formatting, and Ctrl/Cmd+Shift+Space parameter hints. Definitions open editable sources inside the current project.

Speakers have consistent dialogue colors; narration, comments, choices, and TypeScript interpolation retain their syntax colors. Coloring is a reading aid, not character registration or runtime identity.

## Edit statement properties

Open Statement Properties (**语句属性**) from the `.qs` document toolbar. The bottom panel follows the cursor; its selector and previous/next buttons also navigate statements. The current workflow is Monaco plus a separate property panel. The old code/split/visual mode switch has been removed.

Edit dialogue, speakers, literal strings/numbers/booleans, and nested object fields in existing commands. Add background/clear-background, voice, BGM, character entrance/exit, sprite, expression, and position commands using project character/asset candidates.

No background command means inherit earlier state; clearing requires an explicit command. The form describes the current statement rather than reconstructing the full scene's executed state. Use source editing for complex expressions, arrays, and choices. Syntax errors suspend the form until fixed.

## Undo and save

Form inputs update the same undoable Monaco draft; code edits update the form. Ctrl/Cmd+Z undoes changes. Disk and project indexes update after normal saving. Tabs retain drafts; resolve external changes through [saving and conflicts](/docs/en/editor/projects#save-and-resolve-conflicts).

Character and animation tools have an additional Apply to Source step. Applying creates a source draft that must still be saved. Panel-local drafts, Monaco drafts, and disk files are separate layers.

## Diagnostics and navigation

Problems (**问题**) collects indexed `.qs` and project TypeScript configuration, syntax, and type diagnostics with source locations. Open dirty documents have live diagnostics; other files mainly use disk contents.

If the project installs ESLint and declares configuration, TS/JS checking uses that project's parser, rules, and ignores. Without configuration it is skipped. Missing dependencies and invalid configuration are reported; the editor does not run automatic fixes against disk.

Moving files or renaming character/resource IDs does not rewrite story references. Check Problems, then exercise affected choices, jumps, and restores in preview.

## Edit from the running scene

A Web project integrated with the development preview protocol can enable Pick Properties (**拾取属性**) in Scene Debugging (**场景调试**). Pick backgrounds/characters to locate their QS sources. Literal single-line dialogue supports inline editing that creates a normal source draft; interpolated, rich, multiline, or stale sources use source navigation instead.

This is a Web development feature. Saving follows normal reload; it does not mutate renderer-owned game state or provide arbitrary timeline scrubbing/restoration. Continue with [preview and debugging](/docs/en/editor/preview).
