import { describe, it, expect } from 'vitest'
import {
  Pipeline,
  Middleware,
  Plugin,
  version,
  type PipelineEvent,
  type PipelineContext,
  type EventListener,
  type MiddlewareNext,
  type MiddlewareFunction,
  type PluginEmitHook,
  type PluginOnHook,
  type PluginOffHook,
  type PipelinePlugin,
  type PipelineOptions
} from '../src/index'

describe('Exports and Types', () => {
  describe('version export', () => {
    it('should export version string', () => {
      expect(version).toBe('0.1.0')
      expect(typeof version).toBe('string')
    })
  })

  describe('class exports', () => {
    it('should export Pipeline class', () => {
      expect(Pipeline).toBeDefined()
      expect(typeof Pipeline).toBe('function')

      const pipeline = new Pipeline()
      expect(pipeline).toBeInstanceOf(Pipeline)
    })

    it('should export Middleware class', () => {
      expect(Middleware).toBeDefined()
      expect(typeof Middleware).toBe('function')

      class TestMiddleware extends Middleware {
        async handle(context: PipelineContext, next: MiddlewareNext) {
          // Test implementation
          await next()
        }
      }

      const middleware = new TestMiddleware()
      expect(middleware).toBeInstanceOf(Middleware)
    })

    it('should export Plugin class', () => {
      expect(Plugin).toBeDefined()
      expect(typeof Plugin).toBe('function')

      class TestPlugin extends Plugin {
        readonly name = 'test'
        setup(pipeline: Pipeline) {
          // Test implementation  
        }
      }

      const plugin = new TestPlugin()
      expect(plugin).toBeInstanceOf(Plugin)
    })
  })

  describe('type definitions', () => {
    it('should support PipelineEvent type', () => {
      const event: PipelineEvent<string> = {
        type: 'test',
        payload: 'hello',
        timestamp: Date.now(),
        id: 'test-id'
      }

      expect(event.type).toBe('test')
      expect(event.payload).toBe('hello')
      expect(typeof event.timestamp).toBe('number')
      expect(typeof event.id).toBe('string')
    })

    it('should support PipelineContext type', () => {
      const context: PipelineContext<number> = {
        event: {
          type: 'test',
          payload: 42,
          timestamp: Date.now(),
          id: 'test-id'
        },
        handled: false,
        stopPropagation: false
      }

      expect(context.event.payload).toBe(42)
      expect(context.handled).toBe(false)
      expect(context.stopPropagation).toBe(false)
    })

    it('should support EventListener type', () => {
      const syncListener: EventListener<string> = (context) => {
        expect(context.event.payload).toBeTypeOf('string')
      }

      const asyncListener: EventListener<string> = async (context) => {
        expect(context.event.payload).toBeTypeOf('string')
      }

      expect(typeof syncListener).toBe('function')
      expect(typeof asyncListener).toBe('function')
    })

    it('should support MiddlewareFunction type', () => {
      const middleware: MiddlewareFunction<unknown> = async (context, next) => {
        await next()
      }

      expect(typeof middleware).toBe('function')
    })

    it('should support plugin hook types', () => {
      const emitHook: PluginEmitHook = async (type, payload, originalEmit) => {
        await originalEmit(type, payload)
      }

      const onHook: PluginOnHook = (type, listener, originalOn) => {
        return originalOn(type, listener)
      }

      const offHook: PluginOffHook = (type, listener, originalOff) => {
        return originalOff(type, listener)
      }

      expect(typeof emitHook).toBe('function')
      expect(typeof onHook).toBe('function')
      expect(typeof offHook).toBe('function')
    })

    it('should support PipelineOptions type', () => {
      class TestMiddleware extends Middleware {
        async handle(context: PipelineContext, next: MiddlewareNext) {
          await next()
        }
      }

      class TestPlugin extends Plugin {
        readonly name = 'test'
        setup(pipeline: Pipeline) {
          // Setup implementation
        }
      }

      const options: PipelineOptions = {
        middlewares: [
          new TestMiddleware(),
          async (context, next) => { await next() }
        ],
        plugins: [
          new TestPlugin(),
          {
            name: 'legacy-plugin',
            install: (pipeline: Pipeline) => {
              // Install implementation
            }
          }
        ]
      }

      expect(Array.isArray(options.middlewares)).toBe(true)
      expect(Array.isArray(options.plugins)).toBe(true)
    })

    it('should support PipelinePlugin interface', () => {
      const plugin: PipelinePlugin = {
        name: 'interface-plugin',
        install: (pipeline) => {
          expect(pipeline).toBeInstanceOf(Pipeline)
        }
      }

      expect(plugin.name).toBe('interface-plugin')
      expect(typeof plugin.install).toBe('function')
    })
  })

  describe('generic type support', () => {
    it('should support typed events', async () => {
      interface UserActionPayload {
        action: 'login' | 'logout' | 'click'
        userId: string
        timestamp: number
      }

      const pipeline = new Pipeline()

      pipeline.on<UserActionPayload>('user:action', (context) => {
        // TypeScript should infer the correct type
        expect(context.event.payload.action).toMatch(/^(login|logout|click)$/)
        expect(typeof context.event.payload.userId).toBe('string')
        expect(typeof context.event.payload.timestamp).toBe('number')
      })

      await pipeline.emit<UserActionPayload>('user:action', {
        action: 'login',
        userId: 'user123',
        timestamp: Date.now()
      })
    })

    it('should support typed middleware', async () => {
      interface GameEvent {
        type: 'move' | 'attack' | 'defend'
        playerId: string
        data: unknown
      }

      class GameMiddleware extends Middleware<GameEvent> {
        async handle(context: PipelineContext<GameEvent>, next: MiddlewareNext) {
          // Type should be properly inferred
          expect(context.event.payload.type).toMatch(/^(move|attack|defend)$/)
          expect(typeof context.event.payload.playerId).toBe('string')
          await next()
        }
      }

      const pipeline = new Pipeline()
      pipeline.addMiddleware(new GameMiddleware())

      await pipeline.emit<GameEvent>('game:action', {
        type: 'move',
        playerId: 'player1',
        data: { x: 10, y: 20 }
      })
    })
  })
})