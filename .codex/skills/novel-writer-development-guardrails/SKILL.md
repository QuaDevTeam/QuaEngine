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
- DeepSeek streaming may send assistant content deltas for live preview, but must not stream reasoning traces. Treat streamed content as provisional; only the complete parsed JSON result may become an artifact.
- Advanced seed fields, including worldbuilding, character notes, outline seeds, and per-section advanced-input modification instructions, do not skip workflow stages. Process them through the worldbuilding, character, story-background, outline, and review agents in order.
- Outline review can trigger a character coverage loop. If review findings indicate missing supporting/side characters needed by the outline, rerun character design, character review, story background, story background review, and outline before re-reviewing the outline.

## Frontend And API

- Keep `src/routes/+page.svelte` as a shell; client state lives in `src/lib/client/workspace-controller.svelte.ts`.
- Keep browser request helpers in `src/lib/client/api.ts`.
- User-initiated requests must have explicit client timeout handling. Ordinary CRUD/file actions should time out quickly enough to keep the UI responsive; agent-triggering actions may wait up to the 1 hour agent budget.
- Every user action success or failure should show a toast via shadcn-svelte Sonner (`src/lib/components/ui/sonner` plus `svelte-sonner`).
- Project export is a user-initiated download. Keep export route handlers thin, package only completed artifacts (`approved` and `draft`) plus manifest/combined Markdown, and keep raw conversations/tool transcripts/API keys out of the archive.
- Trash, restore, permanent delete, and empty trash must update local lists immediately and then resync active/trash lists from the server.
- Project reset must be blocked while the project is running, require a destructive confirm dialog, clear generated/runtime data only, preserve editable input and seed fields, restart through the normal workflow entrypoint, and update the selected project, artifacts, events, and SSE subscription without showing stale data.
- Confirm-dialog actions should close only after success; failures should keep context visible and show a toast.
- Realtime status and generated-content preview should use the SSE stream at `/api/projects/:projectId/events` with `after=<lastEventId>` replay for workflow events. Persist workflow events before broadcasting them; do not add a separate WebSocket path unless explicitly requested again.
- SSE content deltas should update the live preview as soon as they arrive, even if the persisted project status is briefly stale. Workflow events that carry an `artifactId` should refresh project detail and open that newly written artifact instead of leaving the viewer on an older selected artifact.
- Approval actions must write artifact, checkpoint, and project status before broadcasting `approval.recorded`. Approval HTTP responses should include fresh project detail (`project`, `artifacts`, and `events`) so the UI updates immediately even if SSE replay or refresh timing races.
- Approving a review artifact through the HTTP approval endpoint should continue the normal workflow immediately by starting the next step in the project's current mode. When a project is awaiting review, the header step action should become an approve action, and generation actions should be disabled while a stage is running.
- Local workflow debugging may log non-secret identifiers such as project id, run id, stage, artifact id, and action in development or when `NOVEL_WRITER_DEBUG=1`; never log API keys, raw prompts, reasoning traces, or full manuscript content.

## UI Rules

- Use shadcn-svelte registry roots and local wrappers in `src/lib/components/ui/*`.
- Use `lucide-svelte` for action icons; do not introduce a second icon package.
- Keep the UI as a compact writing workspace: no landing page, hero, decorative blobs, or card nesting.
- Avoid inline styles; put reusable classes in `src/lib/styles/*`.

## Storage And Deletion

- Normal project deletion moves the full project directory from `projects/` to `trash/`.
- Disk files are removed only by emptying trash or permanently deleting an item from trash.
- Resetting a project deletes only runtime/generated subdata (`artifacts`, `conversations`, `events.jsonl`, `snapshots`) and rewrites the active `project.json`; it must not move the project into trash or remove the user's title, brief, mode, max revision loops, or advanced input seed.
- Persist workflow events, tool calls, conversations, artifacts, and snapshots as append-only JSONL/JSON/Markdown before reporting completion.

## Validation

- `pnpm --filter novel-writer typecheck`
- `pnpm --filter novel-writer test -- --run`
- `pnpm --filter novel-writer build`
