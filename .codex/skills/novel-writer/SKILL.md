---
name: novel-writer
description: Use, review, or modify the editor-integrated SvelteKit multi-agent visual novel writing app in packages/editor/novel-writer. Covers DeepSeek, Tavily search, JSONL resume, local sandbox tools, shadcn-svelte UI, and visual-novel text output.
---

# Novel Writer

## Responsibility

- `packages/editor/novel-writer` is the editor-integrated local AI writing application, not a QuaEngine runtime package.
- It orchestrates multiple DeepSeek-backed agents for visual novel style prose.
- It stores projects, config, JSONL transcripts, artifacts, and snapshots under `~/.quaengine/novel-writer`.

## Boundaries

- The agent workflow produces prose. The editor plugin converts prose to QS through the shared compiler, then submits guarded, undoable Monaco edits.
- Keep engine, renderer and QPK runtime dependencies out of the writing service. The plugin authoring adapter may use editor-core and script-compiler for static QS tooling.
- Do not use LangChain.
- Do not expose API keys or DeepSeek reasoning traces in client payloads or logs.

## Core Systems

- DeepSeek adapter: `deepseek-v4-pro`, thinking enabled, explicit reasoning effort, tool-call transcript handling.
- Tavily adapter: `tavily_search` tool with normalized references.
- Tavily search is agent-initiated only. Do not add automatic pre-stage searches; agent prompts should tell experts to search only when external factual grounding is materially needed.
- Storage: append-only JSONL plus JSON/Markdown artifacts. JSON snapshots use unique temporary files and atomic rename; serialize JSONL reads/appends in the single-writer service so readers never observe truncated or interleaved records. Planner requests and review mutations participate in task busy/shutdown tracking.
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

## Chapter revision integrity

- Regenerated chapter artifacts retain `chapterIndex`. Manual edits, rejection and regeneration invalidate dependent stages while preserving unrelated chapter checkpoints and total chapter count. Chapter approval records per-chapter completion; aggregate completion is earned only after every chapter finishes.
- Project-input revisions run pre-chapter stages, the normal chapter loop, then final stages; do not generate one unindexed manuscript and declare all chapters complete. Test editing/regeneration of one chapter and full input revision, including resume checkpoints.

## Engineering Structure

- Also use `novel-writer-development-guardrails` for implementation changes; it owns the detailed UI/API/ReAct runtime guardrails.
- Follow `packages/editor/novel-writer/docs/architecture.md` for the current directory structure and intended server split.
- Keep `src/routes/+page.svelte` as a route shell, not a state-heavy page implementation.
- Keep page/client state in `src/lib/client/workspace-controller.svelte.ts`.
- Keep derived labels, status descriptors, timeline builders, and other pure UI helpers in `src/lib/client/workspace.ts`.
- Keep feature components under `src/lib/components/workspace`; split tab panels and nested panes into subfolders such as `workspace/inspector`.
- Prefer feature-sized Svelte components and split files once route logic, artifact viewing, review controls, Markdown preview, logs, references, or chat panels grow independently.
- Avoid inline styles in Svelte components; add reusable class names in `src/lib/styles/*`.

## Validation

- `pnpm --filter @quajs/editor-novel-writer typecheck`
- `pnpm --filter @quajs/editor-novel-writer test -- --run`
- `pnpm --filter @quajs/editor-novel-writer build`
- The build checks every emitted JavaScript file with `node --check` after adapter-node finishes, including lazy server chunks. Keep this gate: a successful Vite build or existing `handler.js` alone does not prove the desktop service can parse its production bundle. Validate startup with the isolated Electron smoke; never import the handler against user storage during build checks.

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
- Intelligent QS rewrite uses `editor/adaptation.ts` and the existing server-only DeepSeek client. The model returns an ordered assignment of every manuscript paragraph to compiler-derived source anchors, plus UTF-16 spans to restore existing runtime expressions. Paragraph count and speaker may change; plain anchors may be removed and multiple paragraphs may occupy one anchor. Preserve every decorated/dynamic anchor and every occupied logic zone; executable expression identity, order and evaluation location remain unchanged. Rebuild only selected dialogue bodies; keep TypeScript, decorators, comments, choices and story IDs byte-identical. Never accept arbitrary model-generated source or silently drop manuscript paragraphs.
- `/api/editor/adapt` validates plans and repairs invalid plans up to three attempts using concrete feedback. The workbench runs the actual project QS analysis before preview/application, rejects newly introduced error diagnostics and feeds compiler failures back for one repair pass. Show waiting state, summary and full resulting QS preview. Incompatible branch/variable-contract changes remain explicit blockers; static checks do not prove narrative semantics or all runtime behavior. Use the existing configured DeepSeek credentials; there is no offline fallback for intelligent adaptation, and keys/reasoning/provider response bodies never enter the client.
- Store source snapshots separately in each writing task's `editor-source.json`; do not include them in project lists or expert prompts. The new-task draft persists its pending source link. Restore path, UTF-16 selection, buffer and revision on task reload; update the link after each successful application. Saved, byte-identical buffers may rebase their disk revision. Changed source or another root requires recapture, never fuzzy overwrite. Snapshots may contain unsaved work, so they must not overwrite disk on restore.
- All changes remain guarded, undoable Monaco drafts. Host reconstructs and revalidates the plan, workbench rechecks buffer/root/disk before application, and expired authoring requests cannot apply late. Track adaptation jobs in service close/shutdown, abort their provider requests and never resume paid adaptation automatically. Test the local mock-provider Electron path for additions/deletions, branch and dynamic-variable preservation, persisted source restoration, repeated editing after save, undo and conflicts.
- Application checks current project, original buffer, disk revision and document bounds. Changed buffers or disk revisions require recapture; existing new-file paths and project escapes are rejected. All text changes enter Monaco as undoable drafts and use normal conflict-aware save. Never overwrite source directly from a model artifact.
- Scope manuscript/source drafts by canonical editor root and writing task. Task switching preserves each draft but invalidates previews; late task loads, approvals and chat responses must not overwrite the new selection or replace its SSE subscription. Preserve unsaved artifact text/review notes and planner inputs across selection changes, and include inactive drafts in the close guard. Project switching selects only a compatible task and blocks stale-root writes. Integration text participates in the existing close dirty guard. Keep setting and manuscript material out of process logs.
- Validate plugin tests/typecheck/build and editor core/UI/Electron checks. `node packages/editor/electron/scripts/writing-project-smoke.mjs` uses temporary projects and isolated writer storage to exercise Story Tree/settings extraction, canon preservation, real source capture, QS preview/new/rewrite/save, collisions, traversal, disk conflicts and project switching. Existing `novel-writer-smoke.mjs` still covers service/auth/workflow lifecycle. These offline checks do not establish live DeepSeek or Tavily quality.

