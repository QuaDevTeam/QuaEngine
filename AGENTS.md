# QuaEngine - TypeScript Galgame Engine

## Project Overview

QuaEngine is a modern, TypeScript-based visual novel (Galgame) engine designed with a clean separation between logic and rendering layers. The architecture enables maximum flexibility, allowing the core logic to be ported to any rendering implementation and vice versa.

## Architecture Philosophy

### Separation of Concerns
- **Logic Layer**: Pure business logic, game state management, and narrative flow
- **Render Layer**: Stateless, event-driven presentation layer
- **Decoupled Design**: Each layer can be independently developed, tested, and replaced

### Event-Driven Architecture
- **Stateless Rendering**: Render layer maintains no state, only responds to events
- **Reactive Updates**: Changes in logic layer automatically propagate through events
- **Plugin System**: Extensible architecture supporting custom behaviors

### Dynamic Runtime Package Architecture
- **Runtime content is package-based**: AI generated incremental content must be delivered as Quack-built QPK Runtime Packages. Do not introduce a loose single-resource push path for generated assets, scripts, story graph, store, audio, sprite, or animation updates.
- **QPK side-by-side mounting**: Runtime packages mount as side-by-side QuaAssets bundles. Existing patch flows remain for updating an existing bundle; runtime packages are for new or replacement dynamic content capability.
- **Engine lifecycle ownership**: `@quajs/engine` owns runtime package activation through `RuntimeContentManager`, including script modules, engine plugins, renderer plugin manifests, story graph deltas, store migrations, save/load dependency checks, and unload control.
- **Platform-neutral runtime modules**: Engine core must receive `runtimeModuleLoader` and `trustPolicy` by injection. Browser `Blob`, object URLs, dynamic `import()`, DOM APIs, and WebCrypto details belong in Web/platform adapters, not engine core.
- **Trust first in production**: Production dynamic JS and plugin modules must be accepted only after package hash/signature verification. Development and tests may explicitly allow unsigned packages.
- **Migration-only state changes**: Runtime packages may declare idempotent store/plugin migrations. They must not arbitrarily overwrite current player progress, choices, settings, or scene state.
- **Provenance is required**: Runtime-created story points and view projections must carry `contentPackageId`; projections that depend on multiple packages must merge `requiredRuntimePackages`. Save slots, checkpoints, backlog entries, voice replay, and jump targets must preserve required packages.
- **Same-scene continuation is supported**: Multiple QPKs may continue the same scene, lane, route, protagonist, or timeline. Read-progress keys, save/load metadata, story graph deltas, sprite/background diffs, audio, and animation cleanup must remain package-aware.
- **Default unload is guarded**: `unloadRuntimePackage(packageId)` must reject packages referenced by current story point, current checkpoint metadata, active view projections, or active package dependencies. `{ force: true }` is reserved for teardown, rollback, or deliberate state eviction.
- **Renderer remains a projection**: Renderer plugins loaded from runtime packages may manage transient DOM/audio/object URL resources only. They must be loaded and destroyed through renderer runtime hooks and pipeline events, never by becoming authoritative state owners.
- **Design reference**: See `docs/design/dynamic-runtime-qpk.md` for manifest shape, package flow, plugin responsibilities, same-scene continuation rules, and required test coverage.

### Renderer State Boundary
- **Renderer has no game state**: Renderers must not own, cache, derive, or mutate authoritative game-related state. This includes scene identity, current step, background, characters, dialogue, choices, audio intent, UI visibility, save/load state, inventory, variables, flags, or any state that affects replay, save/load, branching, or game progression.
- **Engine/store owns state**: All game, narrative, and render-relevant state belongs to the logic layer through engine/store APIs.
- **Pipeline is the only communication channel**: Logic-to-render notifications and render-to-logic user intents must flow through `@quajs/pipeline`. Do not introduce a second renderer communication bus or bridge outside the pipeline.
- **Renderer is a projection**: Renderer implementations read engine/store state or event payloads and project them to UI. They may emit user intent events, but they must never decide game progression.
- **Allowed renderer implementation state**: Renderers may hold only non-authoritative implementation details such as DOM refs, component refs, object URLs, animation handles, transient pointer/hover/focus state, audio element handles, local transition timers, and cleanup disposers. These must not be required for save/load, replay, or branching.
- **Vue renderer rule**: Vue components and composables must expose readonly projections plus intent actions only. Do not expose APIs such as `setDialogue`, `setBackground`, `showCharacter`, or other renderer-side mutations of game state.
- **Renderer package layering**: `@quajs/render-core` owns universal renderer contracts only; `@quajs/renderer-web` owns browser/Web runtime implementation; framework renderers such as `@quajs/renderer-vue` must be thin adapters over `@quajs/renderer-web` rather than independent Web runtimes.
- **Framework adapter rule**: Vue/React/Svelte/etc. renderer packages may own component ergonomics, composables/hooks, context providers, slots, and framework-specific plugin layer declarations. They must not duplicate Web lifecycle wiring, object URL handling, animation projection, WebAudio runtime code, renderer actions, or native DOM projection utilities that belong in `@quajs/renderer-web`.
- **React compatibility seam**: Framework-neutral renderer state must be exposed from `@quajs/renderer-web` through snapshot/subscribe style APIs suitable for React `useSyncExternalStore`, without adding a React dependency to `@quajs/renderer-web`.
- **Optional Web feature sub-entries**: Web feature runtimes that require feature-plugin contracts must live behind explicit sub-entries, such as `@quajs/renderer-web/audio` and `@quajs/renderer-web/plugins/audio`, so the root Web renderer package stays broadly reusable.
- **Renderer Web plugin sub-entries**: Reusable DOM projection features in `@quajs/renderer-web` must be split under `@quajs/renderer-web/plugins/*` (`achievement`, `audio`, `background`, `backlog`, `character`, `choices`, `dialogue`, `effects`, `fonts`, `gallery`, `input`, `preset`, `scene`, `settings`, `sprite`, and `ui`) instead of being kept as a monolithic Web renderer module.
- **No implicit renderer styling**: Official renderers provide semantic DOM, stable class names, data attributes, slots, composables, and resource wiring by default. They must not auto-import visual CSS. They may ship optional SCSS style entrypoints such as base/reset styles and a default theme, but users must import them explicitly.
- **Plugin-first non-core features**: Features that are not required for narrative execution, state authority, asset access, or pipeline communication must be engine plugins. Main menu, settings panels, save/load UI flows, gallery, backlog, history, achievements, and similar UX systems must not be hardwired into engine core.
- **Renderer plugin architecture**: Renderer implementations must be built as core + optional plugins. Renderer plugins may subscribe/emit through `@quajs/pipeline` helpers and manage implementation resources, but they must not create a second eventbus or own authoritative game state.

