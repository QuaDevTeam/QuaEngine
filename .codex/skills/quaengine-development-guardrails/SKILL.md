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

## Review Checklist

- Ask who owns the state.
- Ask whether the change belongs in the package that defines the feature.
- Ask whether the change can flow through pipeline metadata instead of a direct engine dependency.
- Reject any renderer logic that becomes authoritative.
