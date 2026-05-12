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
- **Renderer Web plugin sub-entries**: Reusable DOM projection features in `@quajs/renderer-web` must be split under `@quajs/renderer-web/plugins/*` (`background`, `sprite`, `character`, `dialogue`, `choices`, `effects`, `ui`, `audio`, and `preset`) instead of being kept as a monolithic Web renderer module.
- **No implicit renderer styling**: Official renderers provide semantic DOM, stable class names, data attributes, slots, composables, and resource wiring by default. They must not auto-import visual CSS. They may ship optional SCSS style entrypoints such as base/reset styles and a default theme, but users must import them explicitly.
- **Plugin-first non-core features**: Features that are not required for narrative execution, state authority, asset access, or pipeline communication must be engine plugins. Main menu, settings panels, save/load UI flows, gallery, backlog, history, achievements, and similar UX systems must not be hardwired into engine core.
- **Renderer plugin architecture**: Renderer implementations must be built as core + optional plugins. Renderer plugins may subscribe/emit through `@quajs/pipeline` helpers and manage implementation resources, but they must not create a second eventbus or own authoritative game state.

## Current Implementation Status

The current milestone implements the logic layer, stateless renderer contracts, framework-neutral Web renderer runtime, Vue reference adapter, and platform-split asset runtime.

### Implementation Progress Snapshot

#### Completed Foundations
- **Workspace structure**: The repo is organized around `build`, `core`, `platform`, `plugins`, `render`, and `utils` package groups.
- **Single eventbus contract**: `@quajs/pipeline` remains the only eventbus. Renderer communication uses `@quajs/render-core` typed contracts and thin helpers over pipeline.
- **Engine-owned state**: `@quajs/engine` owns runtime, view, UI overlay, character/dialogue/choice, and audio intent state. Renderers project this state and send user intent events only.
- **Background feature boundary**: Background is a feature plugin, not engine/global script API. Engine core only exposes the low-level `setBackgroundProjection` state write path used by plugins.
- **Scene lifecycle**: `SceneManager` is the engine-owned scene lifecycle implementation. `GameManager` is a high-level facade and does not duplicate scene logic.
- **Audio boundary**: `SoundSystem` stores audio intent in engine state. Real DOM audio playback lives in renderer implementations; `audio/ended` returns to engine through pipeline.
- **Web audio autoplay boundary**: `@quajs/renderer-web/audio` may attempt to unlock WebAudio automatically when engine-owned audio projection requests playback. Browser autoplay policy blocks are expected Web runtime behavior, must not be emitted as engine audio errors, and should keep sources pending until a configured user activation event unlocks the `AudioContext`. Emit `audio/unlocked` only after the context is actually running.
- **No pre-release compatibility burden**: Deprecated aliases, legacy renderer communication, and old Web-only asset assumptions should be removed instead of preserved.

#### Completed Asset Runtime
- **`@quajs/assets` core** is platform-agnostic and bytes-first. It exposes `AssetData`, storage/provider/fetcher/crypto/codec contracts, bundle loading, patching, preloading, text/JSON helpers, and provider change events.
- **Web APIs are out of core**. `Blob`, `fetch`, IndexedDB/Dexie, WebCrypto, object URLs, and dev VFS implementation belong to `@quajs/assets-web`.
- **Adapters implemented**:
  - `@quajs/assets-web`: Fetch, IndexedDB/Dexie storage, WebCrypto hashing, Blob/object URL helpers, dev VFS provider, and Vite dev VFS helpers.
  - `@quajs/assets-node`: fs/http fetcher, filesystem cache, Node crypto, Buffer conversion, and Node compression codec integration.
  - `@quajs/assets-memory`: in-memory fetcher/storage/crypto for tests and embedded/lightweight runtimes.
- **Vite dev asset flow**: `@quajs/vite-plugin` wires dev VFS through `@quajs/assets-web/vite`; the plugin no longer owns a duplicate VFS implementation.

#### Completed Engine And Script Flow
- **`@quajs/render-core`** defines shared render event enums, payload maps, readonly view projection types, typed emit/on/wait helpers, and lightweight renderer plugin contracts.
- **`@quajs/engine`** re-exports render contracts for app ergonomics and exposes runtime accessors such as assets, pipeline, store, view state, and `waitFor`.
- **Store mutations** cover runtime/view/audio intent changes used by scene, dialogue, choices, characters, background projection, UI overlays, and audio.
- **`@quajs/character`** provides character/dialogue convenience APIs that update engine-owned state and emit pipeline events without holding renderer state.
- **`@quajs/plugin-background`** provides background image, video background, layered background, background transition, and layer transition APIs/decorators that write engine-owned projection state.
- **QuaScript compiler** parses dialogue and choice blocks, compiles context-aware async steps, routes dialogue/choice output through engine APIs, routes background decorators through `@quajs/plugin-background`, waits for renderer user intent events, and stores the selected choice on step context.

