---
name: quaengine-development-guardrails
description: QuaEngine architecture guardrails for renderer statelessness, dynamic QPK Runtime Packages, package-local decorators, Vite/build tooling, and engine/core Web API separation. Use when modifying QuaEngine engine, runtime content, renderer, plugins, decorators, script compilation, assets, QPK manifests, or Vite integration.
---

# QuaEngine Guardrails

## Core Rules

### Active development
- Treat all QuaEngine packages, APIs, schemas, examples, and docs as active pre-release work.
- Do not preserve deprecated APIs, legacy aliases, migration adapters, compatibility branches, fallback paths, or old/new dual implementations.
- When changing a contract, update in-repo callers, tests, examples, and docs directly to the new shape.
- Remove obsolete code in the same change that makes it obsolete.
- Keep code simple and explicit; add abstraction only when it serves the current architecture, not compatibility with old behavior.

### Dynamic runtime QPK packages
- Treat AI generated incremental content as Quack-built Runtime Packages. Do not add a loose single-resource push path for generated assets, scripts, story graph, store, audio, sprite, animation, or plugin updates.
- Runtime QPKs mount as side-by-side QuaAssets bundles. Existing patch flows are only for updating an already existing bundle.
- `RuntimeContentManager` in `@quajs/engine` owns package lifecycle, script module registration, runtime engine plugin lifecycle, renderer plugin manifest publication, story graph deltas, store migrations, dependency checks, and guarded unload.
- Engine core must stay platform neutral. Runtime JS bytes, object URLs, dynamic `import()`, DOM APIs, and WebCrypto details belong in injected loaders or platform/Web packages.
- Production dynamic JS/plugin loading must pass integrity/signature trust policy. Tests and development may explicitly allow unsigned packages.
- Runtime-created story points and view projections must carry `contentPackageId`. If a projection depends on more than one package, preserve the primary `contentPackageId` and merge `requiredRuntimePackages`.
- Save slots, checkpoints, backlog entries, voice replay references, jump targets, and current view projection must record enough required packages to restore safely.
- Same-scene continuation is a first-class case. Read keys and story graph/timeline identity must include package/script/lane/route/timeline/protagonist/node context as appropriate, not only scene and step IDs.
- Default runtime package unload must reject packages referenced by current story point, current checkpoint metadata, active view projection, or active package dependencies. Use `{ force: true }` only for teardown, rollback, or deliberate state eviction.
- Runtime store changes must be declared as idempotent migrations. Do not blindly overwrite player state, choices, settings, or current progress.
- For full details, read `docs/design/dynamic-runtime-qpk.md` when working on Runtime Package behavior.

### Renderer
- Treat the renderer as a projection canvas.
- Consume pipeline events and engine view state.
- Draw UI, animations, audio, and other effects from those inputs only.
- Keep renderer state non-authoritative and transient only.
- Do not add renderer-side APIs that mutate game or progression state.

### Stage layout and coordinates
- Treat `QuaViewProjection.layout` as the engine-owned source of truth for orientation, base logical dimensions, aspect ratio, supported aspect interval, and scale mode.
- QuaEngine renders into a logical stage first, then renderers scale that stage into their actual container. Renderer measurements, resolved stage layouts, CSS transforms, CSS env safe-area insets, DPR, physical pixel dimensions, and `ResizeObserver` handles are transient projection details only.
- The logical stage coordinate system starts at the top-left of `.qua-stage`; positive `x` goes right and positive `y` goes down. The base logical height is `layout.height`, and logical width comes from the active stage aspect ratio.
- Landscape authoring must account for the supported `16:10` to `16:9` interval. Portrait authoring is mobile-first with a `1080x2340` / `9:19.5` reference and a supported `9:21` to `9:16` interval. Important UI, choices, dialogue, and default subject staging should stay inside the safe area; full-stage backgrounds/effects may bleed beyond it.
- Renderer layout resolution must use `activeAspect = clamp(containerWidth / containerHeight, layout.minAspectRatio, layout.maxAspectRatio)`, `scale = viewportHeight / layout.height`, `logicalHeight = layout.height`, and `logicalWidth = viewportWidth / scale`. Treat `layout.aspectRatio` as the preferred/reference ratio, not a fixed rendered ratio.
- Device safe-area insets must be read as renderer-local CSS pixels, converted through the resolved viewport/scale into logical stage pixels, and intersected with the aspect safe area. DPR must not change DOM CSS layout; expose it only as projection metadata for physical-pixel renderers such as Canvas/WebGL/screenshot paths.
- All new or refactored coordinate APIs should default to logical stage pixels. If an API uses percent, normalized ratios, anchors, asset-local pixels, UV coordinates, or CSS units, the unit must be explicit in its name/type/docs and converted at the projection boundary.
- Animation tracks for position, camera/background offsets, size, and drawing transforms must interpolate in logical stage coordinates before renderer scaling. Do not animate measured CSS pixels when the value represents game projection state.
- Hit-test payloads sent through `@quajs/pipeline` should use logical stage coordinates unless explicitly named as raw client/screen coordinates. Web renderer code should use `clientPointToStageLogical` and `stageLogicalToClientPoint` from `@quajs/renderer-web` instead of hand-rolled formulas.
- Web renderers and framework adapters should use `observeStageViewportEnvironment` for mobile browser chrome, keyboard, rotation, visual viewport, and viewport scroll changes that need layout re-resolution.
- Shared layout resolving, stage scaling, safe-area math, coordinate conversion, and native DOM projection helpers belong in `@quajs/renderer-web`; framework renderers should reuse those helpers instead of duplicating layout math.

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
- Ask whether coordinate-bearing APIs use logical stage coordinates or explicitly document another unit.
- Ask whether coordinate-sensitive changes preserve the landscape `16:10` to `16:9` interval, the portrait `9:21` to `9:16` interval, and safe-area expectations.
- Ask whether pointer/hit-test code converts client/screen coordinates into logical stage coordinates with shared renderer-web helpers.
- Ask whether the change belongs in the package that defines the feature.
- Ask whether Web runtime behavior belongs in `@quajs/renderer-web` before adding it to a framework renderer.
- Ask whether the change can flow through pipeline metadata instead of a direct engine dependency.
- Ask whether Runtime Package changes are package-based QPK flow, not loose resource push flow.
- Ask whether runtime-created state has provenance and whether multi-package projections merge `requiredRuntimePackages`.
- Ask whether save/load, backlog, rewind, voice replay, story graph/timeline, and view projection dependencies are all restored before use.
- Ask whether default unload is guarded and force unload clears projections before bundle assets are removed.
- Ask whether same-scene continuation across multiple QPKs preserves read progress, sprite/background diffs, animation fill state, and audio state.
- Ask whether store migrations are declared, idempotent, and non-destructive.
- Ask whether dynamic JS/plugin loading is verified through trust policy and implemented through injected/platform loaders.
- Reject any renderer logic that becomes authoritative.
- Reject WebAudio autoplay handling that treats browser policy blocking as a game-state error or blocks renderer synchronization while waiting for permission.
- Reject framework renderer changes that duplicate object URL, lifecycle, animation projection, or WebAudio runtime code already owned by `@quajs/renderer-web`.
- Reject Runtime Package implementations that require a renderer cache or transient Web resource for save/load, replay, branching, or progression correctness.
- Reject any commit message that does not match `<type>(<component>): <description>`.
