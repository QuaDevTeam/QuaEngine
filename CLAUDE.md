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

## Current Implementation Status

We are currently focused on building the **Logic Layer** foundation with the following packages:

### Core Packages

#### 🎮 **core** (QuaEngine Core)
- **Environment**: Browser
- **Purpose**: Core game logic and narrative engine
- **Status**: Planning phase
- **Features**:
  - Game loop management
  - Scene transitions
  - Character and dialogue systems
  - Save/load functionality
  - Event system for render layer communication

#### 📦 **assets** (Asset Management)
- **Environment**: Browser
- **Purpose**: Runtime asset loading and management
- **Status**: Planning phase
- **Features**:
  - Dynamic asset loading
  - Memory management
  - Caching strategies
  - Format support (images, audio, video, scripts)

#### 💾 **store** (State Management)
- **Environment**: Browser
- **Status**: ✅ **Implemented**
- **Features**:
  - Global state management (Redux-like)
  - IndexedDB persistence with Dexie
  - Snapshot system for save states
  - TypeScript-first design

#### 🔧 **quack** (Asset Bundler)
- **Environment**: Node.js
- **Purpose**: Development-time asset processing and bundling
- **Status**: Planning phase
- **Features**:
  - Asset optimization
  - Bundle generation
  - Development server
  - Hot module replacement

### Supporting Packages

#### 📝 **logger**
- **Environment**: Universal (Node.js + Browser)
- **Status**: ✅ **Implemented**
- **Features**:
  - Configurable log levels
  - Environment-aware formatting
  - Package and module scoped logging

#### 🛠️ **utils**
- **Environment**: Universal (Node.js + Browser)
- **Status**: ✅ **Implemented**
- **Features**:
  - String, array, object utilities
  - Date and validation helpers
  - Function utilities (debounce, throttle, memoize)
  - Type checking and ID generation

## Development Infrastructure

### Build System
- **Monorepo**: pnpm + Nx for package management
- **TypeScript**: Full type safety across all packages
- **Vite**: Fast build tool with environment-specific configurations
- **Environment Targeting**:
  - Node.js packages: ES2022, Node.js APIs
  - Browser packages: ES2020, DOM APIs  
  - Universal packages: Compatible with both environments

### Package Creation
- **Automated Setup**: Environment-aware package scaffolding
- **Environment Selection**: Node.js only, Browser only, or Universal
- **Consistent Configuration**: TypeScript, Vite, and build settings

## Future Roadmap

### Phase 1: Logic Layer Foundation (Current)
- [x] Store package with snapshot system
- [x] Logger and utils packages
- [x] Build system and tooling
- [ ] Core engine architecture
- [ ] Asset management system
- [ ] Quack bundler development

### Phase 2: Render Layer Interface
- [ ] Event system design
- [ ] Render layer API specification
- [ ] Reference renderer implementation
- [ ] Plugin architecture

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
├── core/           # Game engine core (Browser)
├── assets/         # Asset management (Browser)  
├── store/          # State management (Browser) ✅
├── quack/          # Asset bundler (Node.js)
├── logger/         # Logging utilities (Universal) ✅
├── utils/          # Common utilities (Universal) ✅
└── plugins/        # Plugin ecosystem
    ├── audio/      # Audio system plugin
    ├── video/      # Video playback plugin
    └── ui/         # UI component plugins
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