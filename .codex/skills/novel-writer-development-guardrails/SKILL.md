---
name: novel-writer-development-guardrails
description: Guardrails for developing ai/novel-writer, the SvelteKit multi-agent visual novel writing app. Use with novel-writer when changing its UI, APIs, DeepSeek/ReAct agent runtime, Tavily tools, storage, trash behavior, context management, shadcn-svelte components, or validation.
---

# Novel Writer Development Guardrails

## Scope

- `ai/novel-writer` is a standalone local writing app, not a QuaEngine runtime package.
- Do not import QuaEngine engine, renderer, QPK, QuaScript, or LangChain packages.
- Runtime user data belongs under `~/.quaengine/novel-writer` unless `NOVEL_WRITER_HOME` overrides it.

## Agent Runtime

- Expert agents are ReAct-style, self-driving loops backed by DeepSeek tool calls.
- Each expert agent context is managed independently by `agentId`; do not merge private working context across different specialists.
- Single expert agent maximum runtime is 1 hour. Do not add short completion deadlines for DeepSeek-backed specialists.
- Use a high tool-round ceiling plus a wall-clock deadline to prevent runaway loops.
- When one agent context grows too large, compact that agent's own older assistant/tool history while preserving system instructions, current task input, pinned project canon, approved artifacts, unresolved reviewer findings, and tool reference summaries.
- Tavily search is a tool the agent chooses conditionally. Do not add automatic pre-stage search.
- Do not expose DeepSeek reasoning traces, API keys, or raw private transcripts to the browser.

## Frontend And API

- Keep `src/routes/+page.svelte` as a shell; client state lives in `src/lib/client/workspace-controller.svelte.ts`.
- Keep browser request helpers in `src/lib/client/api.ts`.
- User-initiated requests must have explicit client timeout handling. Ordinary CRUD/file actions should time out quickly enough to keep the UI responsive; agent-triggering actions may wait up to the 1 hour agent budget.
- Every user action success or failure should show a toast via shadcn-svelte Sonner (`src/lib/components/ui/sonner` plus `svelte-sonner`).
- Project export is a user-initiated download. Keep export route handlers thin, package only completed artifacts (`approved` and `draft`) plus manifest/combined Markdown, and keep raw conversations/tool transcripts/API keys out of the archive.
- Trash, restore, permanent delete, and empty trash must update local lists immediately and then resync active/trash lists from the server.
- Confirm-dialog actions should close only after success; failures should keep context visible and show a toast.

## UI Rules

- Use shadcn-svelte registry roots and local wrappers in `src/lib/components/ui/*`.
- Use `lucide-svelte` for action icons; do not introduce a second icon package.
- Keep the UI as a compact writing workspace: no landing page, hero, decorative blobs, or card nesting.
- Avoid inline styles; put reusable classes in `src/lib/styles/*`.

## Storage And Deletion

- Normal project deletion moves the full project directory from `projects/` to `trash/`.
- Disk files are removed only by emptying trash or permanently deleting an item from trash.
- Persist workflow events, tool calls, conversations, artifacts, and snapshots as append-only JSONL/JSON/Markdown before reporting completion.

## Validation

- `pnpm --filter novel-writer typecheck`
- `pnpm --filter novel-writer test -- --run`
- `pnpm --filter novel-writer build`
