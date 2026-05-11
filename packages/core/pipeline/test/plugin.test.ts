import type { PipelineContext, PipelineEvent, PipelineTransport, PipelineTransportContext } from '../src/index'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalPipelineTransport, Pipeline, Plugin } from '../src/index'

describe('plugin and transport', () => {
  let pipeline: Pipeline

  beforeEach(() => {
    pipeline = new Pipeline()
  })

  describe('abstract plugin class', () => {
    class TestPlugin extends Plugin {
      readonly name = 'test-plugin'
      setupCalled = false

      setup(_pipeline: Pipeline) {
        this.setupCalled = true
      }
    }

    it('should create plugin with required properties', () => {
      const plugin = new TestPlugin()
      expect(plugin.name).toBe('test-plugin')
      expect(plugin).toBeInstanceOf(Plugin)
    })

    it('should call setup when installed', async () => {
      const plugin = new TestPlugin()
      pipeline.use(plugin)

      await pipeline.emit('ready-check', null)

      expect(plugin.setupCalled).toBe(true)
    })

    it('should not install same plugin twice', async () => {
      const plugin = new TestPlugin()

      pipeline.use(plugin)
      pipeline.use(plugin)
      await pipeline.emit('ready-check', null)

      expect(plugin.setupCalled).toBe(true)
    })
  })

  describe('transport', () => {
    it('should use local transport by default', async () => {
      expect(pipeline.getTransport()).toBeInstanceOf(LocalPipelineTransport)

      const listener = vi.fn()
      pipeline.on('test', listener)

      await pipeline.emit('test', 'hello')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'test',
            payload: 'hello',
          }),
        }),
      )
    })

    it('should allow transport to transform delivered events', async () => {
      class UppercaseTransport implements PipelineTransport {
        readonly name = 'uppercase'
        published: Array<PipelineEvent> = []

        async publish(context: PipelineContext, transport: PipelineTransportContext) {
          this.published.push(context.event)
          await transport.deliver({
            ...context,
            event: {
              ...context.event,
              payload: typeof context.event.payload === 'string'
                ? context.event.payload.toUpperCase()
                : context.event.payload,
            },
          })
        }
      }

      const transport = new UppercaseTransport()
      const listener = vi.fn()

      pipeline.setTransport(transport)
      pipeline.on('test', listener)

      await pipeline.emit('test', 'hello')

      expect(transport.published).toHaveLength(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'test',
            payload: 'HELLO',
          }),
        }),
      )
    })

    it('should allow transport to replace local delivery', async () => {
      class DropTransport implements PipelineTransport {
        readonly name = 'drop'
        published: Array<PipelineEvent> = []

        publish(context: PipelineContext) {
          this.published.push(context.event)
        }
      }

      const transport = new DropTransport()
      const listener = vi.fn()

      pipeline.setTransport(transport)
      pipeline.on('blocked', listener)

      await pipeline.emit('blocked', 'data')

      expect(transport.published).toHaveLength(1)
      expect(listener).not.toHaveBeenCalled()
    })

    it('should inject external events through middleware and listeners', async () => {
      class LoopbackTransport implements PipelineTransport {
        readonly name = 'loopback'
        private context?: PipelineTransportContext

        setup(context: PipelineTransportContext) {
          this.context = context
        }

        async publish(context: PipelineContext) {
          await this.context!.receive({
            ...context.event,
            id: `remote-${context.event.id}`,
            payload: `remote:${context.event.payload}`,
          })
        }
      }

      const transport = new LoopbackTransport()
      const listener = vi.fn()
      const middleware = vi.fn(async (context, next) => {
        context.event.payload = `middleware:${context.event.payload}`
        await next()
      })

      pipeline.setTransport(transport)
      pipeline.addMiddleware(middleware)
      pipeline.on('network-event', listener)

      await pipeline.emit('network-event', 'payload')

      expect(middleware).toHaveBeenCalledTimes(2)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'network-event',
            payload: 'middleware:remote:middleware:payload',
            id: expect.stringContaining('remote-'),
          }),
        }),
      )
    })

    it('should notify transport about first subscription and last unsubscribe', async () => {
      class SubscriptionTransport implements PipelineTransport {
        readonly name = 'subscriptions'
        subscriptions: string[] = []
        unsubscriptions: string[] = []

        publish(context: PipelineContext, transport: PipelineTransportContext) {
          return transport.deliver(context)
        }

        subscribe(type: string) {
          this.subscriptions.push(type)
        }

        unsubscribe(type: string) {
          this.unsubscriptions.push(type)
        }
      }

      const transport = new SubscriptionTransport()
      const listenerA = vi.fn()
      const listenerB = vi.fn()

      pipeline.setTransport(transport)
      pipeline.on('event', listenerA)
      pipeline.on('event', listenerB)

      await pipeline.emit('event', 'data')

      pipeline.off('event', listenerA)
      await pipeline.emit('event', 'data')
      pipeline.off('event', listenerB)
      await pipeline.emit('unused', null)

      expect(transport.subscriptions).toEqual(['event'])
      expect(transport.unsubscriptions).toEqual(['event'])
    })

    it('should resubscribe existing listener types when transport changes', async () => {
      class SubscriptionTransport implements PipelineTransport {
        readonly name = 'subscriptions'
        subscriptions: string[] = []

        publish(context: PipelineContext, transport: PipelineTransportContext) {
          return transport.deliver(context)
        }

        subscribe(type: string) {
          this.subscriptions.push(type)
        }
      }

      const listener = vi.fn()
      const transport = new SubscriptionTransport()

      pipeline.on('event', listener)
      pipeline.setTransport(transport)
      await pipeline.emit('event', 'data')

      expect(transport.subscriptions).toEqual(['event'])
      expect(listener).toHaveBeenCalledOnce()
    })
  })

  describe('async setup', () => {
    class AsyncPlugin extends Plugin {
      readonly name = 'async-plugin'
      setupCompleted = false

      async setup(_pipeline: Pipeline) {
        await new Promise(resolve => setTimeout(resolve, 10))
        this.setupCompleted = true
      }
    }

    it('should handle async plugin setup', async () => {
      const plugin = new AsyncPlugin()

      pipeline.use(plugin)

      expect(plugin.setupCompleted).toBe(false)

      await pipeline.emit('ready-check', null)

      expect(plugin.setupCompleted).toBe(true)
    })

    it('should wait for async plugin transport registration before emitting', async () => {
      class AsyncTransportPlugin extends Plugin {
        readonly name = 'async-transport-plugin'

        async setup(pipeline: Pipeline) {
          await new Promise(resolve => setTimeout(resolve, 10))
          pipeline.setTransport(new LocalPipelineTransport())
        }
      }

      const listener = vi.fn()

      pipeline.use(new AsyncTransportPlugin())
      pipeline.on('test', listener)

      await pipeline.emit('test', 'data')

      expect(listener).toHaveBeenCalledOnce()
    })

    it('should wait for async transport setup before publishing', async () => {
      class AsyncTransport implements PipelineTransport {
        readonly name = 'async-transport'
        setupCompleted = false

        async setup(_context: PipelineTransportContext) {
          await new Promise(resolve => setTimeout(resolve, 10))
          this.setupCompleted = true
        }

        publish(context: PipelineContext, transport: PipelineTransportContext) {
          expect(this.setupCompleted).toBe(true)
          return transport.deliver(context)
        }
      }

      const transport = new AsyncTransport()
      const listener = vi.fn()

      pipeline.setTransport(transport)
      pipeline.on('test', listener)

      await pipeline.emit('test', 'data')

      expect(listener).toHaveBeenCalledOnce()
    })

    it('should handle plugin setup errors gracefully', async () => {
      class ErrorPlugin extends Plugin {
        readonly name = 'error-plugin'

        async setup(_pipeline: Pipeline) {
          throw new Error('Setup failed')
        }
      }

      const plugin = new ErrorPlugin()
      const listener = vi.fn()

      expect(() => pipeline.use(plugin)).not.toThrow()

      pipeline.on('test', listener)
      await pipeline.emit('test', 'normal')

      expect(listener).toHaveBeenCalledOnce()
    })
  })
})
