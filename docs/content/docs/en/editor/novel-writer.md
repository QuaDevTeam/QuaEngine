---
title: "Novel Writer"
description: "Configure writing providers, plan and review stories with project context, then apply guarded source drafts."
order: 8
---

## Open and configure

Choose Novel Writer in the activity bar to switch the editing area into the writing workspace. Return with Explorer or Ctrl/Cmd+Shift+E; both workspaces retain drafts. In writing, Ctrl/Cmd+S saves the manuscript and Ctrl/Cmd+, opens writing settings.

Configure DeepSeek first and Tavily when external research is needed. Calls require network access and provider quota. Review the project settings/text you intend to send before starting. Novel Writer is an editor tool, not a runtime plugin delivered to players.

## Start from a project or QuaScript

Create a linked writing task with goals, length, constraints, and allowed changes. Existing worldbuilding, characters, and outline remain inputs. Link and Fill Settings (**关联并补齐设定**) can fill missing information without silently replacing existing settings.

Rewrite from QS (**从 QS 改写**) captures the current Monaco buffer/selection, including unsaved text. The task retains file, range, and revision snapshots. Later source changes require recapture or conflict handling.

Stage review and outline checks still apply; supplied settings do not skip later review. Streaming text is provisional. Saved structured results become actionable artifacts.

## Review, regenerate, and write back

Read artifacts, add revision instructions, or regenerate a stage, then inspect manuscript/diff previews. Writeback can create QS, append to the original file, or intelligently replace the original range. Intelligent writeback uses source anchors and variable plans, preserves TypeScript, staging, choices, and story metadata, and checks actual project compiler diagnostics.

Apply validates project identity, buffer, disk revision, and range. The result is an undoable Monaco draft; normal saving updates disk, index, and preview. It does not overwrite game state. New scenes still require project entry wiring.

Passing compilation does not establish motivation, pacing, or every runtime branch. Read the prose and exercise affected choices, jumps, and restores. Offline/mock checks do not prove real-model writing quality.

## Save, resume, and trash

The default data directory is `~/.quaengine/novel-writer`; an application-data override may change it. Append-only JSONL and snapshots support workflow recovery. Hiding the view does not cancel generation. Closing protects dirty manuscripts and running tasks; saved artifacts/checkpoints can be resumed later.

Ordinary deletion moves a task to the application's recoverable trash. Reset explicitly clears generated artifacts/history while preserving base inputs. Do not delete the data directory as a substitute for Reset or Cancel.

## Export

The ZIP contains `README.md`, `project.json`, `manifest.json`, `combined.md`, and Markdown/JSON under `artifacts/`. Export currently includes `approved` and `draft`, excluding `needs_review` and `rejected`. **An exported draft has not necessarily passed review.**

Raw tool events and provider credentials are not exported as archive files, but project metadata, briefs, and prose can contain private content. Inspect the archive before sharing. It is not a complete event-log, credential, or runtime-environment backup.
