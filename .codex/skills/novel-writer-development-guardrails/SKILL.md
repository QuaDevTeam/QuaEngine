---
name: novel-writer-development-guardrails
description: Guardrails for developing packages/editor/novel-writer, the SvelteKit multi-agent visual novel writing app. Use with novel-writer when changing its UI, APIs, DeepSeek/ReAct agent runtime, Tavily tools, storage, trash behavior, context management, shadcn-svelte components, or validation.
---

# Novel Writer Development Guardrails

## Scope

- `packages/editor/novel-writer` is the built-in `@quajs/editor-novel-writer` plugin with a local writing service, not a QuaEngine runtime package.
- Do not import engine/renderer/QPK runtimes or LangChain. Static QS authoring belongs in `editor/` and reuses script-compiler; server agents still produce prose.
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

- `pnpm --filter @quajs/editor-novel-writer typecheck`
- `pnpm --filter @quajs/editor-novel-writer test -- --run`
- `pnpm --filter @quajs/editor-novel-writer build`
- Preserve the post-build JavaScript syntax check over the final adapter-node output. Desktop startup errors should distinguish syntax, missing-module and permission failures without forwarding raw exceptions, manuscripts or secrets to the renderer.

## Electron integration

- The complete app now lives in `packages/editor/novel-writer`; do not restore a second source copy under `ai/`. `pnpm dev:editor` builds it through the workspace dependency. The obsolete root `dev:novel-writer` entry is removed; package-local `dev` is a loopback development harness.
- The editor activity bar opens the entire writing workspace in a sandboxed WebContentsView, in a movable dock view alongside source, preview and tools. Switching retains its page/controller, manuscript edits, dialogs and SSE connection. Keep agent workflow independent of engine/renderer/QPK runtime; static source tooling stays in the plugin adapter.
- Production SvelteKit `build/handler.js` runs in one lazy Electron utility process via `desktop/server.mjs`. It binds a random loopback port with a per-process bearer credential inserted only by its isolated Electron session. The writing preload exposes dirty state, commands, project context, QS capture/convert/apply and project-change subscription only, never the full EditorBridge. The browser development harness binds loopback.
- Storage stays in `~/.quaengine/novel-writer` (or `NOVEL_WRITER_HOME`). Editor new-project drafts are stored as bounded, validated, atomic JSON because the loopback origin changes between launches; serialize/debounce client writes. API keys remain server-only. Never move or delete user projects during source migration.
- `+page.svelte` uses Svelte 5 runes so template props observe the class controller's rune fields; do not revert the shell to constant-prop legacy compilation. Create the controller once from the initial SSR data; SSE and actions own subsequent updates.
- Hidden writing pages stop Chromium painting but retain generation and SSE. Editor close checks both unsaved writer edits and live backend jobs. Service shutdown aborts provider requests, waits for workflow error/checkpoint persistence, and stops sandbox commands. On restart, an interrupted persisted running project becomes resumable; never automatically restart paid generation.
- `node packages/editor/electron/scripts/novel-writer-smoke.mjs` exercises the actual Electron service with temporary storage and offline fallback generation: workspace switch, drafts, CRUD, review progression, ZIP export, trash/restore, narrow preload, auth, compact layout and shutdown. It does not prove live DeepSeek/Tavily model quality. Keep provider/protocol tests separate.

## Project writing plugin and QS editing

- Package identity is `@quajs/editor-novel-writer`, built into the editor as `qua.novel-writer`. `editor/index.ts` contributes its workspace; `editor/host.ts` owns activation, the lazy authenticated utility service, isolated page and teardown through `EditorHostPlugins`. Keep service, preload, authoring adapter and UI contribution in this package. There is no second app under `ai/` and no root standalone launch command.
- `editor/project.ts` consumes the existing project worker snapshot and compiler-derived Story Tree. Read bounded, indexed setting documents first, then the static character catalog, then bounded QS dialogue evidence. Preserve source paths, parse warnings and truncation notices. A source tree does not prove runtime execution order; excerpts are evidence for the existing worldbuilding/character stages, not invented canon.
- New editor-created writing projects record canonical `editorRoot` and seed missing fields from current project context. Explicit “关联并补齐设定” links existing unbound projects and fills only missing inputs; existing user seeds and non-rejected setting artifacts take precedence. Rebinding another root is rejected, and context attachment never starts paid generation.
- `EditorWritingBridge` exposes context, current Monaco buffer/selection capture, prose conversion, guarded application and project-change notification. No filesystem, shell, arbitrary IPC, dynamic project evaluation or full EditorBridge is exposed to the writer.
- `editor/source.ts` reuses the shared compiler parser and UTF-16 ranges. Conversion treats narration separately and encodes structural/interpolated text as JSON string expressions. Never execute model-generated code. New/append mode creates plain narrative steps; game wiring remains source-owned.
- Intelligent rewrite maps each paragraph to a captured source anchor, supports count/speaker changes, and restores original runtime expressions through validated spans. Preserve executable source, decorated anchors and occupied logic zones. See the intelligent QS writeback section below; application remains a guarded Monaco edit.
- Application checks current project, original buffer, disk revision and document bounds. Changed buffers or disk revisions require recapture; existing new-file paths and project escapes are rejected. All text changes enter Monaco as undoable drafts and use normal conflict-aware save. Never overwrite source directly from a model artifact.
- Project switching invalidates captured source context, retains the writing page/prose and blocks stale-root writes. Integration text participates in the existing close dirty guard. Keep setting and manuscript material out of process logs.
- Validate plugin tests/typecheck/build and editor core/UI/Electron checks. `node packages/editor/electron/scripts/writing-project-smoke.mjs` uses temporary projects and isolated writer storage to exercise Story Tree/settings extraction, canon preservation, real source capture, QS preview/new/rewrite/save, collisions, traversal, disk conflicts and project switching. Existing `novel-writer-smoke.mjs` still covers service/auth/workflow lifecycle. These offline checks do not establish live DeepSeek or Tavily quality.