#### Completed Renderer
- **`@quajs/renderer-web` Web runtime base** is framework-neutral. It owns Web renderer lifecycle control, snapshot subscriptions, renderer actions, object URL handles, animation projection helpers, native DOM projection utilities, WebAudio runtime/controller primitives, split DOM plugin sub-entries, and React-compatible store adapters.
- **`@quajs/renderer-vue` root renderer** is stateless with respect to game state and is now a Vue adapter over `@quajs/renderer-web`. It accepts pipeline/assets/view inputs, projects Web renderer snapshots into Vue readonly refs, emits renderer lifecycle/user intent events through the shared Web actions, and cleans up subscriptions/resources on unmount.
- **Projection components implemented**: Vue `QuaRenderer`, `QuaStage`, image/video/layered background, character/dialogue/choice/audio/effect/overlay layers, low-level projection components, plus optional native DOM projection layers in `@quajs/renderer-web`.
- **Composables implemented**: `useQuaRenderer`, `useQuaPipeline`, `useQuaView`, `useBackground`, `useCharacters`, `useDialogue`, `useChoices`, `useAudio`, `useEffects`, `useRendererActions`, `useAssetUrl`, and `useAudioAsset`, with shared Web object URL handling delegated to `@quajs/renderer-web`.
- **Renderer UI plugin sub-entry**: `@quajs/renderer-vue/plugins/ui` provides `QuaUiOverlay`, `QuaMenuOverlay`, `QuaSaveLoadPanel`, and `QuaSettingsPanel` as optional renderer-plugin UI components. These read generic engine-owned overlays and do not introduce menu/settings state into renderer core.
- **Styling boundary**: Vue renderer does not auto-import visual styles. Optional SCSS entrypoints are `@quajs/renderer-vue/styles/base.scss` and `@quajs/renderer-vue/styles/default.scss`.

#### Completed Build Tooling
- **`@quajs/quack`** provides asset detection, metadata, media extraction, QPK/ZIP bundling, workspace versioning, patch generation, and build-time bundler plugins.
- **`@quajs/script-compiler`** provides QuaScript parser/transformer, HMR integration, plugin-aware transformation, and Vite compiler integration.
- **`@quajs/vite-plugin`** integrates engine wiring, script compilation, asset bundling, and dev VFS.

#### Current Gaps / Next Milestones
- **Additional feature plugin packages are still pending**. Main menu behavior, settings logic, save/load UI flows, backlog/history, gallery, achievements, inventory, and similar features should become independent engine/renderer plugin packages or package sub-entries instead of engine-core features.
- **Renderer plugin ecosystem is early**. The contracts, Web renderer plugin layer shape, native DOM layer helpers, Web `plugins/*` sub-entries, and Vue UI plugin sub-entry exist, but standalone renderer plugin packages beyond package sub-entries are still pending.
- **Example app/editor/documentation are still pending**. The engine/runtime foundations exist, but creator-facing examples, visual editor, templates, and full tutorials remain future work.
- **Native/non-Web renderers and native asset adapters are not implemented**. Current official platform adapters are Web, Node, and Memory; current official Web rendering stack is `@quajs/renderer-web` plus framework adapters such as `@quajs/renderer-vue`.

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

#### **@quajs/character** (`packages/core/character`)
- **Environment**: Platform-neutral logic helper
- **Purpose**: Character, sprite, expression, movement, and dialogue APIs that update engine-owned state and emit pipeline events
- **Status**: Implemented
- **Rules**:
  - Must not keep renderer state
  - Must route game-facing changes through engine/store APIs

#### **@quajs/plugin-background** (`packages/plugins/background`)
- **Environment**: Platform-neutral engine feature plugin
- **Purpose**: Background image, video background, layered background, and transition APIs/decorators
- **Status**: Implemented
- **Decorators**: `@SetBackground`, `@ClearBackground`, `@VideoBackground`, `@SetLayeredBackground`, `@BackgroundLayer`, `@RemoveBackgroundLayer`, `@ClearBackgroundLayers`, `@BackgroundTransition`, and `@BackgroundLayerTransition`
- **Rules**:
  - Owns no renderer state
  - Writes only engine-owned background projection state through `setBackgroundProjection`
  - Renderer remains a DOM projection of `view.background`

