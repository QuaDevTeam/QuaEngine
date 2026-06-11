---
name: novel-writer
description: Use, review, or modify the standalone SvelteKit multi-agent visual novel writing app in ai/novel-writer. Covers DeepSeek, Tavily search, JSONL resume, local sandbox tools, shadcn-svelte UI, and visual-novel text output.
---

# Novel Writer

## Responsibility

- `ai/novel-writer` is a standalone local AI writing application, not a QuaEngine runtime package.
- It orchestrates multiple DeepSeek-backed agents for visual novel style prose.
- It stores projects, config, JSONL transcripts, artifacts, and snapshots under `~/.quaengine/novel-writer`.

## Boundaries

- Do not generate QuaScript or `.qs` files.
- Do not import QuaEngine engine, renderer, QPK, or script compiler packages.
- Do not use LangChain.
- Do not expose API keys or DeepSeek reasoning traces in client payloads or logs.

## Core Systems

- DeepSeek adapter: `deepseek-v4-pro`, thinking enabled, explicit reasoning effort, tool-call transcript handling.
- Tavily adapter: `tavily_search` tool with normalized references.
- Tavily search is agent-initiated only. Do not add automatic pre-stage searches; agent prompts should tell experts to search only when external factual grounding is materially needed.
- Storage: append-only JSONL plus JSON/Markdown artifacts.
- Realtime: `/api/projects/:projectId/events` is the single SSE stream for workflow status and generated-content preview messages. Workflow events must be persisted to JSONL before broadcasting. Streamed model content is preview-only until the final JSON response is parsed, normalized, written as an artifact, and followed by the normal workflow event.
- Export: completed project content can be downloaded as a ZIP package. Include only finished artifacts (`approved` and `draft`) in Markdown and JSON forms plus a manifest/combined Markdown; exclude `needs_review`, `rejected`, raw conversations, tool transcripts, and secrets.
- Deletion: normal project deletion must move the full project directory from `projects/` to `trash/`; disk files are removed only when the user empties trash or permanently deletes an item from trash.
- Reset: resetting an existing project is destructive but must not delete or trash the project record. It clears generated artifacts, conversations, workflow events, and snapshots; preserves title, brief, mode, max revision loops, and advanced seed input; requires a destructive confirmation dialog; is blocked while the project is running; and restarts the workflow from the beginning after the reset succeeds.
- Sandbox: route command execution through `SandboxProvider`.
- UI: SvelteKit plus shadcn-svelte registry components, with local compatibility wrappers only when they delegate to registry roots.
- Project seeds: optional user-provided worldbuilding, characters, outline, and per-section advanced-input modification instructions are stored on `NovelProject.seed`, passed to every agent as pinned project basis, and preserved ahead of generated artifacts during context compaction. Use `seed.worldbuildingModificationInstructions`, `seed.charactersModificationInstructions`, and `seed.outlineModificationInstructions` to refine the matching supplied advanced input before generation. `seed.allowExpertChanges` controls whether experts may make additional seed changes; default/false means immutable canon beyond explicit user modification instructions.
- Project seeds never skip stages. Requirements confirmation, worldbuilding, characters, story background, outline, outline review, scene writing, editing, supervision, and final compaction remain distinct artifacts.
- YOLO mode should continue past pending review artifacts by accepting the current checkpoint and then running the remaining DAG, while outline review remains a gating loop.
- Outline review may request missing supporting/side character definitions. When its findings indicate character coverage gaps, the revision loop must return to character design, then character review, story background, story background review, and outline before re-running outline review.
- Regenerate should be a true single-stage rerun. The replaced artifact is marked `rejected`, reviewer notes are passed as regeneration feedback, and the new artifact becomes the awaiting-review checkpoint without requiring another run click.

## Engineering Structure

- Also use `novel-writer-development-guardrails` for implementation changes; it owns the detailed UI/API/ReAct runtime guardrails.
- Follow `ai/novel-writer/docs/architecture.md` for the current directory structure and intended server split.
- Keep `src/routes/+page.svelte` as a route shell, not a state-heavy page implementation.
- Keep page/client state in `src/lib/client/workspace-controller.svelte.ts`.
- Keep derived labels, status descriptors, timeline builders, and other pure UI helpers in `src/lib/client/workspace.ts`.
- Keep feature components under `src/lib/components/workspace`; split tab panels and nested panes into subfolders such as `workspace/inspector`.
- Prefer feature-sized Svelte components and split files once route logic, artifact viewing, review controls, Markdown preview, logs, references, or chat panels grow independently.
- Avoid inline styles in Svelte components; add reusable class names in `src/lib/styles/*`.

## Validation

- `pnpm --filter novel-writer typecheck`
- `pnpm --filter novel-writer test -- --run`
- `pnpm --filter novel-writer build`

## Review Checklist

- Does every user-visible artifact have JSON and Markdown forms?
- Are API keys redacted and written with restricted permissions?
- Are search references preserved in artifact metadata?
- Does resume rebuild workflow state from JSONL/snapshots?
- Does the SSE stream replay workflow events with `after=<lastEventId>`, keep status/content messages ordered, and avoid exposing secrets or reasoning traces?
- Does the UI stay a compact writing workspace without card nesting or marketing layout?
- Does the UI expose the workflow timeline and make outline plus outline review artifacts easy to open?
- Are project seeds preserved through workflow runs, resume, and context compaction?
- If seed changes are not allowed, do review/supervision agents treat seed immutability violations as blockers?
- Does regenerate actually rerun the selected stage and update the checkpoint to the new artifact?
- Does project export include all completed artifacts in JSON and Markdown without pending/rejected drafts or private transcripts?
- Does project reset require confirmation, preserve editable project input, clear generated/runtime data, and restart from `requirements` without leaving stale events or artifacts visible?
