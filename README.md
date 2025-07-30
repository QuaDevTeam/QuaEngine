# QuaEngine

A modern monorepo built with Nx, TypeScript, and Vite.

## Features

- 🏗️ **Nx Monorepo**: Powerful build system and workspace management
- 📦 **PNPM**: Fast, disk space efficient package manager
- ⚡ **Vite**: Lightning fast build tool
- 🔷 **TypeScript**: Type-safe development
- 🎯 **ESLint**: Code quality with @antfu/eslint-config
- 🏷️ **Scoped Packages**: All packages under @quajs organization

## Getting Started

### Install Dependencies

```bash
pnpm install
```

### Create a New Package

```bash
pnpm create-package
```

This will prompt you for:
- Package name (without @quajs/ prefix)
- Package description

### Available Scripts

```bash
# Build all packages
pnpm build

# Run development mode for all packages
pnpm dev

# Lint all packages
pnpm lint

# Run tests for all packages
pnpm test
```

### Working with Individual Packages

```bash
# Build a specific package
nx build <package-name>

# Run dev mode for a specific package
nx dev <package-name>

# Lint a specific package
nx lint <package-name>
```

## Package Structure

Each package created follows this structure:

```
packages/<package-name>/
├── src/
│   └── index.ts          # Main entry point
├── dist/                 # Build output
├── package.json          # Package configuration
├── project.json          # Nx project configuration
├── tsconfig.json         # TypeScript configuration
└── vite.config.ts        # Vite build configuration
```

## License

Apache-2.0 © QuaDevTeam