- “建立 AI 改写任务” opens the normal new-task dialog with captured QS prose, source-preserving revision instructions and extracted project seeds. It preserves existing new-task drafts, bounds the request to the existing brief limit, and never starts generation before the normal create/start action. The sidebar limits linked writing projects to the current canonical root while retaining unbound older projects.

- Return native keyboard focus to the workbench when hiding the writing view. Forward only writer-local save/settings/undo/redo commands; project/global commands stay with the workbench. In Electron tests, focus Monaco via its editing surface: its hidden readonly IME textarea is not the modern EditContext input target.

## Writing integration UI

- Project context uses `ContextDocument`, a text-only heading/list/paragraph projection, instead of manuscript speaker columns. Preserve nested Story Tree lists and whole character descriptions; never treat a colon in a setting document as a speaker separator. Source evidence remains labeled as evidence. Omit redundant dialog subtitles/helper prose; use selected-tab underlines and subtle keyboard focus fill without rectangular focus outlines.
- Empty states fill the available center/inspector height with centered content; keep the flex height chain and internal scrolling intact in desktop overrides. Icon buttons use one `--nw-icon-button-size` for both dimensions (including minimums), with toolbar/composer size overrides through that token only.
- With no writing task selected in the three-column workspace, center the project-list, main and inspector empty-content groups on the same full-column midpoint. Headers, the chat composer, trash expansion and inspector-tab changes must not shift that shared alignment. Keep normal flow for stacked/short viewports and populated workspaces; verify actual group centers in Electron at regular and compact sizes.
- Project integration is a production writing flow, not a permanent debug panel. Keep the main workspace directly below the compact app toolbar; do not put source text, absolute paths, settings dumps or a matrix of conversion buttons above it.
- The toolbar exposes project context and “从 QS 改写”; each artifact offers “写入项目”. Keep session drafts accessible through “继续稿件”. `client/editor-writing.svelte.ts` owns source binding, async guards, draft, preview and apply state; dialog components only project it.
- Use the focused `EditorIntegration` dialog for manuscript and change-preview tabs. Keep update/append/create in one labeled mode control, show project-relative source paths, and ask for a path only for new files. One primary action advances from preview to application. Editing text, destination or mode invalidates the preview; never apply a different draft from the one reviewed.
- `WritingDiff` shows real added/removed lines and source line numbers; bound expensive alignment and DOM rows, mark truncation explicitly, and offer the complete resulting source. Existing compiler/revision guards still own application; the visual diff is not an execution authority.
- Project outline/background/characters live in a separate context dialog with keyboard-accessible tabs. Closing either dialog keeps the session draft; Escape and focus behavior use the repository's native dialog pattern. Use existing shadcn controls and lucide icons, restrained theme tokens and stable independently scrolling content.
- Validate the real Electron flows at compact window sizes: no permanent integration panel or horizontal overflow, modal bounds/footer visibility, keyboard tabs, Escape/reopen draft retention, direct artifact handoff, diff preview and guarded apply. Inspect screenshots in `.codex-tmp/editor-writing-project/`; mock-provider checks do not establish live model quality.

## Models by purpose

- `deepSeekModel` / `defaultReasoningEffort` control writing experts and planner chat. `codeModel` / `codeReasoningEffort` independently control QS adaptation and its repair attempts. Both use the existing server-only DeepSeek connection/key; current supported models are v4-pro and v4-flash. Never mutate the writing configuration when selecting the adapter model.
- Missing code-model settings inherit the existing writing choice on configuration migration and are persisted independently thereafter. Public config exposes choices and key-presence flags only. Model-only API updates and blank key inputs must retain stored credentials. Verify actual provider request model/effort values with the local mock-provider Electron smoke; this is routing coverage, not live model quality.

The writer view now participates in editor docking. Resize/move keeps its WebContents/controller and drafts. Hide native bounds while the workbench is dragging/resizing or displaying a modal; route writer-local menu commands only when its WebContents has focus. Keep the Svelte app isolated from the editor Lit component tree.