#### **@quajs/store** (`packages/core/store`)
- **Environment**: Browser-compatible state package with pluggable persistence
- **Purpose**: Global state management, persistence backends, and snapshot system
- **Status**: Implemented

#### **@quajs/pipeline** (`packages/core/pipeline`)
- **Environment**: Universal
- **Purpose**: The only eventbus used between engine, scripts, plugins, and renderers
- **Status**: Implemented

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
- **Current scope**: Feature plugin that owns engine-side audio intent projection only. Web decoding/playback is implemented by `@quajs/renderer-web/audio`, with renderer entries declared for both Web and Vue adapters.
- **Status**: Implemented.

#### **@quajs/plugin-animation** (`packages/plugins/animation`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides reusable timeline animation APIs, active animation projection updates, target adapter resolution, and QuaScript decorator mappings.
- **Current scope**: Engine-owned animation projections are consumed by renderer projection helpers for background and character transforms. Renderers do not own animation authority.
- **Status**: Implemented.

#### **@quajs/plugin-sprite** (`packages/plugins/sprite`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides sprite manifest, expression diff resolution, atlas-aware rendering metadata, and hot-update/build helpers.
- **Current scope**: Sprite assets and expression metadata are projected by `@quajs/renderer-web/plugins/sprite` and framework adapters such as `@quajs/renderer-vue/plugins/sprite`.
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

#### **Renderer Plugins** (`packages/render/core`, `packages/render/web`, `packages/render/vue/src/plugins`)
- **Package shape**: Contracts live in `@quajs/render-core`; shared Web layer/runtime helpers live in `@quajs/renderer-web`; current Vue plugin UI components are a sub-entry of `@quajs/renderer-vue`, not a standalone workspace package.
- **Includes**: `RendererPlugin`, `RendererPluginContext`, `RendererPluginHost`, Web DOM layer helpers under `@quajs/renderer-web/plugins/*`, React-compatible store adapter helpers, WebAudio plugin wiring under `@quajs/renderer-web/plugins/audio`, and Vue UI overlay components under `@quajs/renderer-vue/plugins/ui`.
- **Current feature scope**: Generic UI overlay projection only. Menu/settings/save-load panels are optional components over generic overlay state, not engine-core concepts.
- **Boundary rule**: Put reusable Web renderer behavior in `@quajs/renderer-web`; keep framework packages focused on framework adapters and presentation ergonomics.

#### **Quack Build-Time Plugins** (`packages/build/quack/src/plugins`)
- **Package shape**: Internal to `@quajs/quack`, not independent runtime plugin packages.
- **Includes**: bundle analyzer, image optimization, encryption helpers, and related build-time extension points.
- **Scope**: Build-time asset processing only. These do not run as engine/runtime plugins.

### Independent Feature Plugins Not Yet Present
- Standalone feature plugin packages still missing include `@quajs/plugin-ui`, `@quajs/plugin-save-load`, `@quajs/plugin-settings`, `@quajs/plugin-backlog`, `@quajs/plugin-gallery`, and achievement/inventory plugins.
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
│   ├── quack/              # @quajs/quack asset bundler
│   ├── script-compiler/    # @quajs/script-compiler
│   └── vite-plugin/        # @quajs/vite-plugin
├── core/
│   ├── assets/             # @quajs/assets platform-agnostic core
│   ├── character/          # @quajs/character engine-owned character APIs
│   ├── engine/             # @quajs/engine authoritative logic runtime
│   ├── pipeline/           # @quajs/pipeline eventbus
│   ├── plugin-discovery/   # @quajs/plugin-discovery core discovery infrastructure
│   ├── store/              # @quajs/store state and snapshots
│   └── story-graph/        # @quajs/story-graph story metadata helpers
├── platform/
│   ├── assets-memory/      # @quajs/assets-memory adapter
│   ├── assets-node/        # @quajs/assets-node adapter
│   └── assets-web/         # @quajs/assets-web adapter
├── plugins/
│   ├── animation/          # @quajs/plugin-animation
│   ├── audio/              # @quajs/plugin-audio
│   ├── background/         # @quajs/plugin-background
│   ├── backlog/            # @quajs/plugin-backlog
│   └── sprite/             # @quajs/plugin-sprite
├── render/
│   ├── core/               # @quajs/render-core contracts/helpers
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
