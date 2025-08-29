# QuaEngine Plugin System

A comprehensive plugin architecture that allows developers to extend QuaEngine's functionality with custom APIs and QuaScript decorators while maintaining full type safety.

## Overview

The plugin system enables:
- **Custom Global APIs**: Extend the engine with new functions accessible throughout your game
- **QuaScript Integration**: Create custom decorators for use in QuaScript templates
- **Type Safety**: Full TypeScript support with auto-generated declarations
- **Easy Development**: Framework and utilities for rapid plugin creation

## Architecture

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   Plugin APIs      │────│  Plugin Registry    │────│   QuaScript        │
│   - unlock()       │    │  - Register APIs    │    │   - @UnlockReward   │
│   - addProgress()  │    │  - Type Generation  │    │   - @AddProgress    │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      │
                            ┌──────────────────────┐
                            │   Game Engine        │
                            │   - Event System    │
                            │   - State Management │
                            └──────────────────────┘
```

## Quick Start

### 1. Create a Plugin

```typescript
import { PluginFramework, defineAPIFunction, defineDecorator } from '@quajs/engine'

export class MyPlugin extends PluginFramework {
  readonly name = 'myPlugin'
  readonly version = '1.0.0'
  readonly description = 'My custom plugin'

  // Define global API functions
  protected getPluginAPIs() {
    return [
      defineAPIFunction(
        'doSomething',
        (data: string) => {
          console.log('Plugin action:', data)
          return `Processed: ${data}`
        },
        {
          types: {
            params: ['data: string'],
            return: 'string'
          }
        }
      )
    ]
  }

  // Define QuaScript decorators
  protected getPluginDecorators() {
    return {
      ...defineDecorator('DoSomething', {
        function: 'doSomething',
        module: this.name
      })
    }
  }

  protected async setup(ctx) {
    console.log('MyPlugin initialized!')
  }
}
```

### 2. Register with Engine

```typescript
import { QuaEngine } from '@quajs/engine'
import { MyPlugin } from './my-plugin'

const engine = QuaEngine.getInstance({
  plugins: [MyPlugin]
})

await engine.init()
```

### 3. Use in Code

```typescript
// Global API usage
myPlugin.doSomething('Hello World!')

// QuaScript usage
const scene = qs`
  @DoSomething('Custom Action')
  Character: The plugin executed successfully!
`
```

## Plugin Development Framework

### Base Classes

#### `PluginFramework`
Extended base class with additional utilities:

```typescript
export class MyPlugin extends PluginFramework {
  // Define APIs using helper methods
  protected getPluginAPIs() {
    return [
      // Context-aware API with access to engine state
      this.createContextAPI(
        'saveData',
        (ctx, key: string, value: any) => {
          this.setPluginState(key, value)
          return true
        }
      )
    ]
  }

  // Access plugin-scoped state
  private getSavedData(key: string) {
    return this.getPluginState(key)
  }

  // Emit plugin-specific events
  private notifyUpdate() {
    this.emitPluginEvent('data.updated', { timestamp: Date.now() })
  }
}
```

#### `BaseEnginePlugin`
Minimal base class for simple plugins:

```typescript
export class SimplePlugin extends BaseEnginePlugin {
  readonly name = 'simple'

  async registerAPIs() {
    return {
      pluginName: this.name,
      apis: [/* API definitions */],
      decorators: {/* Decorator definitions */}
    }
  }

  async init(ctx) {
    // Initialize plugin
  }
}
```

### Development Utilities

#### API Function Helpers

```typescript
import { defineAPIFunction, defineDecorator } from '@quajs/engine'

// Type-safe API definition
const myAPI = defineAPIFunction(
  'processData',
  (input: string, options?: { format?: 'json' | 'text' }) => {
    // Implementation
  },
  {
    types: {
      params: ['input: string', 'options?: { format?: "json" | "text" }'],
      return: 'ProcessedData'
    }
  }
)

// QuaScript decorator definition
const myDecorator = defineDecorator('ProcessData', {
  function: 'processData',
  module: 'myPlugin',
  transform: (args) => {
    // Optional argument transformation
    return args.map(arg => typeof arg === 'string' ? arg.toUpperCase() : arg)
  }
})
```

#### Validation & Testing

```typescript
import { PluginValidator, PluginDevTools } from '@quajs/engine'

// Validate plugin structure
const validation = PluginValidator.validateRegistration(registration)
if (!validation.valid) {
  console.error('Plugin errors:', validation.errors)
}

// Test plugin APIs
const results = await PluginValidator.testPluginAPIs(registration, {
  'myFunction': {
    args: ['test input'],
    expected: 'expected output'
  }
})

// Generate TypeScript declarations
const declarations = PluginDevTools.generateDeclarationFile(registration)

// Generate usage examples
const examples = PluginDevTools.generateExampleUsage(registration)
```

## Type Safety

The plugin system provides full TypeScript integration:

### Auto-Generated Declarations

```typescript
// Auto-generated for your plugin
declare namespace myPlugin {
  export function doSomething(data: string): string
  export function processData(input: string, options?: { format?: 'json' | 'text' }): ProcessedData
}

declare namespace QuaScript {
  interface Decorators {
    'DoSomething': (data: string) => void
    'ProcessData': (input: string, options?: any) => void
  }
}
```

### Runtime Type Checking

The registry validates plugin registrations at runtime and provides helpful error messages for common issues.

## QuaScript Integration

### Decorator Compilation

Your plugin decorators are automatically integrated into the QuaScript compilation process:

```typescript
// Before compilation
const scene = qs`
  @UnlockAchievement('first_level')
  @AddProgress('story', 5)
  Character: Well done!
`

