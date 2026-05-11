# @quajs/pipeline

Event pipeline for connecting logic and render layers in QuaEngine. Provides a robust event bus system with middleware support and pluggable transport mechanisms.

## Features

- 🚀 **Event Bus Architecture** - Connects logic and rendering layers
- 🧅 **Koa-style Middleware** - Onion model with async support
- 🔌 **Transport System** - Explicit local, WebSocket, or custom event transport
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
  type: string // Event type identifier
  payload: T // Event data
  timestamp: number // When the event was created
  id: string // Unique event identifier
}
```

### Context

Events are wrapped in a context object that flows through middleware:

```typescript
interface PipelineContext<T = any> {
  event: PipelineEvent<T>
  handled: boolean // Mark if event was handled
  stopPropagation: boolean // Stop further processing
}
```

## Middleware System

Create middleware to process events as they flow through the pipeline:

### Function-based Middleware

```typescript
async function loggingMiddleware(context, next) {
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

## Transport System

Transports publish events after middleware has accepted them. The default transport is local and simply delivers events to registered listeners. Custom transports can send events over a network, mirror them to another runtime, or decide whether to deliver them locally.

The pipeline remains the only event bus. Transports do not own listener state; incoming external events are injected back through `context.receive()` so middleware and listeners stay centralized.

### Creating a Transport

```typescript
import type { PipelineContext, PipelineTransport, PipelineTransportContext } from '@quajs/pipeline'

class MyTransport implements PipelineTransport {
  readonly name = 'my-transport'

  async setup(context: PipelineTransportContext) {
    // Open sockets or allocate resources here.
  }

  async publish(context: PipelineContext, transport: PipelineTransportContext) {
    // Send event over a network, then optionally deliver locally.
    console.log(`Sending ${context.event.type} over network`)
    await transport.deliver(context)
  }

  subscribe(type: string) {
    // Optional: ask a remote source to start forwarding this event type.
  }
}

const pipeline = new Pipeline({
  transport: new MyTransport()
})
```

### Receiving External Events

```typescript
class RemoteTransport implements PipelineTransport {
  readonly name = 'remote'
  private context?: PipelineTransportContext

  setup(context: PipelineTransportContext) {
    this.context = context
  }

  publish(context: PipelineContext) {
    sendToRemote(context.event)
  }

  async onRemoteMessage(message) {
    await this.context?.receive({
      type: message.type,
      payload: message.payload,
      id: message.id,
      timestamp: message.timestamp
    })
  }
}
```

### WebSocket Transport Example

See [examples/websocket-plugin.ts](./examples/websocket-plugin.ts) for a complete WebSocket transport implementation.

## API Reference

### Pipeline Class

#### Constructor

```typescript
const pipeline = new Pipeline(options)
```

Options:

- `middlewares?: (MiddlewareFunction | Middleware)[]` - Initial middlewares
- `plugins?: Plugin[]` - Initial plugins
- `transport?: PipelineTransport` - Initial event transport, defaults to local delivery

#### Methods

**Event Management**

- `emit<T>(type: string, payload: T): Promise<void>` - Emit an event
- `receive<T>(event: PipelineEventInput<T>): Promise<void>` - Inject an external event without publishing it again
- `on<T>(type: string, listener: EventListener<T>): this` - Add event listener
- `off<T>(type: string, listener: EventListener<T>): this` - Remove event listener
- `on<T>('*', listener: EventListener<T>): this` - Listen to all events

**Middleware Management**

- `addMiddleware(middleware: MiddlewareFunction | Middleware): this` - Add middleware
- `clearMiddlewares(): this` - Remove all middlewares

**Plugin Management**

- `use(plugin: Plugin): this` - Install plugin

**Transport Management**

- `setTransport(transport: PipelineTransport): this` - Replace the current transport
- `getTransport(): PipelineTransport` - Return the current transport

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

Abstract base class for lifecycle extensions. Plugins can configure middleware or install a transport with `pipeline.setTransport(...)`.

```typescript
abstract class Plugin {
  abstract readonly name: string
  abstract setup(pipeline: Pipeline): void | Promise<void>
}
```

### PipelineTransport Interface

```typescript
interface PipelineTransport {
  readonly name: string
  setup?: (context: PipelineTransportContext) => void | Promise<void>
  publish: <T>(context: PipelineContext<T>, transport: PipelineTransportContext) => void | Promise<void>
  subscribe?: (type: string, context: PipelineTransportContext) => void | Promise<void>
  unsubscribe?: (type: string, context: PipelineTransportContext) => void | Promise<void>
  dispose?: (context: PipelineTransportContext) => void | Promise<void>
}

interface PipelineTransportContext {
  readonly pipeline: Pipeline
  createEvent: <T>(type: string, payload: T, init?: PipelineEventInit) => PipelineEvent<T>
  deliver: <T>(delivery: PipelineEvent<T> | PipelineContext<T>) => Promise<void>
  receive: <T>(event: PipelineEventInput<T>) => Promise<void>
  getEventTypes: () => string[]
  getListenerCount: (type: string) => number
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
import { Middleware, Pipeline } from '@quajs/pipeline'

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
import { WebSocketTransport } from './examples/websocket-plugin'

const pipeline = new Pipeline({
  transport: new WebSocketTransport('ws://localhost:8080/events')
})

// Events now travel over WebSocket
await pipeline.emit('player:move', { x: 10, y: 20 })
```

## Error Handling

The pipeline includes built-in error handling:

- Middleware errors are caught and re-thrown
- Listener errors are logged but don't stop other listeners
- Plugin setup errors are logged but don't prevent pipeline creation
- Transport setup errors are logged

## Performance Considerations

- Events are processed asynchronously in parallel where possible
- Middleware runs in sequence (onion model)
- Memory-efficient listener management with automatic cleanup
- Transports receive subscription notifications only when listener types appear or disappear

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