- Return native keyboard focus to the workbench when hiding the writing view. Forward only writer-local save/settings/undo/redo commands; project/global commands stay with the workbench. In Electron tests, focus Monaco via its editing surface: its hidden readonly IME textarea is not the modern EditContext input target.

## Intelligent QS writeback

- Writing experts produce prose; the dedicated server-side QS adapter produces a validated anchor/variable plan. Reuse DeepSeek configuration and shutdown cancellation; never send credentials/reasoning to the browser or accept arbitrary generated executable code.
- See `editor/adaptation.ts` for exact source-range reconstruction and structural invariants. Count/speaker changes are supported through ordered mappings, preserving decorated anchors, control-flow zones and dynamic expression evaluation. Compiler feedback may request a repaired mapping; no failed/partial plan may reach Monaco.
- Source associations live separately in `editor-source.json`, with selected-range and revision snapshots. Preserve them through task reload and repeated save/edit cycles; changing root/source invalidates application. Do not put full source snapshots into project-list responses or expert context.
- Exercise the actual Electron pipeline with a local fake provider. This proves integration and conflict handling, not real-model mapping quality or semantic equivalence.

## Writing integration UI

- Context documents must not reuse the manuscript dialogue layout: render headings, nested lists and paragraphs as escaped text, preserving character descriptions. Remove redundant dialog descriptions and use tab underline/subtle keyboard focus fill instead of rectangular outline rings.
- Keep writing and QS code model/effort selections independent under the existing server credential configuration. Adaptation selects `codeModel`/`codeReasoningEffort`; experts keep `deepSeekModel`/`defaultReasoningEffort`. Migrate missing code choices from existing writing settings, preserve keys on omitted/blank update fields, and test actual request routing and reload persistence.
- Keep desktop inspector containers as flex columns and let center empty states grow into the remaining scroll area. Never replace them with fixed-height placeholders. Icon-button width, height and minimum dimensions must share `--nw-icon-button-size`; verify actual square hit areas and full-height empty states in regular and compact Electron windows.
- Project integration is a production writing flow, not a permanent debug panel. Keep the main workspace directly below the compact app toolbar; do not put source text, absolute paths, settings dumps or a matrix of conversion buttons above it.
- The toolbar exposes project context and “从 QS 改写”; each artifact offers “写入项目”. Keep session drafts accessible through “继续稿件”. `client/editor-writing.svelte.ts` owns source binding, async guards, draft, preview and apply state; dialog components only project it.
- Use the focused `EditorIntegration` dialog for manuscript and change-preview tabs. Keep update/append/create in one labeled mode control, show project-relative source paths, and ask for a path only for new files. One primary action advances from preview to application. Editing text, destination or mode invalidates the preview; never apply a different draft from the one reviewed.
- `WritingDiff` shows real added/removed lines and source line numbers; bound expensive alignment and DOM rows, mark truncation explicitly, and offer the complete resulting source. Existing compiler/revision guards still own application; the visual diff is not an execution authority.
- Project outline/background/characters live in a separate context dialog with keyboard-accessible tabs. Closing either dialog keeps the session draft; Escape and focus behavior use the repository's native dialog pattern. Use existing shadcn controls and lucide icons, restrained theme tokens and stable independently scrolling content.
- Validate the real Electron flows at compact window sizes: no permanent integration panel or horizontal overflow, modal bounds/footer visibility, keyboard tabs, Escape/reopen draft retention, direct artifact handoff, diff preview and guarded apply. Inspect screenshots in `.codex-tmp/editor-writing-project/`; mock-provider checks do not establish live model quality.

## Integration review regression gates

- Preserve the pairing of manuscript, source snapshot and task across task/root switches. Delayed reads must never replace another task or its event stream; preserve inactive artifact and integration drafts in the dirty guard.
- JSON snapshots use atomic replacement; JSONL reads/appends are serialized. Track planner requests and review writes alongside workflow jobs for close, shutdown and conflicting task operations.
- Chapter regeneration retains chapter identity; revision invalidates dependent checkpoints without erasing unrelated chapter progress. Input revision must use the same chapter loop as normal generation before marking completion.
- Run the isolated Electron smokes with delayed task reads, independent drafts, source restoration, guarded QS application, provider routing, and artifact draft switching. These tests use a local mock provider or offline fallback, not real DeepSeek/Tavily.

The writer view now participates in editor docking. Resize/move keeps its WebContents/controller and drafts. Hide native bounds while the workbench is dragging/resizing or displaying a modal; route writer-local menu commands only when its WebContents has focus. Keep the Svelte app isolated from the editor Lit component tree.
