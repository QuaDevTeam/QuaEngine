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
- **No implicit renderer styling**: Official renderers provide semantic DOM, stable class names, data attributes, slots, composables, and resource wiring by default. They must not auto-import visual CSS. They may ship optional SCSS style entrypoints such as base/reset styles and a default theme, but users must import them explicitly.
- **Plugin-first non-core features**: Features that are not required for narrative execution, state authority, asset access, or pipeline communication must be engine plugins. Main menu, settings panels, save/load UI flows, gallery, backlog, history, achievements, and similar UX systems must not be hardwired into engine core.
- **Renderer plugin architecture**: Renderer implementations must be built as core + optional plugins. Renderer plugins may subscribe/emit through `@quajs/pipeline` helpers and manage implementation resources, but they must not create a second eventbus or own authoritative game state.

## Current Implementation Status

The current milestone implements the logic layer, stateless renderer contracts, Vue reference renderer, and platform-split asset runtime.

### Implementation Progress Snapshot

#### Completed Foundations
- **Workspace structure**: The repo is organized around `build`, `core`, `platform`, `plugins`, `render`, and `utils` package groups.
- **Single eventbus contract**: `@quajs/pipeline` remains the only eventbus. Renderer communication uses `@quajs/render-core` typed contracts and thin helpers over pipeline.
- **Engine-owned state**: `@quajs/engine` owns runtime, view, UI overlay, character/dialogue/choice, and audio intent state. Renderers project this state and send user intent events only.
- **Background feature boundary**: Background is a feature plugin, not engine/global script API. Engine core only exposes the low-level `setBackgroundProjection` state write path used by plugins.
- **Scene lifecycle**: `SceneManager` is the engine-owned scene lifecycle implementation. `GameManager` is a high-level facade and does not duplicate scene logic.
- **Audio boundary**: `SoundSystem` stores audio intent in engine state. Real DOM audio playback lives in renderer implementations; `audio/ended` returns to engine through pipeline.
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
- **`@quajs/renderer-vue` root renderer** is stateless with respect to game state. It accepts `engine` or explicit `{ pipeline, getViewState, assets }`, subscribes to pipeline updates, re-reads engine view state, emits renderer lifecycle/user intent events, and cleans up subscriptions/resources on unmount.
- **Projection components implemented**: `QuaRenderer`, `QuaStage`, image/video/layered background, character/dialogue/choice/audio/effect/overlay layers, and low-level projection components.
- **Composables implemented**: `useQuaRenderer`, `useQuaPipeline`, `useQuaView`, `useBackground`, `useCharacters`, `useDialogue`, `useChoices`, `useAudio`, `useEffects`, `useRendererActions`, `useAssetUrl`, and `useAudioAsset`.
- **Renderer UI plugin sub-entry**: `@quajs/renderer-vue/plugins/ui` provides `QuaUiOverlay`, `QuaMenuOverlay`, `QuaSaveLoadPanel`, and `QuaSettingsPanel` as optional renderer-plugin UI components. These read generic engine-owned overlays and do not introduce menu/settings state into renderer core.
- **Styling boundary**: Vue renderer does not auto-import visual styles. Optional SCSS entrypoints are `@quajs/renderer-vue/styles/base.scss` and `@quajs/renderer-vue/styles/default.scss`.

#### Completed Build Tooling
- **`@quajs/quack`** provides asset detection, metadata, media extraction, QPK/ZIP bundling, workspace versioning, patch generation, and build-time bundler plugins.
- **`@quajs/script-compiler`** provides QuaScript parser/transformer, HMR integration, plugin-aware transformation, and Vite compiler integration.
- **`@quajs/vite-plugin`** integrates engine wiring, script compilation, asset bundling, and dev VFS.

#### Current Gaps / Next Milestones
- **Additional feature plugin packages are still pending**. Main menu behavior, settings logic, save/load UI flows, backlog/history, gallery, achievements, inventory, and similar features should become independent engine/renderer plugin packages or package sub-entries instead of engine-core features.
- **Renderer plugin ecosystem is early**. The contracts and Vue UI plugin sub-entry exist, but there are no standalone renderer plugin packages beyond the Vue package sub-entry.
- **Example app/editor/documentation are still pending**. The engine/runtime foundations exist, but creator-facing examples, visual editor, templates, and full tutorials remain future work.
- **Native/non-Web renderers and native asset adapters are not implemented**. Current official platform adapters are Web, Node, and Memory; current official renderer is Vue/Web.

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

