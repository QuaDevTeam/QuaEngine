# Novel Writer Engineering Structure

`ai/novel-writer` is a standalone SvelteKit writing workspace. It must remain independent from QuaEngine runtime, renderer, QPK, and QuaScript packages.

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
pnpm --filter novel-writer typecheck
pnpm --filter novel-writer test -- --run
pnpm --filter novel-writer build
```
