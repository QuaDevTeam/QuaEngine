# QuaJS Plugin System

A complete package-based plugin discovery system for QuaJS Engine.

## 🚀 **Architecture Overview**

### **Plugin Discovery Flow**

```
Build Time (Node.js)          →     Runtime (Browser)
┌─────────────────────┐       →     ┌─────────────────────┐
│ package.json scan   │       →     │ Plugin instances    │
│ qua.plugins.json    │       →     │ loaded & running    │
│ PluginDiscovery     │       →     │ PluginAPIRegistry   │
│ script-compiler     │       →     │ Engine integration  │
└─────────────────────┘       →     └─────────────────────┘
```

### **Key Components**

1. **PluginDiscovery** (Node.js only) - Scans packages with explicit `quajs` metadata and custom registries
2. **PluginAPIRegistry** (Universal) - Runtime plugin management
3. **PluginAwareTransformer** (Build time) - QuaScript compilation with discovered decorator metadata
4. **Package-based Plugins** - Each plugin is a separate npm package

## 📦 **Plugin Package Specification**

### **Package Structure**

```
@quajs/plugin-achievement/
├── package.json          # Plugin metadata
├── src/
│   ├── index.ts          # Plugin exports
│   └── plugin.ts         # Plugin implementation
└── README.md
```

### **Package.json Requirements**

Package discovery is metadata-driven: a dependency is considered a Qua plugin only when its `package.json` contains an explicit `quajs` object. Naming a package `@quajs/plugin-*` or `quajs-plugin-*` is a convention, not enough on its own for discovery.

```json
{
  "name": "@quajs/plugin-achievement",
  "version": "1.0.0",
  "description": "Achievement system plugin for QuaJS",
  "main": "dist/index.js",
  "quajs": {
    "type": "plugin",
    "category": "system",
    "description": "Provides achievement tracking and unlocking",
    "engineVersion": "^1.0.0",
    "decorators": {
      "UnlockAchievement": {
        "function": "unlock",
        "module": "achievement",
        "description": "Unlock an achievement"
      }
    },
    "apis": ["unlock", "isUnlocked", "getProgress"]
  }
}
```

### **Plugin Implementation**

```typescript
// src/index.ts
import { PluginInstance } from '@quajs/engine'

export const metadata = {
  name: '@quajs/plugin-achievement',
  version: '1.0.0',
  description: 'Achievement system plugin',
  category: 'system'
}

export const decorators = {
  UnlockAchievement: {
    function: 'unlock',
    module: 'achievement'
  }
}

export const apis = {
  unlock: {
    name: 'unlock',
    fn: (achievementId: string) => { /* implementation */ },
    module: 'achievement'
  }
}

export class Plugin implements PluginInstance {
  readonly name = '@quajs/plugin-achievement'

  async init(context: any) {
    // Initialize plugin
  }

  async onStep(context: any) {
    // Handle step events
  }
}
```

## 🔧 **Custom Plugin Registry**

For non-package plugins, create `qua.plugins.json`:

```json
{
  "version": "1.0",
  "plugins": [
    {
      "name": "custom-plugin",
      "entry": "./plugins/custom-plugin.js",
      "version": "1.0.0",
      "description": "My custom plugin",
      "category": "custom",
      "enabled": true,
      "decorators": {
        "CustomDecorator": {
          "function": "customFunction",
          "module": "custom"
        }
      }
    }
  ]
}
```

## 🛠️ **Build-Time Usage**

### **Script Compilation**

```typescript
import { createPluginAwareTransformerAsync } from '@quajs/script-compiler'

// Build time - async plugin loading
const transformer = await createPluginAwareTransformerAsync(
  customDecorators,
  { projectRoot: process.cwd() }
)

const compiled = transformer.transformSource(quaScriptCode)
```

Plugin discovery contributes decorator metadata only. Plugins do not inject custom QuaScript compiler modules or extend the QuaScript grammar.

### **Vite Plugin**

```typescript
import { quaScriptPlugin } from '@quajs/script-compiler'

export default defineConfig({
  plugins: [
    quaScriptPlugin({
      projectRoot: __dirname
    })
  ]
})
```

## 🎮 **Runtime Usage**

### **Engine Integration**

```typescript
import { PluginAPIRegistry, QuaEngine } from '@quajs/engine'

// Runtime - plugins discovered at build time
const engine = QuaEngine.getInstance()
const registry = PluginAPIRegistry.getInstance()

// Access plugin APIs
const achievementModule = registry.getPluginModule('achievement')
await achievementModule?.unlock('first_level')
```

### **Plugin Development**

```typescript
import { BaseEnginePlugin, defineAPIFunction } from '@quajs/engine'

export class MyPlugin extends BaseEnginePlugin {
  name = 'my-plugin'

  async registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        defineAPIFunction('myFunction', this.myFunction.bind(this), {
          module: this.name
        })
      ],
      decorators: {
        MyDecorator: {
          function: 'myFunction',
          module: this.name
        }
      }
    }
  }

  async myFunction(param: string) {
    // Plugin logic
    return `Processed: ${param}`
  }
}
```

## 📝 **Plugin Naming Convention**

- **Scoped packages**: `@quajs/plugin-{name}`
- **Unscoped packages**: `quajs-plugin-{name}`
- **Or any package with `quajs.type: "plugin"` in package.json**

## 🔍 **Discovery Process**

1. **Package Scan**: Scan `package.json` dependencies for plugin packages
2. **Custom Registry**: Load plugins from `qua.plugins.json`
3. **Metadata Extraction**: Extract decorators and APIs from plugin packages
4. **Build Integration**: Plugin decorators available during script compilation
5. **Runtime Registration**: Plugins register themselves with the engine

## 🎯 **Benefits**

- ✅ **No Internal Plugins**: All plugins follow the same specification
- ✅ **Automatic Discovery**: No manual plugin registration needed
- ✅ **Build-Time Integration**: QuaScript decorators work seamlessly
- ✅ **Flexible Distribution**: npm packages or custom files
- ✅ **Type Safety**: Full TypeScript support
- ✅ **Developer Freedom**: Direct access to engine context

## 🚧 **Migration from Old System**

1. Remove internal plugin examples
2. Convert plugins to separate packages
3. Update build configuration to use plugin discovery
4. Use package-based or custom registry for plugin definition
