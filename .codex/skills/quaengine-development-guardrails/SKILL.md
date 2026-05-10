---
name: quaengine-development-guardrails
description: QuaEngine architecture guardrails for renderer statelessness, package-local decorators and Vite/build tooling, and engine/core Web API separation. Use when modifying QuaEngine engine, renderer, plugins, decorators, script compilation, or Vite integration.
---

# QuaEngine Guardrails

## Core Rules

### Renderer
- Treat the renderer as a projection canvas.
- Consume pipeline events and engine view state.
- Draw UI, animations, audio, and other effects from those inputs only.
- Keep renderer state non-authoritative and transient only.
- Do not add renderer-side APIs that mutate game or progression state.

### Package-local features
- Keep feature implementations inside the owning package.
- Put decorators, runtime helpers, and compiler lowering in that package's own public sub-entry, such as `./script-compiler`.
- Keep `@quajs/script-compiler` focused on orchestration, discovery, and import wiring.
- Keep `@quajs/engine` focused on state ownership and contracts, not concrete feature behavior.

### Engine and Web APIs
- Do not use Web APIs directly in engine/core packages.
- If a feature needs browser behavior, add an adapter, abstraction, or pipeline metadata path.
- Let the renderer perform the real Web-side implementation.

### Git commits
- Every git commit message must use the exact scoped format `<type>(<component>): <description>`.
- Do not create unscoped conventional commits such as `feat: desc`, and do not create free-form messages such as `update files`.
- Use a lowercase conventional `type`, a required `component` naming the primary package or subsystem, and a concise imperative description.
- Examples: `feat(sprite): add expression diff manifest`, `chore(deps): enforce peer dependency coupling`, `docs(agents): require scoped commit messages`.

## Review Checklist

- Ask who owns the state.
- Ask whether the change belongs in the package that defines the feature.
- Ask whether the change can flow through pipeline metadata instead of a direct engine dependency.
- Reject any renderer logic that becomes authoritative.
- Reject any commit message that does not match `<type>(<component>): <description>`.
