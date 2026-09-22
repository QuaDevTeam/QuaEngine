# Novel Writer Engineering Structure

`packages/editor/novel-writer` is the SvelteKit writing workspace integrated into the Electron editor, also runnable independently during development. It must remain independent from QuaEngine runtime, renderer and QPK packages. Static authoring uses the shared QuaScript compiler without executing project code.

## Current Layout

```text
src/
  routes/
    +page.svelte                  # page shell only
    +page.server.ts               # initial page data
    api/                          # HTTP endpoints, thin request handlers
  lib/
    client/
      api.ts                      # browser API client
      workspace.ts                # UI derived data and labels
      workspace-controller.svelte.ts
                                  # page state machine and client actions
    components/
      ui/                         # shadcn-svelte registry roots and wrappers
      workspace/                  # feature workspace components
        inspector/                # right-pane inspector tab panels
    server/                       # local orchestration, adapters, storage
    styles/                       # global workspace CSS modules
    types.ts                      # shared public types
```

## Frontend Rules

- Keep `src/routes/+page.svelte` as a route shell. It should wire page data, lifecycle hooks, and top-level components only.
- Keep client workflow state in `src/lib/client/workspace-controller.svelte.ts`.
- Keep pure UI projection helpers in `src/lib/client/workspace.ts`; avoid network calls there.
- Keep workspace UI in feature-sized components under `src/lib/components/workspace`.
- Split repeated or independently testable panes into subfolders such as `workspace/inspector`.
- Prefer components under roughly 150 lines. A larger file is acceptable only when it owns one cohesive workflow and has no clear repeated subparts.
- Avoid inline styles in components; add stable class names to `src/lib/styles/*`.
- Use `lucide-svelte` icons for action buttons and shadcn-svelte registry components through the local wrappers.

## Server Rules

- Keep route handlers thin: parse request, call a `src/lib/server/*` function, return JSON.
- Keep integration adapters replaceable:
  - `deepseek.ts` owns DeepSeek protocol details.
  - `tavily.ts` owns search normalization.
  - `sandbox.ts` owns command execution boundaries.
- Keep storage append-only behavior in `store.ts` / `jsonl.ts`.
- Do not expose API keys, DeepSeek reasoning traces, or raw private tool transcripts in client payloads.

## Recommended Server Split

`src/lib/server/workflow.ts` currently owns multiple responsibilities. When changing server orchestration, migrate it incrementally toward:

```text
src/lib/server/workflow/
  index.ts              # public API: startWorkflow, recordApproval, appendUserMessage
  runner.ts             # active run map, step/yolo lifecycle, run failure handling
  approvals.ts          # approve/request_changes/manual_edit/regenerate behavior
  checkpoint.ts         # checkpoint mutation locks and helpers
  stages.ts             # runStage, review loops, stage pairing
  agent-runner.ts       # DeepSeek invocation, Tavily tool registration, transcript persistence
  prompts.ts            # stage output, search, seed, and review policy instructions
  fallback.ts           # no-API-key scaffold artifacts
  normalization.ts      # review data normalization, reference extraction/deduplication
```

This split should be mechanical and behavior-preserving first. Do not change workflow semantics while moving code between files.

## Validation

Run these after frontend or workflow changes:

```bash
pnpm --filter @quajs/editor-novel-writer typecheck
pnpm --filter @quajs/editor-novel-writer test -- --run
pnpm --filter @quajs/editor-novel-writer build
```

## Editor host

`desktop/server.mjs` loads the adapter-node production handler in an Electron utility process. `editor/host.ts` owns the isolated page, process, loopback authentication, bounds, close protection and teardown. The dedicated preload grants bounded project-context and QS authoring capabilities alongside commands and dirty-state reporting; it does not expose the full EditorBridge. Its project storage and server APIs are unchanged; `editor-project-draft.json` additionally preserves the new-project dialog draft across random desktop origins. The route shell uses runes to observe the existing rune-based controller.

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
- Project switching invalidates captured source context, retains the writing page/prose and blocks stale-root writes. Integration text participates in the existing close dirty guard. Keep setting and manuscript material out of process logs.
- Validate plugin tests/typecheck/build and editor core/UI/Electron checks. `node packages/editor/electron/scripts/writing-project-smoke.mjs` uses temporary projects and isolated writer storage to exercise Story Tree/settings extraction, canon preservation, real source capture, QS preview/new/rewrite/save, collisions, traversal, disk conflicts and project switching. Existing `novel-writer-smoke.mjs` still covers service/auth/workflow lifecycle. These offline checks do not establish live DeepSeek or Tavily quality.

- “建立 AI 改写任务” opens the normal new-task dialog with captured QS prose, source-preserving revision instructions and extracted project seeds. It preserves existing new-task drafts, bounds the request to the existing brief limit, and never starts generation before the normal create/start action. The sidebar limits linked writing projects to the current canonical root while retaining unbound older projects.

## Writing integration UI

- Project integration is a production writing flow, not a permanent debug panel. Keep the main workspace directly below the compact app toolbar; do not put source text, absolute paths, settings dumps or a matrix of conversion buttons above it.
- The toolbar exposes project context and “从 QS 改写”; each artifact offers “写入项目”. Keep session drafts accessible through “继续稿件”. `client/editor-writing.svelte.ts` owns source binding, async guards, draft, preview and apply state; dialog components only project it.
- Use the focused `EditorIntegration` dialog for manuscript and change-preview tabs. Keep update/append/create in one labeled mode control, show project-relative source paths, and ask for a path only for new files. One primary action advances from preview to application. Editing text, destination or mode invalidates the preview; never apply a different draft from the one reviewed.
- `WritingDiff` shows real added/removed lines and source line numbers; bound expensive alignment and DOM rows, mark truncation explicitly, and offer the complete resulting source. Existing compiler/revision guards still own application; the visual diff is not an execution authority.
- Project outline/background/characters live in a separate context dialog with keyboard-accessible tabs. Closing either dialog keeps the session draft; Escape and focus behavior use the repository's native dialog pattern. Use existing shadcn controls and lucide icons, restrained theme tokens and stable independently scrolling content.
- Validate the real Electron flows at compact window sizes: no permanent integration panel or horizontal overflow, modal bounds/footer visibility, keyboard tabs, Escape/reopen draft retention, direct artifact handoff, diff preview and guarded apply. Inspect screenshots in `.codex-tmp/editor-writing-project/`; mock-provider checks do not establish live model quality.

## Writing model and context presentation

Writing experts and planner chat use `deepSeekModel` and `defaultReasoningEffort`. QS adaptation uses the independently persisted `codeModel` and `codeReasoningEffort`, including validation repair requests, through the same server-only DeepSeek connection. Older configurations inherit their existing model/effort for both purposes until changed. Model-only updates preserve credentials.

`ContextDocument` renders project settings and Story Tree as escaped document text with headings and nested lists. It does not use manuscript speaker columns or execute HTML from project files. Dialogs omit redundant subtitles; keyboard tabs retain their selected underline and a subtle focus fill.
