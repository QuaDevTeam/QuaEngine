# @quajs/pipeline

Event pipeline for connecting logic and render layers in QuaEngine. Provides a robust event bus system with middleware support and pluggable transport mechanisms.

## Features

- 🚀 **Event Bus Architecture** - Connects logic and rendering layers
- 🧅 **Koa-style Middleware** - Onion model with async support
- 🔌 **Plugin System** - Extensible transport mechanisms (WebSocket, etc.)
- 🎯 **TypeScript First** - Full type safety and IntelliSense
- 🌐 **Cross-platform** - Works in Browser and Node.js
- ⚡ **High Performance** - Efficient event processing and memory management

## Installation

```bash
npm install @quajs/pipeline
# or
pnpm add @quajs/pipeline
```

## Quick Start

```typescript
import { Pipeline } from '@quajs/pipeline'

// Create pipeline instance
const pipeline = new Pipeline()

// Listen for events
pipeline.on('user:action', (context) => {
  console.log('User action:', context.event.payload)
})

// Emit events
await pipeline.emit('user:action', { type: 'click', target: 'button' })
```

## Core Concepts

### Events

Every event in the pipeline has a consistent structure:

```typescript
interface PipelineEvent<T = any> {
  type: string        // Event type identifier
  payload: T          // Event data
  timestamp: number   // When the event was created
  id: string         // Unique event identifier
}
```

### Context

Events are wrapped in a context object that flows through middleware:

```typescript
interface PipelineContext<T = any> {
  event: PipelineEvent<T>
  handled: boolean          // Mark if event was handled
  stopPropagation: boolean  // Stop further processing
}
```

## Middleware System

Create middleware to process events as they flow through the pipeline:

### Function-based Middleware

```typescript
const loggingMiddleware = async (context, next) => {
  console.log(`Before: ${context.event.type}`)
  await next()
  console.log(`After: ${context.event.type}`)
}

pipeline.addMiddleware(loggingMiddleware)
```

### Class-based Middleware

```typescript
import { Middleware } from '@quajs/pipeline'

class ValidationMiddleware extends Middleware {
  constructor() {
    super(['user:action']) // Only handle specific event types
  }

  async setup(pipeline) {
    // Initialize middleware (called during pipeline setup)
    console.log('Validation middleware initialized')
  }

  async handle(context, next) {
    // Validate event payload
    if (!context.event.payload) {
      context.stopPropagation = true
      return
    }
    
    await next()
    context.handled = true
  }
}

pipeline.addMiddleware(new ValidationMiddleware())
```

## Plugin System

Plugins can take over event transport, enabling network communication:

### Creating a Plugin

```typescript
import { Plugin } from '@quajs/pipeline'

class MyTransportPlugin extends Plugin {
  readonly name = 'my-transport'

  async setup(pipeline) {
    // Initialize plugin
    this.setEmitHook(this.handleEmit.bind(this))
    this.setOnHook(this.handleOn.bind(this))
  }

  private handleEmit = async (type, payload, originalEmit) => {
    // Custom emit logic (e.g., send over network)
    console.log(`Sending ${type} over network`)
    // Fallback to original if needed
    await originalEmit(type, payload)
  }

  private handleOn = (type, listener, originalOn) => {
    // Custom listener registration
    // Return originalOn(type, listener) for fallback
    return originalOn(type, listener)
  }
}

// Use the plugin
const pipeline = new Pipeline({
  plugins: [new MyTransportPlugin()]
})
```

### WebSocket Plugin Example

See [examples/websocket-plugin.ts](./examples/websocket-plugin.ts) for a complete WebSocket transport implementation.

## API Reference

### Pipeline Class

#### Constructor

```typescript
new Pipeline(options?: PipelineOptions)
```

Options:
- `middlewares?: (MiddlewareFunction | Middleware)[]` - Initial middlewares
- `plugins?: (PipelinePlugin | Plugin)[]` - Initial plugins