### Target Core Packaging Isolation
- **Target core plugins are mutually exclusive**: Web, Cocos, and native bootstrap/core plugins are three disjoint target families. A packaged Web, Cocos, or native project must contain exactly one active target core family and must never bundle another target's core adapters, renderer subentries, host bridge, native runtime metadata, or startup shell.
- **Target selection happens first**: Packaging must start from the active target resolver: `web-core-resolver`, `cocos-core-resolver`, or `native-core-resolver`. Do not construct an all-target set such as `[webCore, cocosCore, nativeCore]`, `allRendererEntries`, an umbrella preset, or a shared bootstrap shell and filter it later.
- **Core plugins are not ordinary plugins**: Web/Cocos/native bootstrap adapters must not appear in ordinary `plugins`, shared presets, generated plugin resolvers, third-party shared entries, Runtime QPK `executableDependencies`, Runtime QPK `rendererEntries`, debug shells, installers, updaters, or smoke runners.
- **Project generators consume manifests only**: Web starters, Cocos Creator project wiring, native Rust app bootstrap, startup shells, debug/release shells, installers, updaters, and smoke runners must consume the emitted active-target `target-bundle-manifest.json`. They must not re-declare even the current active core, because the only core injection point is the target resolver.
- **Project graphs prove isolation**: Non-`post-bundle` `projectGraphs` must remain platform-neutral and contain no Web/Cocos/native target core, including the active family. `post-bundle` graphs may contain only the active target core family and must reject inactive target roots or subentries after package-root normalization of both `specifier` and `packageName`.
- **Runtime QPK metadata is not activation authority**: Runtime QPKs may declare Web, Cocos, and native compatibility metadata, but activation evaluates only the active artifact target block. QPKs must not install target bootstrap plugins, carry target core executable dependencies, or override native renderer/runtime capability metadata.
- **Validation is symmetric**: Web builds must reject Cocos/native core leakage, Cocos builds must reject Web/native leakage, and native builds must reject Web/Cocos leakage with the same blocker severity. Use the shared target isolation contracts and packager fixtures for all three targets, not only for native.

### Cocos Renderer And Host Guardrails
- **Cocos renderer remains a projection**: `@quajs/renderer-cocos` may hold Cocos nodes, resources, audio handles, timers, frame loops, page cursors, presence phases, and other native implementation details only as transient renderer state. It must not own scene, save/load, branching, gallery unlock, achievement unlock, backlog, settings, or audio intent authority.
- **CocosHost is a best-effort native adapter contract**: New native capabilities belong in `@quajs/cocos-host` as optional APIs or optional projection fields. Existing hosts must continue to work through warning, fallback, or no-op behavior when a capability such as seek, EQ, fonts, mask, filter, blend, clip, or capture is unavailable.
- **Web-only runtime behavior stays out of Cocos**: Do not port DOM, React/Vue/Svelte component APIs, browser object URLs, Blob URL lifetime, WebAudio autoplay unlock policy, browser event normalization, or Web framework host logic into Cocos. Cocos may expose analogous native projection metadata only through `CocosHost`.
- **Dynamic QPK renderer plugin loading is separate**: Cocos must not implement a runtime renderer plugin loader or dynamic JS import path unless that work is explicitly requested. Cocos renderer plugins can consume engine-published, package-aware projections and assets, but dynamic plugin activation remains owned by engine/runtime package flow.
- **Package-aware assets must use QPK provenance**: Cocos asset lookup must preserve `contentPackageId` and `requiredRuntimePackages` candidates from view projections, plugin projections, backlog/voice/gallery/achievement asset refs, sprite manifests, and UI skin metadata. Do not add loose resource push paths or renderer caches required for save/load or replay correctness.
- **Use logical stage units at the projection boundary**: Cocos transforms, hit tests, layout, camera/stage motion, scene transition clip rectangles, and animation tracks must stay in engine logical stage coordinates until the host maps them to native pixels. Native device pixels, safe-area insets, and DPR are host projection details only.
- **Audio is intent projection, not policy authority**: Cocos audio handles may implement transient playback, seek, fade, gain/EQ automation, crossfade release, and interruption handling from engine-owned audio projection. Unsupported host capabilities must warn once or no-op; Cocos must not introduce Web autoplay policy semantics or mutate engine audio state directly.
- **Product UI state is renderer-local only**: Cocos gallery, achievement, backlog, settings, save preview, and overlay panels may keep local paging, search input metadata, detail selection projection, timers, and preview handles. They must emit user intent through pipeline/plugin events and must not persist UI browsing state into engine/store unless the owning feature plugin defines that state.
- **Host option additions need fake and Creator coverage**: When adding `CocosHost` projection options or capabilities, update the fake host, Creator host best-effort bridge, and package tests together. Prefer recordable projection metadata over hard dependencies on a concrete Creator component.
- **Validate Cocos changes in Cocos packages**: Cocos renderer/host changes should run `pnpm --filter @quajs/cocos-host test -- --run`, `pnpm --filter @quajs/cocos-host typecheck`, `pnpm --filter @quajs/cocos-host build`, `pnpm --filter @quajs/renderer-cocos test -- --run`, `pnpm --filter @quajs/renderer-cocos typecheck`, and `pnpm --filter @quajs/renderer-cocos build` unless the change is clearly documentation-only.