#### **@quajs/renderer-vue** (`packages/render/vue`)
- **Environment**: Vue/Web
- **Purpose**: Stateless Vue renderer components, slots, DOM projection layers, audio controller implementation, renderer plugin mounting, and composables
- **Status**: Implemented
- **Rules**:
  - Accepts engine or explicit `{ pipeline, getViewState, assets }`
  - Re-reads engine-owned view state or projects event payloads
  - Emits user intent through pipeline events only
  - May keep DOM/object URL/audio element implementation state, but no authoritative game state
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

### Independent Plugin-Related Packages

#### **@quajs/plugin-discovery** (`packages/plugins/plugin-discovery`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Discovers plugin configs from `qua.plugins.json`, `plugins/qua.plugins.json`, `.qua/plugins.json`, and package dependencies matching Qua plugin naming conventions.
- **Current scope**: Provides plugin config discovery, decorator mapping extraction, plugin lookup, available plugin name listing, config validation, and decorator mapping merge helpers.
- **Status**: Implemented as discovery infrastructure, not a feature plugin.

#### **@quajs/plugin-background** (`packages/plugins/background`)
- **Independence**: Standalone workspace package outside `@quajs/engine`.
- **Purpose**: Provides background image, video background, layered background, whole-background transitions, layer transitions, plugin API registration, and QuaScript decorator mappings.
- **Current scope**: Feature plugin that calls engine-owned projection APIs and keeps renderer state out of the logic layer.
- **Status**: Implemented as the first standalone feature plugin.

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

#### **Renderer Plugins** (`packages/render/core`, `packages/render/vue/src/plugins`)
- **Package shape**: Contracts live in `@quajs/render-core`; current Vue plugin UI components are a sub-entry of `@quajs/renderer-vue`, not a standalone workspace package.
- **Includes**: `RendererPlugin`, `RendererPluginContext`, `RendererPluginHost`, and Vue UI overlay components under `@quajs/renderer-vue/plugins/ui`.
- **Current feature scope**: Generic UI overlay projection only. Menu/settings/save-load panels are optional components over generic overlay state, not engine-core concepts.

#### **Quack Build-Time Plugins** (`packages/build/quack/src/plugins`)
- **Package shape**: Internal to `@quajs/quack`, not independent runtime plugin packages.
- **Includes**: bundle analyzer, image optimization, encryption helpers, and related build-time extension points.
- **Scope**: Build-time asset processing only. These do not run as engine/runtime plugins.

### Independent Feature Plugins Not Yet Present
- Standalone feature plugin packages still missing include `@quajs/plugin-audio`, `@quajs/plugin-ui`, `@quajs/plugin-save-load`, `@quajs/plugin-settings`, `@quajs/plugin-backlog`, `@quajs/plugin-gallery`, and achievement/inventory plugins.
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
- [x] Vue reference renderer implementation
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

### No Backward Compatibility Before Release
- QuaEngine has not shipped a formal public release yet, so implementation should prioritize clean current architecture over backward compatibility.
- Do not keep deprecated APIs, legacy aliases, migration adapters, compatibility branches, or fallback code only for old internal behavior.
- When changing an API or internal contract, update all in-repo call sites and tests directly instead of preserving the previous shape.
- Remove compatibility code when it is no longer part of the intended design.
- Backward compatibility becomes a requirement only after the project starts publishing formal release versions with public compatibility guarantees.

### Commit Message Convention
- All git commit messages must use `type(component): description`.
- `type` should be a conventional commit verb such as `feat`, `fix`, `refactor`, `docs`, `test`, or `chore`.
- `component` should name the primary package or subsystem affected.
- Keep the description concise, imperative, and lowercase unless a proper noun is required.

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
│   └── store/              # @quajs/store state and snapshots
├── platform/
│   ├── assets-memory/      # @quajs/assets-memory adapter
│   ├── assets-node/        # @quajs/assets-node adapter
│   └── assets-web/         # @quajs/assets-web adapter
├── plugins/
│   ├── background/         # @quajs/plugin-background
│   └── plugin-discovery/   # @quajs/plugin-discovery
├── render/
│   ├── core/               # @quajs/render-core contracts/helpers
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
