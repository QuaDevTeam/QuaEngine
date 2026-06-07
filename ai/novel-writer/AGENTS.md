# Novel Writer Development Guardrails

## Scope

- `novel-writer` is a standalone local AI writing application.
- It must not depend on QuaEngine runtime packages, renderer packages, QPK loading, or QuaScript compilation.
- Output is visual-novel prose in the form `Speaker: content` or localized equivalents such as `人物：内容`; it is never `.qs`.

## Architecture

- Keep orchestration code in `src/lib/server`.
- Keep `src/routes/+page.svelte` as a route shell. Page state belongs in `src/lib/client/workspace-controller.svelte.ts`; derived labels/projections belong in `src/lib/client/workspace.ts`.
- Keep Svelte UI code in `src/lib/components`. Workspace panes belong under `src/lib/components/workspace`, with subfolders such as `workspace/inspector` for tab panels and other cohesive groups.
- Prefer feature-sized Svelte components instead of large mixed-responsibility files. Split route pages, workspace panes, inspector tabs, artifact viewers, review controls, and Markdown preview into separate components when they grow independently.
- Follow `docs/architecture.md` for the current structure and the recommended future split of `src/lib/server/workflow.ts`.
- Store all runtime user data under `~/.quaengine/novel-writer` unless `NOVEL_WRITER_HOME` overrides it.
- Persist every agent turn and workflow event as append-only JSONL before reporting it as complete.
- Treat DeepSeek and Tavily adapters as replaceable integrations behind local interfaces.
- Do not introduce LangChain or another orchestration framework.

## Agent Rules

- Agents may use Tavily search, file tools, and sandbox commands through registered tools only.
- Tavily search is conditional. Do not perform automatic pre-stage searches; agents should call search only when real-world science, history, news, infrastructure, legal, or other factual references are materially needed for the current artifact.
- Agents must cite search references in artifact metadata when factual material influenced output.
- Advanced seed fields do not skip workflow stages. Worldbuilding, character notes, and outline seeds must still be processed through the worldbuilding, character, story-background, outline, and review agents in order.
- Requirements confirmation must summarize and constrain the writing job; it must not jump straight into manuscript writing.
- Outline review is a real gate. YOLO may continue automatically only when the review agent passes the outline or after revision loops produce a passing outline.
- Regenerate is an approval action that immediately reruns the selected artifact stage in the background, marks the replaced artifact rejected, and leaves the regenerated artifact awaiting review. It must not require a separate run click.
- Thinking traces are protocol data for DeepSeek context handling; do not expose them as user-facing prose.
- Context compaction must preserve user requirements, approved artifacts, unresolved reviewer findings, and tool references.

## UI Rules

- Use shadcn-svelte registry components from `src/lib/components/ui/*` where they are installed; compatibility wrappers such as `Button.svelte`, `Input.svelte`, `Textarea.svelte`, and `Badge.svelte` may preserve the local API and visual style, but must delegate to the registry Root instead of reimplementing the control from scratch.
- Keep the UI a dense, quiet writing workspace: no landing page, hero, decorative blobs, or card nesting.
- Use icons through `lucide-svelte` when a button represents an action.
- Avoid inline styles in Svelte components; add stable class names in `src/lib/styles/*`.
- Long text, logs, and inspector panels must scroll inside stable containers instead of resizing the layout.
- The main workspace must expose the workflow timeline so users can open worldbuilding, characters, story background, outline, outline review, scene writing, editing, supervision, and final artifacts directly.

## Security Boundary

- The app is intentionally LAN-accessible without auth per product decision.
- Keep API keys redacted in logs, events, and client responses.
- Store config files with owner-only permissions where the platform supports it.
- Command execution must go through `SandboxProvider`; do not call shell commands directly from route handlers.