### Adaptive Stage Layout And Coordinate System
- **Development background**: Visual novel scenes need stable authored composition across browsers, tablets, phones, embedded WebViews, and future native renderers. QuaEngine therefore renders into an engine-owned logical stage first, then lets the renderer scale that stage into the actual screen. Screen adaptation must not change narrative state, scene progression, or authored coordinates.
- **Engine-owned layout projection**: Project aspect configuration belongs in `QuaViewProjection.layout` and is owned by the engine/store. Renderers consume this projection plus their transient container size to draw; they must not persist resolved viewport sizes, scale factors, safe areas, or measured DOM dimensions as authoritative game state.
- **Official presets**: QuaEngine provides `landscape` and `portrait` layout presets. Landscape uses a `1920x1080` / `16:9` logical scene. Portrait uses a mobile-first `1080x2340` / `9:19.5` logical scene. The scene ratio remains fixed while safe-area metadata preserves the supported desktop/mobile content margins.
- **Layout resolution formula**: Renderers fit `layout.aspectRatio` inside the measured QuaEngine parent container, set `scale = min(containerWidth / logicalWidth, containerHeight / layout.height)`, and center the resulting viewport. Ratio mismatches produce horizontal or vertical black bars; renderers must never crop the scene or change its logical width to fill the container.
- **Logical stage before screen pixels**: All engine-facing coordinates, drawing coordinates, camera/background offsets, animation track values, and renderer plugin projection coordinates must be authored in logical stage space unless an API explicitly names another unit. Do not use browser viewport pixels, CSS `vw`/`vh`, or physical device pixels as game-facing coordinate units.
- **Coordinate origin and units**: The logical stage origin is the top-left corner of `.qua-stage`; positive `x` goes right and positive `y` goes down. The base logical height is `layout.height`; logical width is derived from the fixed `layout.aspectRatio`. Renderer scaling maps logical units to CSS pixels only at the final projection boundary.
- **Coordinate conversion**: Client/screen coordinates are converted by subtracting the renderer container rect and resolved viewport offset, then dividing by resolved `scale`: `logicalX = (clientX - containerRect.left - viewportX) / scale`, `logicalY = (clientY - containerRect.top - viewportY) / scale`. The inverse is `clientX = containerRect.left + viewportX + logicalX * scale`, `clientY = containerRect.top + viewportY + logicalY * scale`.
- **Safe area rule**: Content that must remain stable across the full supported ratio interval, such as dialogue, choices, menus, important character staging, and interactive UI, should default to the stage safe area exposed by layout helpers/CSS variables. Safe area is the minimum supported aspect width centered inside the active logical stage. Full-stage backgrounds, screen effects, transitions, and intentional bleed art may use the entire logical stage.
- **Device safe area and DPR**: Renderer code must treat CSS `env(safe-area-inset-*)` values and `devicePixelRatio` as transient Web projection details. Convert CSS safe-area insets into logical stage pixels after layout resolution and intersect them with the aspect safe area. DPR must not alter DOM CSS layout; expose it as physical-pixel metadata for Canvas/WebGL/screenshot-style renderers.
- **Animation and interpolation**: Animation tracks that affect position, size, camera movement, background offsets, or drawing transforms must interpolate in logical stage coordinates before renderer scaling is applied. Do not animate measured CSS pixel values when the animated value represents game projection state.
- **Renderer implementation state**: Renderers may measure containers, calculate `ResolvedStageLayout`, maintain `ResizeObserver` handles, and apply CSS transforms as transient implementation details. These calculations are a projection of engine-owned layout and must remain replaceable by other renderer implementations.
- **Framework adapter rule**: Shared layout resolving, stage scaling, safe-area math, hit-test coordinate conversion, and native DOM projection helpers belong in `@quajs/renderer-web`. Vue/React/Svelte adapters should reuse helpers such as `resolveStageLayout`, `clientPointToStageLogical`, and `stageLogicalToClientPoint` instead of duplicating Web layout math.

## Current Implementation Status

The current milestone implements the logic layer, stateless renderer contracts, framework-neutral Web renderer runtime, Vue reference adapter, React/Svelte thin adapters, and platform-split asset runtime.

### Implementation Progress Snapshot

#### Completed Foundations
- **Workspace structure**: The repo is organized around `build`, `core`, `platform`, `plugins`, `render`, and `utils` package groups.
- **Skill documentation is part of feature work**: Any user-facing feature change must update the relevant `.codex/skills/*/SKILL.md` file in the same change. New plugin/feature packages should add a matching skill covering responsibility, setup, runtime API, QuaScript decorators if any, renderer/state boundary, runtime package notes if any, validation, and review checklist.
- **Single eventbus contract**: `@quajs/pipeline` remains the only eventbus. Renderer communication uses `@quajs/render-core` typed contracts and thin helpers over pipeline.
- **Engine-owned state**: `@quajs/engine` owns runtime, view, UI overlay, character/dialogue/choice, and audio intent state. Renderers project this state and send user intent events only.
- **Background feature boundary**: Background is a feature plugin, not engine/global script API. Engine core only exposes the low-level `setBackgroundProjection` state write path used by plugins.
- **Scene lifecycle**: `SceneManager` is the engine-owned scene lifecycle implementation. `GameManager` is a high-level facade and does not duplicate scene logic.
- **Project layout boundary**: `QuaViewProjection.layout` is engine-owned project layout state. Renderers resolve container fit, stage scaling, and safe-area projection from that layout without writing those derived values back into engine state.
- **Audio boundary**: `SoundSystem` stores audio intent in engine state. Real DOM audio playback lives in renderer implementations; `audio/ended` returns to engine through pipeline.
- **Web audio autoplay boundary**: `@quajs/renderer-web/audio` may attempt to unlock WebAudio automatically when engine-owned audio projection requests playback. Browser autoplay policy blocks are expected Web runtime behavior, must not be emitted as engine audio errors, and should keep sources pending until a configured user activation event unlocks the `AudioContext`. Emit `audio/unlocked` only after the context is actually running.
- **Runtime package lifecycle**: Dynamic QPK Runtime Packages are loaded by QuaAssets and activated by `RuntimeContentManager`. Engine owns scripts, plugin lifecycle, story graph deltas, store migrations, package dependency metadata, and guarded unload.
- **No pre-release compatibility burden**: Deprecated aliases, legacy renderer communication, and old Web-only asset assumptions should be removed instead of preserved.

#### Completed Asset Runtime
- **`@quajs/assets` core** is platform-agnostic and bytes-first. It exposes `AssetData`, storage/provider/fetcher/crypto/codec contracts, bundle loading, patching, preloading, text/JSON helpers, and provider change events.
- **Web APIs are out of core**. `Blob`, `fetch`, IndexedDB/Dexie, WebCrypto, object URLs, and dev VFS implementation belong to `@quajs/assets-web`.
- **Adapters implemented**:
  - `@quajs/assets-web`: Fetch, IndexedDB/Dexie storage, WebCrypto hashing, Blob/object URL helpers, dev VFS provider, and Vite dev VFS helpers.
  - `@quajs/assets-node`: fs/http fetcher, filesystem cache, Node crypto, Buffer conversion, and Node compression codec integration.
  - `@quajs/assets-memory`: in-memory fetcher/storage/crypto for tests and embedded/lightweight runtimes.
- **Vite dev asset flow**: `@quajs/vite-plugin` wires dev VFS through `@quajs/assets-web/vite`; the plugin no longer owns a duplicate VFS implementation.
- **Dynamic bundle flow**: `@quajs/assets` supports `loadDynamicBundle`, `unloadDynamicBundle`, side-by-side runtime bundle manifests, priority/version/loadedAt ranking, and package-scoped asset change events.