// After compilation (simplified)
const scene = [
  {
    uuid: 'step-1',
    run: () => {
      achievement.unlock('first_level')
      achievement.addProgress('story', 5)
      Character.speak('Well done!')
    }
  }
]
```

### Dynamic Loading

The plugin-aware transformer automatically discovers and integrates new decorators:

```typescript
import { createPluginAwareTransformer } from '@quajs/script-compiler'

const transformer = createPluginAwareTransformer()
// Automatically includes all registered plugin decorators
```

## Advanced Features

### Plugin State Management

```typescript
export class StatefulPlugin extends PluginFramework {
  protected async setup(ctx) {
    // Load plugin state
    const savedState = this.getPluginState()
    if (!savedState.initialized) {
      this.setPluginState('initialized', true)
      this.setPluginState('data', { count: 0 })
    }
  }

  private incrementCounter() {
    const data = this.getPluginState('data')
    this.setPluginState('data', { count: data.count + 1 })
  }
}
```

### Event System Integration

```typescript
export class EventPlugin extends PluginFramework {
  async onStep(ctx) {
    // React to game events
    if (ctx.stepId.startsWith('boss_fight_')) {
      await this.emitPluginEvent('boss.encounter', { 
        stepId: ctx.stepId 
      })
    }
  }

  private async handleCustomEvent(data: any) {
    // Emit to render layer
    await this.emit('ui.notification', {
      type: 'achievement',
      message: 'Boss defeated!'
    })
  }
}
```

### Asset Integration

```typescript
export class AssetPlugin extends PluginFramework {
  protected getPluginAPIs() {
    return [
      this.createContextAPI(
        'loadCustomAsset',
        async (ctx, assetName: string) => {
          // Load plugin-specific assets
          return this.loadPluginAsset(assetName)
        }
      )
    ]
  }
}
```

## Examples

### Achievement System
Complete achievement tracking with progress, unlocks, and notifications:

```typescript
// Usage in game code
achievement.unlock('first_dialogue')
achievement.addProgress('story_completion', 10)

// Usage in QuaScript
const scene = qs`
  @UnlockAchievement('level_complete')
  @AchievementProgress('story_completion', 5)
  Character: Congratulations on your progress!
`
```

### Save System Extension
Custom save data handling:

```typescript
// Plugin provides
saveSystem.saveCustomData('playerStats', { level: 5, xp: 1200 })
const stats = saveSystem.loadCustomData('playerStats')

// QuaScript integration
const scene = qs`
  @SaveCustomData('checkpoint', { location: 'forest', time: 1234 })
  Character: Game saved!
`
```

### Audio Enhancement
Advanced audio control:

```typescript
// Enhanced audio APIs
audio.playWithFade('background.mp3', { fadeIn: 2000 })
audio.createAudioZone('forest', { reverb: 0.3, echo: 0.1 })

// QuaScript decorators
const scene = qs`
  @PlayWithFade('forest_ambience.mp3', 1500)
  @SetAudioZone('forest')
  Character: Listen to the sounds of nature.
`
```

## Best Practices

### 1. Naming Conventions
- Plugin names: camelCase (`myPlugin`, `achievementSystem`)
- API functions: camelCase (`unlock`, `addProgress`)
- Decorators: PascalCase (`UnlockAchievement`, `PlayWithFade`)

### 2. Error Handling
```typescript
protected getPluginAPIs() {
  return [
    defineAPIFunction(
      'riskyOperation',
      (data: unknown) => {
        try {
          return this.processData(data)
        } catch (error) {
          console.error(`[${this.name}] Operation failed:`, error)
          throw new Error(`Plugin ${this.name} failed to process data`)
        }
      }
    )
  ]
}
```

### 3. Resource Cleanup
```typescript
async destroy() {
  // Clean up resources
  this.clearTimers()
  this.unsubscribeFromEvents()
  await super.destroy() // Important: call parent cleanup
}
```

### 4. Version Management
```typescript
export class MyPlugin extends PluginFramework {
  readonly name = 'myPlugin'
  readonly version = '1.2.0'
  readonly description = 'My plugin with version tracking'

  protected async setup(ctx) {
    const lastVersion = this.getPluginState('version')
    if (lastVersion !== this.version) {
      await this.migrate(lastVersion, this.version)
      this.setPluginState('version', this.version)
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Plugin not registering decorators**
   - Ensure `registerAPIs()` is implemented and returns valid configuration
   - Check that plugin is initialized before QuaScript compilation

2. **TypeScript errors**
   - Generate declaration files using `PluginDevTools.generateDeclarationFile()`
   - Ensure proper type definitions in API functions

3. **Context not available**
   - Always call APIs after plugin initialization
   - Use `createContextAPI()` for functions that need engine access

### Debug Mode
```typescript
// Enable plugin debugging
const engine = QuaEngine.getInstance({
  debug: true,
  plugins: [MyPlugin]
})
```

## Migration Guide

### From v0.x to v1.x
- `BaseEnginePlugin` → `PluginFramework` for enhanced features
- Manual API registration → `getPluginAPIs()` method
- Direct decorator definition → `getPluginDecorators()` method

The plugin system is designed to be backwards compatible while providing enhanced capabilities for new development.

---

*This documentation covers the complete QuaEngine plugin system. For additional examples and advanced use cases, see the `/examples` directory in the plugin package.*