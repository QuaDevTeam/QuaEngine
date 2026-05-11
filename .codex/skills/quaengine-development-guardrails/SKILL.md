---
name: quaengine-development-guardrails
description: QuaEngine architecture guardrails for renderer statelessness, package-local decorators and Vite/build tooling, and engine/core Web API separation. Use when modifying QuaEngine engine, renderer, plugins, decorators, script compilation, or Vite integration.
---

# QuaEngine Guardrails

## Core Rules

### Active development
- Treat all QuaEngine packages, APIs, schemas, examples, and docs as active pre-release work.
- Do not preserve deprecated APIs, legacy aliases, migration adapters, compatibility branches, fallback paths, or old/new dual implementations.
- When changing a contract, update in-repo callers, tests, examples, and docs directly to the new shape.
- Remove obsolete code in the same change that makes it obsolete.
- Keep code simple and explicit; add abstraction only when it serves the current architecture, not compatibility with old behavior.

### Renderer
- Treat the renderer as a projection canvas.
- Consume pipeline events and engine view state.
- Draw UI, animations, audio, and other effects from those inputs only.
- Keep renderer state non-authoritative and transient only.
- Do not add renderer-side APIs that mutate game or progression state.

### Renderer package layering
- Keep `@quajs/render-core` universal and framework-free. It defines event contracts, projection types, typed pipeline helpers, and renderer plugin contracts only.
- Put browser/Web implementation details in `@quajs/renderer-web`, not in Vue, React, or engine packages. This includes Web renderer lifecycle control, object URL handles, animation projection helpers, native DOM projection utilities, WebAudio runtime primitives, and framework-neutral renderer actions.
- Build MVVM/framework renderers such as `@quajs/renderer-vue` as adapters over `@quajs/renderer-web`. Framework packages may own component/composable ergonomics, slots, context injection, framework plugin layer declarations, and framework-specific cleanup, but should not duplicate Web runtime behavior.
- Preserve React compatibility by exposing framework-neutral snapshot/subscribe APIs from `@quajs/renderer-web` that can back `useSyncExternalStore`. Do not add a React dependency to `@quajs/renderer-web`.
- Split reusable Web renderer features into explicit `@quajs/renderer-web` sub-entries. DOM projection features belong under `@quajs/renderer-web/plugins/*`; presets belong under `@quajs/renderer-web/plugins/preset`; WebAudio primitives belong under `@quajs/renderer-web/audio`; and audio renderer plugin wiring belongs under `@quajs/renderer-web/plugins/audio`.
- Keep optional feature runtimes in explicit sub-entries when they add feature dependencies. For example, WebAudio lives under `@quajs/renderer-web/audio` and `@quajs/renderer-web/plugins/audio` so the root Web renderer entry does not force audio plugin contracts.
- WebAudio autoplay handling belongs only in `@quajs/renderer-web/audio`. It may make a non-blocking automatic unlock attempt when engine-owned audio projection requests playback. If the browser blocks autoplay, keep playback sources pending until user activation and do not emit an engine audio error for that policy block. Emit `audio/unlocked` only after the `AudioContext` is actually running.
- Renderer plugins may add projection layers and manage transient implementation resources, but they must not own authoritative game state, create a second eventbus, or decide narrative progression.
- Official renderers must not auto-import visual CSS. Provide semantic DOM, stable class names/data attributes, resource wiring, and explicit optional style entrypoints instead.

### Package-local features
- Keep feature implementations inside the owning package.
- Put decorators, runtime helpers, and compiler lowering in that package's own public sub-entry, such as `./script-compiler`.
- Keep `@quajs/script-compiler` focused on orchestration, discovery, and import wiring.
- Keep `@quajs/engine` focused on state ownership and contracts, not concrete feature behavior.

### Package structure
- Every package should have an intentional `src/` directory layout that matches its responsibility boundaries.
- Split growing packages by domain or layer, such as `core/`, `runtime/`, `contracts/`, `adapters/`, `plugins/`, `integrations/`, `components/`, `composables/`, `styles/`, or `utils/` when those boundaries exist.
- Keep runtime implementation out of package roots; package roots should focus on metadata, build config, README/docs, and public entry files.
- Keep public exports deliberate through `src/index.ts` and explicit sub-entry files.
- Do not create `legacy`, `old`, `new`, `temp`, or generic catch-all folders for code that should be moved or removed.

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
- Ask whether Web runtime behavior belongs in `@quajs/renderer-web` before adding it to a framework renderer.
- Ask whether the change can flow through pipeline metadata instead of a direct engine dependency.
- Reject any renderer logic that becomes authoritative.
- Reject WebAudio autoplay handling that treats browser policy blocking as a game-state error or blocks renderer synchronization while waiting for permission.
- Reject framework renderer changes that duplicate object URL, lifecycle, animation projection, or WebAudio runtime code already owned by `@quajs/renderer-web`.
- Reject any commit message that does not match `<type>(<component>): <description>`.