#### Completed Engine And Script Flow
- **`@quajs/render-core`** defines shared render event enums, payload maps, readonly view projection types, project layout/aspect-ratio contracts, typed emit/on/wait helpers, and lightweight renderer plugin contracts.
- **`@quajs/engine`** re-exports render contracts for app ergonomics and exposes runtime accessors such as assets, pipeline, store, view state, and `waitFor`.
- **Store mutations** cover runtime/view/audio intent changes used by scene, dialogue, choices, characters, background projection, UI overlays, and audio.
- **Runtime package APIs** cover `loadRuntimePackage`, `activateRuntimePackage`, `unloadRuntimePackage`, `getRuntimePackages`, `registerScriptModule`, and `runScriptModule`.
- **Runtime save/load** tracks required runtime packages from story points, checkpoint metadata, backlog/voice references, and current view projection before restoring or jumping.
- **Story graph** owns story metadata, graph deltas, unlock state, and chapter select projection. Chapter select is derived from marked story nodes plus `unlockedNodes`, not stored as a separate authoritative model.
- **`@quajs/character`** provides character/dialogue convenience APIs that update engine-owned state and emit pipeline events without holding renderer state.
- **`@quajs/plugin-background`** provides background image, video background, layered background, background transition, and layer transition APIs/decorators that write engine-owned projection state.
- **QuaScript compiler** parses dialogue and choice blocks, compiles context-aware async steps, routes dialogue/choice output through engine APIs, routes background decorators through `@quajs/plugin-background`, waits for renderer user intent events, and stores the selected choice on step context.

#### Completed Renderer
- **`@quajs/renderer-web` Web runtime base** is framework-neutral. It owns Web renderer lifecycle control, snapshot subscriptions, renderer actions, object URL handles, stage layout resolving and scaling helpers, animation projection helpers, native DOM projection utilities, WebAudio runtime/controller primitives, split DOM plugin sub-entries, and React-compatible store adapters.
- **Framework renderers** are stateless with respect to game state and are adapters over `@quajs/renderer-web`. `@quajs/renderer-vue` provides Vue components/composables; `@quajs/renderer-react` and `@quajs/renderer-svelte` provide thin renderer shells and feature plugin subentries over Web plugin factories.
- **Projection components implemented**: Vue `QuaRenderer`, `QuaStage`, image/video/layered background, character/dialogue/choice/audio/effect/overlay layers, low-level projection components, plus optional native DOM projection layers in `@quajs/renderer-web`.
- **Composables implemented**: `useQuaRenderer`, `useQuaPipeline`, `useQuaView`, `useBackground`, `useCharacters`, `useDialogue`, `useChoices`, `useAudio`, `useEffects`, `useRendererActions`, `useAssetUrl`, and `useAudioAsset`, with shared Web object URL handling delegated to `@quajs/renderer-web`.
- **Renderer feature plugin sub-entries**: Web/Vue/React/Svelte expose aligned visual novel feature plugin entries for input, fonts, background, sprite, character, effects, dialogue, choices, audio, scene, UI, settings, backlog, gallery, and achievement. React/Svelte entries are thin wrappers around the corresponding Web plugin factories.
- **Renderer UI plugin sub-entry**: `@quajs/renderer-vue/plugins/ui` provides `QuaUiOverlay`, `QuaMenuOverlay`, `QuaSaveLoadPanel`, and `QuaSettingsPanel` as optional renderer-plugin UI components. These read generic engine-owned overlays and do not introduce menu/settings state into renderer core.
- **Styling boundary**: Vue renderer does not auto-import visual styles. Optional SCSS entrypoints are `@quajs/renderer-vue/styles/base.scss` and `@quajs/renderer-vue/styles/default.scss`.

#### Completed Build Tooling
- **`@quajs/quack`** provides asset detection, metadata, media extraction, QPK/ZIP bundling, workspace versioning, patch generation, and build-time bundler plugins.
- **`@quajs/script-compiler`** provides QuaScript parser/transformer, HMR integration, plugin-aware transformation, and Vite compiler integration.
- **`@quajs/vite-plugin`** integrates engine wiring, script compilation, asset bundling, and dev VFS.

#### Current Gaps / Next Milestones
- **Dedicated product-level UI feature packages are still pending**. Main menu behavior and save/load UX flows should remain plugin/subentry-based instead of moving into engine core.
- **Renderer plugin ecosystem is implemented as package subentries, but standalone third-party renderer plugin packages are still pending**. Web owns reusable DOM runtime behavior; Vue/React/Svelte expose framework adapters over those entries.
- **Example app/editor/tutorial depth is still pending**. The starter template exists, but the visual editor and full creator-facing tutorial set remain future work.
- **Native/non-Web renderer parity remains ongoing**. The official Cocos renderer and Cocos host are implemented for native projection, while Web-only DOM/framework/object URL/autoplay behaviors remain scoped to the Web renderer stack.

### Core Packages

#### **@quajs/engine** (`packages/core/engine`)
- **Environment**: Platform-neutral logic runtime with injected platform services
- **Purpose**: Authoritative game runtime, scene lifecycle, store coordination, save/load facade, and pipeline event emission
- **Status**: Implemented
- **Rules**:
  - Owns runtime, view, and audio intent state through engine/store mutations
  - Uses `SceneManager` as the single scene lifecycle implementation
  - Uses `@quajs/pipeline` plus `@quajs/render-core` contracts for renderer communication
  - Depends on `@quajs/assets` core and receives platform behavior through adapter injection

#### **@quajs/assets** (`packages/core/assets`)
- **Environment**: Platform-agnostic core
- **Purpose**: Bundle parsing, asset lookup, cache orchestration, patch application, and provider contracts
- **Status**: Implemented
- **Rules**:
  - Core data is bytes-first: `Uint8Array` / `ArrayBuffer`
  - Core must not depend on Web globals or storage APIs such as `Blob`, `fetch`, `window`, `document`, `URL.createObjectURL`, `crypto.subtle`, `AbortController`, or `Dexie`
  - Web-only helpers belong in `@quajs/assets-web`

#### **@quajs/store** (`packages/core/store`)
- **Environment**: Browser-compatible state package with pluggable persistence
- **Purpose**: Global state management, persistence backends, and snapshot system
- **Status**: Implemented

#### **@quajs/pipeline** (`packages/core/pipeline`)
- **Environment**: Universal
- **Purpose**: The only eventbus used between engine, scripts, plugins, and renderers
- **Status**: Implemented

### Game Packages

#### **@quajs/character** (`packages/game/character`)
- **Environment**: Platform-neutral logic helper
- **Purpose**: Game-facing character, sprite, expression, movement, and dialogue APIs that update engine-owned state and emit pipeline events
- **Status**: Implemented
- **Rules**:
  - Must not keep renderer state
  - Must route game-facing changes through engine/store APIs

