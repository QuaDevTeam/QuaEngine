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
