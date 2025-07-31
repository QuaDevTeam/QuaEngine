import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Pipeline, Middleware, type PipelineContext, type MiddlewareNext } from '../src/index'

describe('Middleware', () => {
  let pipeline: Pipeline

  beforeEach(() => {
    pipeline = new Pipeline()
  })

  describe('abstract middleware class', () => {
    class TestMiddleware extends Middleware {
      constructor(eventTypes?: string[]) {
        super(eventTypes)
      }

      async handle(context: PipelineContext, next: MiddlewareNext) {
        context.handled = true
        await next()
      }
    }

    it('should create middleware with no event type filter', () => {
      const middleware = new TestMiddleware()
      expect(middleware).toBeInstanceOf(Middleware)
    })

    it('should create middleware with event type filter', () => {
      const middleware = new TestMiddleware(['test-event', 'other-event'])
      expect(middleware).toBeInstanceOf(Middleware)
    })

    it('should handle all events when no filter is set', async () => {
      const middleware = new TestMiddleware()
      const listener = vi.fn()

      pipeline.addMiddleware(middleware)
      pipeline.on('any-event', listener)

      await pipeline.emit('any-event', 'data')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          handled: true
        })
      )
    })

    it('should only handle specified event types', async () => {
      const middleware = new TestMiddleware(['target-event'])
      const targetListener = vi.fn()
      const otherListener = vi.fn()

      pipeline.addMiddleware(middleware)
      pipeline.on('target-event', targetListener)
      pipeline.on('other-event', otherListener)

      await pipeline.emit('target-event', 'data')
      await pipeline.emit('other-event', 'data')

      expect(targetListener).toHaveBeenCalledWith(
        expect.objectContaining({
          handled: true
        })
      )
      expect(otherListener).toHaveBeenCalledWith(
        expect.objectContaining({
          handled: false
        })
      )
    })

    it('should convert to middleware function', () => {
      const middleware = new TestMiddleware()
      const middlewareFunction = middleware.toFunction()

      expect(typeof middlewareFunction).toBe('function')
    })

    it('should support setup method', async () => {
      class SetupMiddleware extends Middleware {
        setupCalled = false

        setup(pipeline: Pipeline) {
          this.setupCalled = true
          expect(pipeline).toBeInstanceOf(Pipeline)
        }

        async handle(context: PipelineContext, next: MiddlewareNext) {
          await next()
        }
      }

      const middleware = new SetupMiddleware()
      pipeline.addMiddleware(middleware)

      // Allow async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(middleware.setupCalled).toBe(true)
    })

    it('should support async setup method', async () => {
      class AsyncSetupMiddleware extends Middleware {
        setupCompleted = false

        async setup(pipeline: Pipeline) {
          await new Promise(resolve => setTimeout(resolve, 10))
          this.setupCompleted = true
        }

        async handle(context: PipelineContext, next: MiddlewareNext) {
          await next()
        }
      }

      const middleware = new AsyncSetupMiddleware()
      pipeline.addMiddleware(middleware)

      // Allow async setup to complete
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(middleware.setupCompleted).toBe(true)
    })
  })

  describe('middleware execution order', () => {
    class OrderedMiddleware extends Middleware {
      constructor(private id: number, private order: number[]) {
        super()
      }

      async handle(context: PipelineContext, next: MiddlewareNext) {
        this.order.push(this.id)
        await next()
        this.order.push(this.id + 10)
      }
    }

    it('should execute middlewares in onion model (FIFO for enter, LIFO for exit)', async () => {
      const order: number[] = []

      pipeline.addMiddleware(new OrderedMiddleware(1, order))
      pipeline.addMiddleware(new OrderedMiddleware(2, order))
      pipeline.addMiddleware(new OrderedMiddleware(3, order))

      await pipeline.emit('test', 'data')

      // Should be: 1, 2, 3, 13, 12, 11 (onion model)
      expect(order).toEqual([1, 2, 3, 13, 12, 11])
    })
  })

  describe('middleware context manipulation', () => {
    class ContextMiddleware extends Middleware {
      async handle(context: PipelineContext, next: MiddlewareNext) {
        // Modify context
        context.handled = true

          // Add custom property (TypeScript may complain, but it should work at runtime)
          ; (context as any).customProperty = 'added by middleware'

        await next()
      }
    }

    it('should allow middleware to modify context', async () => {
      const middleware = new ContextMiddleware()
      const listener = vi.fn()

      pipeline.addMiddleware(middleware)
      pipeline.on('test', listener)

      await pipeline.emit('test', 'data')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          handled: true,
          customProperty: 'added by middleware'
        })
      )
    })

    class StopPropagationMiddleware extends Middleware {
      async handle(context: PipelineContext, next: MiddlewareNext) {
        context.stopPropagation = true
        await next()
      }
    }

    it('should stop event propagation when stopPropagation is set', async () => {
      const middleware = new StopPropagationMiddleware()
      const listener = vi.fn()

      pipeline.addMiddleware(middleware)
      pipeline.on('test', listener)

      await pipeline.emit('test', 'data')

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('error handling in middleware', () => {
    class ErrorMiddleware extends Middleware {
      async handle(context: PipelineContext, next: MiddlewareNext) {
        throw new Error('Middleware failed')
      }
    }

    it('should propagate middleware errors', async () => {
      const middleware = new ErrorMiddleware()

      pipeline.addMiddleware(middleware)

      await expect(pipeline.emit('test', 'data')).rejects.toThrow('Middleware failed')
    })

    class ConditionalErrorMiddleware extends Middleware {
      async handle(context: PipelineContext, next: MiddlewareNext) {
        if (context.event.payload === 'error') {
          throw new Error('Conditional error')
        }
        await next()
      }
    }

    it('should handle conditional errors in middleware', async () => {
      const middleware = new ConditionalErrorMiddleware()
      const listener = vi.fn()

      pipeline.addMiddleware(middleware)
      pipeline.on('test', listener)

      // Should work normally
      await pipeline.emit('test', 'normal')
      expect(listener).toHaveBeenCalledOnce()

      // Should throw error
      await expect(pipeline.emit('test', 'error')).rejects.toThrow('Conditional error')
    })
  })

  describe('middleware with async operations', () => {
    class AsyncMiddleware extends Middleware {
      async handle(context: PipelineContext, next: MiddlewareNext) {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10))
        context.handled = true
        await next()
      }
    }

    it('should handle async middleware operations', async () => {
      const middleware = new AsyncMiddleware()
      const listener = vi.fn()

      pipeline.addMiddleware(middleware)
      pipeline.on('test', listener)

      await pipeline.emit('test', 'data')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          handled: true
        })
      )
    })
  })
})