#### **@quajs/story-graph** (`packages/game/story-graph`)
- **Environment**: Platform-neutral game feature plugin/helper
- **Purpose**: Story metadata, graph/lane/route/timeline records, story event logs, jump resolution, node unlock state, and chapter select projection
- **Status**: Implemented
- **Rules**:
  - Chapter select is a derived projection from graph nodes marked with `chapterSelect` plus `unlockedNodes`
  - Runtime graph deltas and chapter select assets/metadata must carry runtime package provenance
  - Jump helpers must ensure required runtime packages before entering dynamic targets

### Platform Packages

#### **@quajs/assets-web** (`packages/platform/assets-web`)
- **Environment**: Web
- **Purpose**: Fetch API adapter, IndexedDB storage, WebCrypto hashing, Blob/object URL helpers, and Vite dev VFS support
- **Status**: Implemented

#### **@quajs/assets-node** (`packages/platform/assets-node`)
- **Environment**: Node.js
- **Purpose**: File/http fetcher, filesystem cache, Node crypto, Buffer conversion, and Node compression codecs
- **Status**: Implemented

#### **@quajs/assets-memory** (`packages/platform/assets-memory`)
- **Environment**: Universal test/lightweight runtime
- **Purpose**: In-memory fetcher, storage, and crypto adapter for tests and embedded runtimes
- **Status**: Implemented

### Render Packages

#### **@quajs/render-core** (`packages/render/core`)
- **Environment**: Universal
- **Purpose**: Renderer event contracts, payload maps, readonly projection types, lifecycle intent types, and thin typed helpers over `@quajs/pipeline`
- **Includes**: Lightweight renderer plugin contracts and a plugin host that only wrap existing pipeline helpers
- **Status**: Implemented
- **Rules**:
  - Contains contracts and stateless helpers only
  - Must not become a renderer bridge, state manager, or second eventbus

#### **@quajs/renderer-web** (`packages/render/web`)
- **Environment**: Web/browser, framework-neutral
- **Purpose**: Shared Web renderer runtime foundation for native DOM projection and MVVM/framework adapters
- **Includes**: `QuaWebRendererController`, snapshot subscription APIs, renderer actions, object URL handles, animation projection helpers, native DOM renderer/layer utilities, React store adapter helpers, WebAudio runtime/controller under `./audio`, and renderer plugin sub-entries under `./plugins/*`
- **Status**: Implemented
- **Rules**:
  - Owns Web implementation details shared by framework renderers
  - Consumes engine-owned view projections and emits user intent events through `@quajs/pipeline`
  - May hold transient Web resources such as object URLs, DOM nodes, animation handles, WebAudio nodes, and cleanup disposers
  - Must not own authoritative game state or create a second renderer communication bus
  - Must stay framework-neutral; React/Vue/Svelte/etc. dependencies do not belong in the root package
  - Reusable DOM projection features must be split under `@quajs/renderer-web/plugins/*`
  - Optional feature dependencies should live in explicit sub-entries, such as `@quajs/renderer-web/audio` and `@quajs/renderer-web/plugins/audio`

#### **@quajs/renderer-vue** (`packages/render/vue`)
- **Environment**: Vue/Web
- **Purpose**: Stateless Vue adapter components, slots, projection layers, renderer plugin mounting, and composables over `@quajs/renderer-web`
- **Status**: Implemented
- **Rules**:
  - Depends on `@quajs/renderer-web` for shared Web lifecycle, renderer actions, asset URL handling, animation projection helpers, and WebAudio runtime
  - Projects framework-neutral Web renderer snapshots into Vue readonly refs and components
  - Emits user intent through pipeline events only
  - May keep Vue refs/component refs and framework cleanup handles, but no authoritative game state
  - Must not duplicate Web runtime behavior that belongs in `@quajs/renderer-web`
  - Does not auto-import preset styles; optional SCSS style entrypoints are explicit imports
  - `vue` is a peer dependency

#### **@quajs/renderer-react** (`packages/render/react`)
- **Environment**: React/Web
- **Purpose**: Stateless React renderer adapter, hook/context ergonomics, and feature plugin subentries over `@quajs/renderer-web`
- **Status**: Implemented
- **Rules**:
  - Depends on `@quajs/renderer-web` for shared Web lifecycle, renderer actions, asset URL handling, animation projection helpers, WebAudio runtime, and DOM feature plugin factories
  - Uses Web snapshot/subscribe APIs suitable for `useSyncExternalStore`
  - Emits user intent through pipeline events only
  - Keeps React refs/hooks cleanup transient and non-authoritative
  - `react` is a peer dependency

#### **@quajs/renderer-svelte** (`packages/render/svelte`)
- **Environment**: Svelte/Web
- **Purpose**: Stateless Svelte renderer adapter, store/action ergonomics, and feature plugin subentries over `@quajs/renderer-web`
- **Status**: Implemented
- **Rules**:
  - Depends on `@quajs/renderer-web` for shared Web lifecycle, renderer actions, asset URL handling, animation projection helpers, WebAudio runtime, and DOM feature plugin factories
  - Emits user intent through pipeline events only
  - Keeps Svelte stores/actions/component cleanup transient and non-authoritative
  - `svelte` is a peer dependency

### Build and Tooling Packages

#### **@quajs/quack** (`packages/build/quack`)
- **Environment**: Node.js
- **Purpose**: Asset processing and bundle generation, including QPK/ZIP output
- **Status**: Implemented

#### **@quajs/script-compiler** (`packages/build/script-compiler`)
- **Environment**: Node.js/build-time
- **Purpose**: QuaScript parsing and compilation into engine/character API calls and context-aware async steps
- **Status**: Implemented
- **Background rule**: Background decorators are supplied by `@quajs/plugin-background`; they are not compiler core built-ins.

#### **@quajs/vite-plugin** (`packages/build/vite-plugin`)
- **Environment**: Node.js/Vite
- **Purpose**: Vite integration for script compilation, engine wiring, and dev VFS integration through `@quajs/assets-web/vite`
- **Status**: Implemented

### Supporting Packages

#### **@quajs/logger** (`packages/utils`)
- **Environment**: Universal
- **Purpose**: Configurable scoped logging
- **Status**: Implemented

#### **@quajs/utils** and **@quajs/utils-common** (`packages/utils`, `packages/utils/common`)
- **Environment**: Universal
- **Purpose**: Shared utility functions and common helpers
- **Status**: Implemented

## Plugin Inventory

### Core Plugin Infrastructure

