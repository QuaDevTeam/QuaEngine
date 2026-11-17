---
title: "Novel Writer"
description: "Configure writing providers, plan and review stories with project context, then apply guarded source drafts."
order: 8
---

## Open and configure

Select Novel Writer in the activity bar to switch the editor area into the writing workspace. Click Explorer or press `Ctrl/Cmd+Shift+E` to return to the script workspace; both workspaces keep their unsaved drafts intact. Inside Novel Writer, `Ctrl/Cmd+S` saves the manuscript and `Ctrl/Cmd+,` opens writing settings.

Configure DeepSeek first, and add Tavily when you need external research. Model requests require network access and provider quota, so review the project notes and text you intend to send before starting a run. Novel Writer is strictly an editor tool—it is never bundled into your game as a runtime plugin.

## Start from a project or QuaScript

Create a project-linked writing task with your goals, target length, constraints, and allowed edits. Existing worldbuilding, character profiles, and outlines remain intact as context; Link and Fill Settings (**关联并补齐设定**) can fill in missing background details without silently overwriting what you already wrote.

Rewrite from QS (**从 QS 改写**) captures the current Monaco buffer or selection, including unsaved edits, along with file, range, and revision snapshots. If the underlying `.qs` file changes before you write back, the editor asks you to recapture or resolve the conflict.

Stage reviews and outline checks still run even when project settings are already supplied. Streaming output during generation is provisional; only saved structured results become actionable artifacts.

## Review, regenerate, and write back

Read through the generated artifacts, add revision notes or regenerate individual stages, and inspect the manuscript and diff previews. Writeback can create a new `.qs` file, append to the original file, or intelligently replace the captured range—using source anchors and variable plans to preserve TypeScript blocks, staging commands, choices, and story metadata while checking actual compiler diagnostics.

Applying validates the project identity, editor buffer, disk revision, and target range. The output lands as an undoable Monaco draft and updates disk, indexes, and previews only when you save normally (it never mutates live game state). New scene files still need to be wired into your project's story entry.

Keep in mind that clean compilation checks syntax, not narrative pacing, character motivation, or runtime branch logic—always read the generated prose and play through affected choices, jumps, and save restores.

## Save, resume, and trash

By default, writing data lives in `~/.quaengine/novel-writer` (or the configured application data directory), using append-only JSONL logs and snapshots for recovery. Hiding the writing view does not cancel active generation, and closing the editor protects dirty manuscripts and running tasks so saved artifacts and checkpoints can be resumed next time.

Normal deletion moves a task into the app's recoverable trash, whereas Reset explicitly clears generated artifacts and history while keeping your base inputs. Do not delete the data directory manually as a substitute for Reset or Cancel.

## Export

Exported ZIP archives include `README.md`, `project.json`, `manifest.json`, `combined.md`, and Markdown/JSON files under `artifacts/`. Exports include `approved` and `draft` items while excluding `needs_review` and `rejected`. **Remember that an exported `draft` item has not necessarily passed review.**

Raw tool call logs and provider API keys are never exported into the archive, though project metadata, briefs, and story prose may contain sensitive material—inspect the ZIP before sharing it, and do not treat it as a full event-log, credential, or environment backup.