#### Methods

**Event Management**
- `emit<T>(type: string, payload: T): Promise<void>` - Emit an event
- `on<T>(type: string, listener: EventListener<T>): this` - Add event listener
- `off<T>(type: string, listener: EventListener<T>): this` - Remove event listener
- `onEvent<T>(listener: EventListener<T>): this` - Listen to all events (wildcard)

**Middleware Management**
- `addMiddleware(middleware: MiddlewareFunction | Middleware): this` - Add middleware
- `clearMiddlewares(): this` - Remove all middlewares

**Plugin Management**
- `use(plugin: PipelinePlugin | Plugin): this` - Install plugin

**Utility Methods**
- `getEventTypes(): string[]` - Get all registered event types
- `getListenerCount(type: string): number` - Get listener count for event type
- `removeAllListeners(type?: string): this` - Remove listeners

### Middleware Class

Abstract base class for creating middleware:

```typescript
abstract class Middleware<T = any> {
  constructor(eventTypes?: string[])
  setup?(pipeline: Pipeline): void | Promise<void>
  abstract handle(context: PipelineContext<T>, next: MiddlewareNext): Promise<void> | void
}
```

### Plugin Class

Abstract base class for creating plugins:

```typescript
abstract class Plugin {
  abstract readonly name: string
  abstract setup(pipeline: Pipeline): void | Promise<void>
  
  protected setEmitHook(hook: PluginEmitHook): void
  protected setOnHook(hook: PluginOnHook): void  
  protected setOffHook(hook: PluginOffHook): void
}
```

## Examples

### Basic Usage

```typescript
import { Pipeline } from '@quajs/pipeline'

const pipeline = new Pipeline()

// Simple event handling
pipeline.on('game:start', (context) => {
  console.log('Game started!', context.event.payload)
})

await pipeline.emit('game:start', { level: 1 })
```

### With Middleware

```typescript
import { Pipeline, Middleware } from '@quajs/pipeline'

class TimingMiddleware extends Middleware {
  async handle(context, next) {
    const start = Date.now()
    await next()
    console.log(`Event ${context.event.type} took ${Date.now() - start}ms`)
  }
}

const pipeline = new Pipeline({
  middlewares: [new TimingMiddleware()]
})
```

### With WebSocket Transport

```typescript
import { Pipeline } from '@quajs/pipeline'
import { WebSocketPlugin } from './examples/websocket-plugin'

const pipeline = new Pipeline({
  plugins: [
    new WebSocketPlugin('ws://localhost:8080/events')
  ]
})

// Events now travel over WebSocket
await pipeline.emit('player:move', { x: 10, y: 20 })
```

## Error Handling

The pipeline includes built-in error handling:

- Middleware errors are caught and re-thrown
- Listener errors are logged but don't stop other listeners
- Plugin setup errors are logged but don't prevent pipeline creation
- WebSocket connection failures fall back to local event handling

## Performance Considerations

- Events are processed asynchronously in parallel where possible
- Middleware runs in sequence (onion model)
- Memory-efficient listener management with automatic cleanup
- Plugin hooks are called only when registered

## TypeScript Support

Full TypeScript support with generic event payloads:

```typescript
interface GameActionPayload {
  action: 'move' | 'attack' | 'defend'
  target?: string
}

pipeline.on<GameActionPayload>('game:action', (context) => {
  // context.event.payload is fully typed as GameActionPayload
  console.log(context.event.payload.action)
})

await pipeline.emit<GameActionPayload>('game:action', {
  action: 'move',
  target: 'player2'
})
```

## Browser and Node.js Support

The pipeline works in both environments:

- **Browser**: Full WebSocket support, DOM event integration
- **Node.js**: WebSocket support via `ws` library, process event integration

## Contributing

Please see the main [QuaEngine Contributing Guide](../../CONTRIBUTING.md).

## License

Apache-2.0 - see [LICENSE](../../LICENSE) file for details.