#### **@quajs/plugin-discovery** (`packages/core/plugin-discovery`)
- **Independence**: Standalone core workspace package outside `@quajs/engine`; it is discovery infrastructure, not a feature plugin.
- **Purpose**: Discovers plugin configs from `qua.plugins.json`, `plugins/qua.plugins.json`, and package dependencies that publish explicit Qua plugin metadata in `package.json#quajs`.
- **Current scope**: Provides plugin config discovery, decorator mapping extraction, language contribution extraction, plugin lookup, available plugin name listing, config validation, and decorator mapping merge helpers.
- **Status**: Implemented as core discovery infrastructure, not a feature plugin.

### Independent Feature Plugin Packages

#### **@quajs/plugin-background** (`packages/plugins/background`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides background image, video background, layered background, whole-background transitions, layer transitions, plugin API registration, and QuaScript decorator mappings.
- **Current scope**: Feature plugin that calls engine-owned projection APIs and keeps renderer state out of the logic layer.
- **Status**: Implemented as the first standalone feature plugin.

#### **@quajs/plugin-audio** (`packages/plugins/audio`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides audio projection state helpers, BGM/voice playback APIs, gain/EQ/automation controls, chapter-aware voice mapping, and QuaScript decorator mappings.
- **Current scope**: Feature plugin that owns engine-side audio intent projection only. Web decoding/playback is implemented by `@quajs/renderer-web/audio`, with renderer plugin entries declared for Web and framework adapters.
- **Status**: Implemented.

#### **@quajs/plugin-animation** (`packages/plugins/animation`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides reusable timeline animation APIs, active animation projection updates, target adapter resolution, and QuaScript decorator mappings.
- **Current scope**: Engine-owned animation projections are consumed by renderer projection helpers for background and character transforms. Renderers do not own animation authority.
- **Status**: Implemented.

#### **@quajs/plugin-sprite** (`packages/plugins/sprite`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides sprite manifest, expression diff resolution, atlas-aware rendering metadata, and hot-update/build helpers.
- **Current scope**: Sprite assets and expression metadata are projected by `@quajs/renderer-web/plugins/sprite` and framework adapter plugin subentries.
- **Status**: Implemented.

#### **@quajs/plugin-settings** (`packages/plugins/settings`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides scoped developer/player settings schemas, defaults, persistence bridge, renderer projection, and package-scoped settings contributions.
- **Current scope**: Feature plugin that owns engine-side settings projection and player-value persistence. Dynamic settings scopes may carry `packageId`; runtime package unload unregisters package-owned scopes while preserving stored player values.
- **Status**: Implemented.

#### **@quajs/plugin-backlog** (`packages/plugins/backlog`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides dialogue/choice backlog recording, retention, rewind checkpoints, and optional voice replay references.
- **Current scope**: Feature plugin that records engine-owned story/checkpoint context. Runtime content entries carry required package metadata so rewind and voice replay can ensure dependencies before use.
- **Status**: Implemented.

#### **@quajs/plugin-gallery** (`packages/plugins/gallery`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides explicit gallery catalog registration, a reserved gallery scene shell, persistent unlock profiles, and renderer intent contracts.
- **Current scope**: Feature plugin that keeps catalog definitions and runtime view state in engine-owned projection while storing long-lived unlock progress in an independent QuaStore profile snapshot. Runtime package gallery definitions are package-aware and removable without rolling back unlock records.
- **Status**: Implemented with optional `@quajs/renderer-web/plugins/gallery` and framework adapter plugin subentries.

#### **@quajs/plugin-inventory** (`packages/plugins/inventory`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides programmatic inventory category/item catalog registration, profile-persistent item quantities, projection helpers, pipeline events, and QuaScript decorator mappings.
- **Current scope**: Feature plugin with no renderer UI. Definitions live in plugin runtime state; profile records live in a `QuaStore` snapshot keyed by `@quajs/plugin-inventory:profile:<profileId>` and are not restored by story save/load/rollback. Runtime package unload removes package-owned definitions while preserving profile records.
- **Status**: Implemented.

### Plugin Systems Inside Existing Packages

#### **Engine Plugin Framework** (`packages/core/engine/src/plugins`)
- **Package shape**: Internal to `@quajs/engine`, not an independent plugin package.
- **Includes**: `BaseEnginePlugin`, `PluginFramework`, plugin context, plugin API registry, plugin package discovery/spec helpers, and `UiOverlayPlugin`.
- **Current built-in plugin**: `UiOverlayPlugin`, which maps generic renderer UI requests to engine-owned `view.ui.overlays`.
- **Boundary rule**: Keep engine core free of concrete UX features. Future feature plugins should move out to independent packages when they are not required for narrative execution or state authority.

#### **Pipeline Plugins** (`packages/core/pipeline`)
- **Package shape**: `@quajs/pipeline` provides plugin hooks for event transport.
- **Includes**: `Plugin` base class plus emit/on/off hook types for custom transports or interception.
- **Current examples**: WebSocket transport example under `packages/core/pipeline/examples`.
- **Boundary rule**: Pipeline plugins may alter transport mechanics, but must not become a second renderer communication system.

#### **Renderer Plugins** (`packages/render/core`, `packages/render/web`, `packages/render/vue/src/plugins`, `packages/render/react/src/plugins`, `packages/render/svelte/src/plugins`)
- **Package shape**: Contracts live in `@quajs/render-core`; shared Web layer/runtime helpers live in `@quajs/renderer-web`; framework packages expose thin feature subentry adapters over Web factories.
- **Includes**: `RendererPlugin`, `RendererPluginContext`, `RendererPluginHost`, Web DOM layer helpers under `@quajs/renderer-web/plugins/*`, React-compatible store adapter helpers, WebAudio plugin wiring under `@quajs/renderer-web/plugins/audio`, Vue UI overlay components under `@quajs/renderer-vue/plugins/ui`, and React/Svelte wrapper entries for the same DOM feature set.
- **Current feature scope**: Input, fonts, background, sprite, character, effects, dialogue, choices, audio, scene, UI, settings, backlog, gallery, and achievement projection layers. Menu/settings/save-load panels are optional components over generic overlay state, not engine-core concepts.
- **Boundary rule**: Put reusable Web renderer behavior in `@quajs/renderer-web`; keep framework packages focused on framework adapters and presentation ergonomics.

#### **Quack Build-Time Plugins** (`packages/build/quack/src/plugins`)
- **Package shape**: Internal to `@quajs/quack`, not independent runtime plugin packages.
- **Includes**: bundle analyzer, image optimization, encryption helpers, and related build-time extension points.
- **Scope**: Build-time asset processing only. These do not run as engine/runtime plugins.

### Independent Feature Plugins Not Yet Present
- Standalone feature plugin packages still missing include dedicated `@quajs/plugin-ui` and `@quajs/plugin-save-load` packages if those concepts need logic-layer behavior beyond the existing generic UI overlay and renderer panels.
- When added, feature plugins should live under `packages/plugins/*` or another explicit plugin package group and should integrate through engine/render-core/pipeline contracts instead of mutating renderer state or extending engine core with product-specific UI semantics.

