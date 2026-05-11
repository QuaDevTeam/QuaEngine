import type {
  EventListener,
  MiddlewareFunction,
  MiddlewareNext,
  PipelineContext,
  PipelineEvent,
  PipelineEventInit,
  PipelineEventInput,
  PipelineOptions,
  PipelineTransport,
  PipelineTransportContext,
} from '../src/index'
import { describe, expect, it } from 'vitest'
import {
  LocalPipelineTransport,
  Middleware,
  Pipeline,
  Plugin,
  version,
} from '../src/index'

describe('exports and Types', () => {
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
        setup(_pipeline: Pipeline) {
          // Test implementation
        }
      }

      const plugin = new TestPlugin()
      expect(plugin).toBeInstanceOf(Plugin)
    })

    it('should export LocalPipelineTransport class', () => {
      const transport = new LocalPipelineTransport()

      expect(transport).toBeInstanceOf(LocalPipelineTransport)
      expect(transport.name).toBe('local')
    })
  })

  describe('type definitions', () => {
    it('should support PipelineEvent type', () => {
      const event: PipelineEvent<string> = {
        type: 'test',
        payload: 'hello',
        timestamp: Date.now(),
        id: 'test-id',
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
          id: 'test-id',
        },
        handled: false,
        stopPropagation: false,
      }

      expect(context.event.payload).toBe(42)
      expect(context.handled).toBe(false)
      expect(context.stopPropagation).toBe(false)
    })

    it('should support PipelineEventInput type', () => {
      const event: PipelineEventInput<string> = {
        type: 'remote:test',
        payload: 'hello',
      }

      expect(event.type).toBe('remote:test')
      expect(event.payload).toBe('hello')
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

    it('should support PipelineTransport type', async () => {
      const transport: PipelineTransport = {
        name: 'test-transport',
        publish(context, transportContext) {
          return transportContext.deliver(context)
        },
      }

      const context = {
        pipeline: new Pipeline(),
        createEvent: <T = unknown>(type: string, payload: T, init?: PipelineEventInit) => ({
          type,
          payload,
          timestamp: init?.timestamp ?? Date.now(),
          id: init?.id ?? 'test-id',
        }),
        deliver: async () => {},
        receive: async () => {},
        getEventTypes: () => [],
        getListenerCount: () => 0,
      } satisfies PipelineTransportContext

      await transport.publish(
        {
          event: {
            type: 'test',
            payload: 'payload',
            timestamp: Date.now(),
            id: 'test-id',
          },
          handled: false,
          stopPropagation: false,
        },
        context,
      )

      expect(transport.name).toBe('test-transport')
    })

    it('should support PipelineOptions type', () => {
      class TestMiddleware extends Middleware {
        async handle(context: PipelineContext, next: MiddlewareNext) {
          await next()
        }
      }

      class TestPlugin extends Plugin {
        readonly name = 'test'
        setup(_pipeline: Pipeline) {
          // Setup implementation
        }
      }

      const options: PipelineOptions = {
        middlewares: [
          new TestMiddleware(),
          async (context, next) => { await next() },
        ],
        plugins: [
          new TestPlugin(),
        ],
        transport: new LocalPipelineTransport(),
      }

      expect(Array.isArray(options.middlewares)).toBe(true)
      expect(Array.isArray(options.plugins)).toBe(true)
      expect(options.transport).toBeInstanceOf(LocalPipelineTransport)
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
        timestamp: Date.now(),
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
        data: { x: 10, y: 20 },
      })
    })
  })
})
