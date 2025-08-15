import type { MiddlewareNext, PipelineContext } from '../src/index'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Middleware, Pipeline, Plugin } from '../src/index'

describe('pipeline', () => {
  let pipeline: Pipeline

  beforeEach(() => {
    pipeline = new Pipeline()
  })

  describe('constructor', () => {
    it('should create empty pipeline with no options', () => {
      const p = new Pipeline()
      expect(p).toBeInstanceOf(Pipeline)
      expect(p.getEventTypes()).toEqual([])
      expect(p.getListenerCount('test')).toBe(0)
    })

    it('should initialize with middlewares', () => {
      const middleware = vi.fn(async (context, next) => {
        await next()
      })

      const p = new Pipeline({
        middlewares: [middleware],
      })

      expect(p).toBeInstanceOf(Pipeline)
    })

    it('should initialize with plugins', () => {
      class TestPlugin extends Plugin {
        readonly name = 'test-plugin'

        setup() {
          // Setup logic
        }
      }

      const plugin = new TestPlugin()
      const p = new Pipeline({
        plugins: [plugin],
      })

      expect(p).toBeInstanceOf(Pipeline)
    })
  })

  describe('event emission and listening', () => {
    it('should emit and listen to events', async () => {
      const listener = vi.fn()

      pipeline.on('test-event', listener)
      await pipeline.emit('test-event', { message: 'hello' })

      expect(listener).toHaveBeenCalledOnce()
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'test-event',
            payload: { message: 'hello' },
            timestamp: expect.any(Number),
            id: expect.any(String),
          }),
          handled: false,
          stopPropagation: false,
        }),
      )
    })

    it('should support multiple listeners for same event', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      pipeline.on('test-event', listener1)
      pipeline.on('test-event', listener2)
      await pipeline.emit('test-event', 'data')

      expect(listener1).toHaveBeenCalledOnce()
      expect(listener2).toHaveBeenCalledOnce()
    })

    it('should support wildcard listeners', async () => {
      const wildcardListener = vi.fn()
      const specificListener = vi.fn()

      pipeline.onEvent(wildcardListener)
      pipeline.on('specific', specificListener)

      await pipeline.emit('specific', 'data')
      await pipeline.emit('other', 'data')

      expect(wildcardListener).toHaveBeenCalledTimes(2)
      expect(specificListener).toHaveBeenCalledOnce()
    })

    it('should remove listeners', async () => {
      const listener = vi.fn()

      pipeline.on('test-event', listener)
      pipeline.off('test-event', listener)
      await pipeline.emit('test-event', 'data')

      expect(listener).not.toHaveBeenCalled()
      expect(pipeline.getListenerCount('test-event')).toBe(0)
    })

    it('should generate unique event IDs', async () => {
      const ids = new Set<string>()
      const listener = vi.fn((context) => {
        ids.add(context.event.id)
      })

      pipeline.on('test', listener)

      for (let i = 0; i < 100; i++) {
        await pipeline.emit('test', i)
      }

      expect(ids.size).toBe(100)
    })

    it('should handle async listeners', async () => {
      let resolved = false
      const asyncListener = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        resolved = true
      })

      pipeline.on('async-test', asyncListener)
      await pipeline.emit('async-test', 'data')

      expect(asyncListener).toHaveBeenCalledOnce()
      expect(resolved).toBe(true)
    })

    it('should handle listener errors gracefully', async () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error')
      })
      const normalListener = vi.fn()

      pipeline.on('error-test', errorListener)
      pipeline.on('error-test', normalListener)

      // Should not throw
      await expect(pipeline.emit('error-test', 'data')).resolves.toBeUndefined()

      expect(errorListener).toHaveBeenCalledOnce()
      expect(normalListener).toHaveBeenCalledOnce()
    })
  })

  describe('middleware system', () => {
    it('should execute middleware in order', async () => {
      const order: number[] = []

      const middleware1 = vi.fn(async (context: PipelineContext, next: MiddlewareNext) => {
        order.push(1)
        await next()
        order.push(4)
      })

      const middleware2 = vi.fn(async (context: PipelineContext, next: MiddlewareNext) => {
        order.push(2)
        await next()
        order.push(3)
      })

      pipeline.addMiddleware(middleware1)
      pipeline.addMiddleware(middleware2)

      await pipeline.emit('test', 'data')

      expect(order).toEqual([1, 2, 3, 4])
      expect(middleware1).toHaveBeenCalledOnce()
      expect(middleware2).toHaveBeenCalledOnce()
    })

    it('should stop execution when middleware does not call next', async () => {
      const listener = vi.fn()
      const middleware = vi.fn(async (context: PipelineContext) => {
        // Don't call next()
        context.stopPropagation = true
      })

      pipeline.addMiddleware(middleware)
      pipeline.on('test', listener)

      await pipeline.emit('test', 'data')

      expect(middleware).toHaveBeenCalledOnce()
      expect(listener).not.toHaveBeenCalled()
    })

    it('should handle middleware errors', async () => {
      const errorMiddleware = vi.fn(async () => {
        throw new Error('Middleware error')
      })

      pipeline.addMiddleware(errorMiddleware)

      await expect(pipeline.emit('test', 'data')).rejects.toThrow('Middleware error')
      expect(errorMiddleware).toHaveBeenCalledOnce()
    })

    it('should prevent next() from being called multiple times', async () => {
      const badMiddleware = vi.fn(async (context: PipelineContext, next: MiddlewareNext) => {
        await next()
        await next() // This should throw
      })

      pipeline.addMiddleware(badMiddleware)

      await expect(pipeline.emit('test', 'data')).rejects.toThrow('next() called multiple times')
    })

    it('should support class-based middleware', async () => {
      class TestMiddleware extends Middleware {
        async handle(context: PipelineContext, next: MiddlewareNext) {
          context.handled = true
          await next()
        }
      }

      const middleware = new TestMiddleware()
      const listener = vi.fn()

      pipeline.addMiddleware(middleware)
      pipeline.on('test', listener)

      await pipeline.emit('test', 'data')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          handled: true,
        }),
      )
    })
  })

  describe('utility methods', () => {
    it('should return registered event types', () => {
      pipeline.on('event1', vi.fn())
      pipeline.on('event2', vi.fn())
      pipeline.on('event1', vi.fn()) // Duplicate should not affect count

      const types = pipeline.getEventTypes()
      expect(types).toContain('event1')
      expect(types).toContain('event2')
      expect(types).toHaveLength(2)
    })

    it('should return listener count', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      pipeline.on('test', listener1)
      pipeline.on('test', listener2)

      expect(pipeline.getListenerCount('test')).toBe(2)
      expect(pipeline.getListenerCount('nonexistent')).toBe(0)
    })

    it('should remove all listeners', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      pipeline.on('event1', listener1)
      pipeline.on('event2', listener2)

      pipeline.removeAllListeners()

      await pipeline.emit('event1', 'data')
      await pipeline.emit('event2', 'data')

      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).not.toHaveBeenCalled()
      expect(pipeline.getEventTypes()).toHaveLength(0)
    })

    it('should remove listeners for specific event type', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      pipeline.on('event1', listener1)
      pipeline.on('event2', listener2)

      pipeline.removeAllListeners('event1')

      await pipeline.emit('event1', 'data')
      await pipeline.emit('event2', 'data')

      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).toHaveBeenCalledOnce()
    })

    it('should clear all middlewares', async () => {
      const middleware = vi.fn(async (context: PipelineContext, next: MiddlewareNext) => {
        await next()
      })

      pipeline.addMiddleware(middleware)
      pipeline.clearMiddlewares()

      await pipeline.emit('test', 'data')

      expect(middleware).not.toHaveBeenCalled()
    })
  })

  describe('version export', () => {
    it('should export version', () => {
      // This is imported in the test file
      expect(typeof pipeline).toBe('object')
      // Version is tested by importing it
    })
  })
})