## Development Infrastructure

### Build System
- **Monorepo**: pnpm workspaces + Turborepo for package management and task orchestration
- **TypeScript**: Full type safety across all packages
- **Vite**: Fast build tool with environment-specific configurations
- **Environment Targeting**:
  - Core packages: Platform-neutral where possible; platform behavior is injected through adapters
  - Platform packages: Web, Node.js, or Memory-specific implementations
  - Render packages: Contracts are universal; concrete renderer packages target their UI runtime
  - Build packages: Node.js tooling

### Package Creation
- **Automated Setup**: Environment-aware package scaffolding
- **Environment Selection**: Node.js only, Browser only, or Universal
- **Consistent Configuration**: TypeScript, Vite, and build settings
- **Package-local organization**: Every package should keep a clear, intentional `src/` subdirectory layout that matches its responsibilities instead of accumulating unrelated files in the package root or a single flat source folder.

### Runtime Package Development Standard
- **Use the project skill**: For Runtime Package work, use `.codex/skills/quaengine-runtime-packages` and read `docs/design/dynamic-runtime-qpk.md` before changing manifests, loaders, lifecycle, plugins, or tests.
- **Follow the full pipeline**: Runtime content changes should move through manifest shape, Quack output, QuaAssets mounting/ranking, `RuntimeContentManager` activation, feature plugin adaptation, renderer plugin publication, and save/load coverage together.
- **Keep provenance explicit**: Any new story point, checkpoint, backlog entry, voice reference, view projection, animation fill state, audio track, sprite/background diff, or plugin projection created by runtime content must record `contentPackageId` and merge `requiredRuntimePackages` when cross-package composition exists.
- **Protect player state**: Runtime packages may add defaults or schema through declared idempotent migrations. They must not silently overwrite player progress, choices, settings, current scene state, or existing persisted values.
- **Guard unload by default**: A package referenced by active story, checkpoint metadata, package dependencies, view projections, audio, animation, or plugin state must not unload unless explicitly forced after moving or clearing dependent state.
- **Test same-scene continuation**: Any Runtime Package change that touches story flow or projections must cover multiple QPKs continuing the same scene/timeline/lane/route and must verify read progress, save/load, unload, animation, audio, sprite, and background behavior.
- **Keep platform boundaries**: Engine/core packages may enforce policy and lifecycle, but JS bytes, dynamic `import()`, object URLs, WebCrypto, DOM cleanup, and WebAudio implementation stay in injected loaders or Web/platform packages.

## Future Roadmap

### Phase 1: Logic Layer Foundation
- [x] Store package with snapshot system
- [x] Logger and utils packages
- [x] Build system and tooling
- [x] Core engine architecture
- [x] Platform-agnostic asset runtime core
- [x] Web, Node, and Memory asset adapters
- [x] Quack bundler development

### Phase 2: Render Layer Interface
- [x] Event contract design through `@quajs/render-core`
- [x] Render layer API specification
- [x] Framework-neutral Web renderer runtime
- [x] Vue reference renderer adapter implementation
- [x] React renderer adapter implementation
- [x] Svelte renderer adapter implementation
- [x] Plugin architecture

### Phase 3: Ecosystem & Tools
- [ ] Visual editor for game creation
- [ ] Plugin marketplace
- [ ] Documentation and tutorials
- [ ] Community tools and templates

## Design Principles

### 🔄 **Decoupled Architecture**
Logic and render layers communicate only through well-defined events, enabling:
- Independent development cycles
- Technology stack flexibility  
- Easier testing and debugging
- Multiple render implementations (Web, Native, Console)

### 📦 **Package-First Design**
Each package is:
- Self-contained with clear responsibilities
- Independently versioned and deployable
- Thoroughly typed with TypeScript
- Environment-appropriate (Node.js, Browser, or Universal)

### 🎯 **Developer Experience**
- Type-safe APIs across all packages
- Hot module replacement in development
- Comprehensive logging and debugging tools
- Visual development tools and editors

### ⚡ **Performance-Oriented**
- Lazy loading and code splitting
- Efficient asset management
- Memory-conscious state management
- Optimized builds for production

## Engineering Rules

### Active Development: No Legacy Compatibility
- All QuaEngine packages, APIs, file layouts, schemas, examples, and docs are currently in active development until a formal public release establishes compatibility guarantees.
- Prioritize the clean current architecture over backward compatibility. Do not preserve old internal behavior simply because it existed before.
- Do not keep deprecated APIs, legacy aliases, migration adapters, compatibility branches, fallback paths, or dual old/new implementations.
- When changing an API or internal contract, update all in-repo call sites, tests, examples, and docs directly to the new shape.
- Remove legacy code as part of the change that makes it obsolete. Prefer deletion and direct replacement over wrappers or compatibility layers.
- Keep code simple and explicit. Avoid abstractions, indirection, feature flags, or optional compatibility switches unless they serve the current intended architecture.
- Backward compatibility becomes a requirement only after the project starts publishing formal release versions with public compatibility guarantees.

### Package Structure Discipline
- Every package must have a reasonable package-local directory structure under `src/` that reflects its responsibility boundaries.
- Avoid dumping unrelated modules into a flat `src/` folder. Split by domain or layer, such as `core/`, `runtime/`, `contracts/`, `adapters/`, `plugins/`, `integrations/`, `components/`, `composables/`, `styles/`, `utils/`, or `test-helpers/` when those boundaries exist.
- Keep package roots focused on package metadata, build config, README/docs, and public entry files. Runtime implementation belongs under `src/`.
- Keep public exports intentional through `src/index.ts` and explicit sub-entry files. Do not expose internal modules accidentally because of directory convenience.
- Do not create generic folders such as `misc`, `legacy`, `old`, `new`, or `temp`. If code no longer fits the intended structure, move or remove it.
- Package structure should stay proportional: small packages may stay compact, but growing packages must be split before files become catch-all modules.

### Commit Message Convention
- All git commit messages must use the exact scoped format `<type>(<component>): <description>`.
- This is a hard development rule for every commit created in this repository; unscoped messages such as `feat: desc` or free-form messages such as `update files` are not allowed.
- `type` must be lowercase and should be a conventional commit verb such as `feat`, `fix`, `refactor`, `docs`, `test`, or `chore`.
- `component` must be present and should name the primary package or subsystem affected, such as `sprite`, `renderer-vue`, `plugin-discovery`, `deps`, or `docs`.
- Keep the description concise, imperative, and lowercase unless a proper noun is required.
- Valid examples: `feat(sprite): add expression diff manifest`, `chore(deps): enforce peer dependency coupling`, `docs(agents): require scoped commit messages`.

### QuaEngine Architecture Guardrails
- Renderer code must stay stateless for any engine-owned capability. Treat the renderer as a projection canvas: consume pipeline events and engine view state, then draw. Do not let renderer code own authoritative game state or decide progression.
- Engine and build-time packages must keep feature implementations package-local. Decorators, runtime helpers, and Vite integration for a feature belong to that package or its explicit sub-entry, not to `@quajs/engine` or `@quajs/script-compiler` as a central bucket.
- Engine/core packages must not depend on Web APIs directly. If a feature needs browser behavior, move it behind an adapter, abstraction, or pipeline payload so the renderer can perform the real Web-side implementation.
- When a change crosses package boundaries, keep the cross-package contract minimal and explicit: export mappings, contracts, or metadata, not the whole implementation.

### Rendering Layout And Coordinate Development Standard
- Treat `QuaViewProjection.layout` as the single source of truth for project orientation, base logical dimensions, fixed scene aspect ratio, content safe-area bounds, and scale mode.
- The default presets are part of the project contract: `landscape` is a fixed `1920x1080` / `16:9` scene; `portrait` is a fixed `1080x2340` / `9:19.5` scene. Do not use landscape coordinates for portrait.
- The renderer must contain the fixed scene ratio inside its measured parent, center it, and render unmatched horizontal or vertical space as black bars. Viewport size, logical width, scale, safe area, and hit-test conversion must come from the same resolved layout so visuals, input, and animation agree on every device.
- All new or refactored coordinate-bearing APIs must document their unit. The default and preferred unit is logical stage pixels. If an API uses percentages, normalized ratios, anchors, UV space, asset-local pixels, or CSS units, that unit must be visible in the type/name/docs and converted to logical stage space before game-facing projection.
- Never mix viewport CSS pixels with logical stage coordinates in engine, plugins, script compiler output, or animation definitions. CSS pixels may appear only in renderer implementation code after layout resolution.
- Do not hard-code `window.innerWidth`, `window.innerHeight`, `100vw`, `100vh`, `100dvh`, or device-pixel measurements for in-stage UI, character placement, effects, or plugin projection. Use `layout`, resolved stage helpers, stage-relative percentages, logical pixels, and `--qua-layout-*` CSS variables.
- Keep cross-device composition safe by placing important UI and default subject staging inside the safe area. Full-stage backgrounds and effects may use the complete fixed logical scene.
- Hit-testing and pointer coordinates that are sent through pipeline payloads must be converted from client/screen pixels into logical stage coordinates before emission. Pipeline events should not expose raw browser coordinates unless the event explicitly says so.
- Renderer and renderer-plugin code should call framework-neutral helpers from `@quajs/renderer-web` for layout resolving, coordinate conversion, and mobile viewport environment changes. Framework adapters may expose ergonomic slots/composables, but they must not fork layout math.
- Tests for coordinate-sensitive behavior should cover fixed landscape and portrait ratios, horizontal and vertical letterboxing, a parent-only container resize, and one portrait phone reference such as `360x780`. Add pointer conversion coverage when a feature emits coordinates and visual viewport coverage when container sizing can change on mobile.
- See `docs/design/mobile-rendering-adaptation.md` for formulas, device examples, and package-by-package responsibilities.

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm (configured via corepack)

### Development Setup
```bash
# Clone and install dependencies
pnpm install

# Build all packages
pnpm run build

# Create a new package
pnpm run create-package

# Development mode
pnpm run dev
```

### Package Structure
```
packages/
├── build/
│   ├── create-qua-game/    # create-qua-game starter scaffolding
│   ├── language-server/    # @quajs/language-server
│   ├── project-inspector/  # @quajs/project-inspector
│   ├── quack/              # @quajs/quack asset bundler
│   ├── script-compiler/    # @quajs/script-compiler
│   ├── vite-plugin/        # @quajs/vite-plugin
│   └── vscode-quascript/   # QuaScript VS Code extension
├── core/
│   ├── assets/             # @quajs/assets platform-agnostic core
│   ├── engine/             # @quajs/engine authoritative logic runtime
│   ├── pipeline/           # @quajs/pipeline eventbus
│   ├── plugin-discovery/   # @quajs/plugin-discovery core discovery infrastructure
│   └── store/              # @quajs/store state and snapshots
├── game/
│   ├── character/          # @quajs/character game-facing character APIs
│   └── story-graph/        # @quajs/story-graph story metadata helpers
├── platform/
│   ├── assets-memory/      # @quajs/assets-memory adapter
│   ├── assets-node/        # @quajs/assets-node adapter
│   ├── assets-web/         # @quajs/assets-web adapter
│   ├── security-web/       # @quajs/security-web runtime trust/CSP helpers
│   ├── store-node/         # @quajs/store-node storage adapter
│   └── store-web/          # @quajs/store-web storage adapter
├── plugins/
│   ├── achievement/        # @quajs/plugin-achievement
│   ├── animation/          # @quajs/plugin-animation
│   ├── audio/              # @quajs/plugin-audio
│   ├── background/         # @quajs/plugin-background
│   ├── backlog/            # @quajs/plugin-backlog
│   ├── fonts/              # @quajs/plugin-fonts
│   ├── gallery/            # @quajs/plugin-gallery
│   ├── inventory/          # @quajs/plugin-inventory
│   ├── settings/           # @quajs/plugin-settings
│   └── sprite/             # @quajs/plugin-sprite
├── render/
│   ├── core/               # @quajs/render-core contracts/helpers
│   ├── react/              # @quajs/renderer-react
│   ├── svelte/             # @quajs/renderer-svelte
│   ├── web/                # @quajs/renderer-web framework-neutral Web runtime
│   └── vue/                # @quajs/renderer-vue
└── utils/
    ├── common/             # @quajs/utils-common
    └── ...                 # @quajs/utils and logger helpers
```

## Contributing

QuaEngine is designed to be a community-driven project. We welcome contributions in:

- **Core Development**: Engine features and optimizations
- **Plugin Development**: Extending engine capabilities  
- **Documentation**: Tutorials, examples, and guides
- **Tooling**: Development tools and utilities
- **Testing**: Ensuring quality and reliability

## Vision

Our goal is to create the most developer-friendly and flexible visual novel engine, enabling creators to focus on storytelling while the engine handles the technical complexity. By maintaining clean separation between logic and rendering, QuaEngine will support diverse platforms and use cases, from traditional web-based visual novels to mobile apps and desktop applications.

---

*QuaEngine - Empowering Visual Novel Creators with Modern TypeScript Architecture*
