import { describe, it, expect, vi } from 'vitest'
import { Pipeline, Middleware, Plugin, type PipelineContext, type MiddlewareNext, type PluginEmitHook, type PluginOnHook } from '../src/index'

describe('Pipeline Integration', () => {
  describe('complete workflow', () => {
    // Create a logging middleware
    class LoggingMiddleware extends Middleware {
      logs: string[] = []

      constructor(eventTypes?: string[]) {
        super(eventTypes)
      }

      async handle(context: PipelineContext, next: MiddlewareNext) {
        this.logs.push(`[MIDDLEWARE] Before: ${context.event.type}`)
        await next()
        this.logs.push(`[MIDDLEWARE] After: ${context.event.type}`)
      }
    }

    // Create a validation middleware
    class ValidationMiddleware extends Middleware {
      constructor() {
        super(['user:action'])
      }

      async handle(context: PipelineContext, next: MiddlewareNext) {
        if (context.event.type === 'user:action' && !context.event.payload) {
          context.stopPropagation = true
          return
        }
        await next()
      }
    }

    // Create a caching plugin
    class CachePlugin extends Plugin {
      readonly name = 'cache-plugin'
      private cache = new Map<string, any>()
      private listeners = new Map<string, Set<Function>>()

      setup(pipeline: Pipeline) {
        const emitHook: PluginEmitHook = async (type, payload, originalEmit) => {
          // Cache the event
          this.cache.set(`${type}:${JSON.stringify(payload)}`, {
            type,
            payload,
            timestamp: Date.now()
          })

          await originalEmit(type, payload)
        }

        const onHook: PluginOnHook = (type, listener, originalOn) => {
          // Track listeners for cache replay
          if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set())
          }
          this.listeners.get(type)!.add(listener)

          return originalOn(type, listener)
        }

        this.setEmitHook(emitHook)
        this.setOnHook(onHook)
      }

      getCacheSize(): number {
        return this.cache.size
      }

      replayEvents(type: string) {
        const listeners = this.listeners.get(type)
        if (!listeners) return

        for (const [key, event] of this.cache.entries()) {
          if (event.type === type) {
            const context = {
              event: {
                ...event,
                id: `replay-${event.type}-${Date.now()}`
              },
              handled: false,
              stopPropagation: false
            }

            listeners.forEach(listener => {
              try {
                listener(context)
              } catch (error) {
                // Handle error
              }
            })
          }
        }
      }
    }

    it('should demonstrate complete pipeline workflow', async () => {
      // Create pipeline with middlewares and plugins
      const loggingMiddleware = new LoggingMiddleware()
      const validationMiddleware = new ValidationMiddleware()
      const cachePlugin = new CachePlugin()

      const pipeline = new Pipeline({
        middlewares: [loggingMiddleware, validationMiddleware],
        plugins: [cachePlugin]
      })

      // Set up listeners
      const userActionListener = vi.fn()
      const gameEventListener = vi.fn()
      const allEventListener = vi.fn()

      pipeline.on('user:action', userActionListener)
      pipeline.on('game:event', gameEventListener)
      pipeline.onEvent(allEventListener)

      // Test 1: Valid user action
      await pipeline.emit('user:action', { action: 'move', x: 10, y: 20 })

      expect(userActionListener).toHaveBeenCalledOnce()
      expect(allEventListener).toHaveBeenCalledTimes(1)
      expect(loggingMiddleware.logs).toContain('[MIDDLEWARE] Before: user:action')
      expect(loggingMiddleware.logs).toContain('[MIDDLEWARE] After: user:action')
      expect(cachePlugin.getCacheSize()).toBe(1)

      // Test 2: Invalid user action (should be blocked by validation)
      await pipeline.emit('user:action', null)

      expect(userActionListener).toHaveBeenCalledOnce() // Still only once
      expect(allEventListener).toHaveBeenCalledTimes(1) // Still only once (blocked)
      expect(cachePlugin.getCacheSize()).toBe(2) // Cache still records it

      // Test 3: Game event (not filtered by validation middleware)
      await pipeline.emit('game:event', { score: 100 })

      expect(gameEventListener).toHaveBeenCalledOnce()
      expect(allEventListener).toHaveBeenCalledTimes(2) // Now twice
      expect(loggingMiddleware.logs).toContain('[MIDDLEWARE] Before: game:event')
      expect(loggingMiddleware.logs).toContain('[MIDDLEWARE] After: game:event')
      expect(cachePlugin.getCacheSize()).toBe(3)

      // Test 4: Cache replay
      const replayListener = vi.fn()
      pipeline.on('user:action', replayListener)

      cachePlugin.replayEvents('user:action')

      expect(replayListener).toHaveBeenCalledTimes(2) // Both cached user:action events
    })

    it('should handle error scenarios gracefully', async () => {
      class ErrorMiddleware extends Middleware {
        async handle(context: PipelineContext, next: MiddlewareNext) {
          if (context.event.payload === 'error') {
            throw new Error('Middleware error')
          }
          await next()
        }
      }

      class ErrorPlugin extends Plugin {
        readonly name = 'error-plugin'

        async setup(pipeline: Pipeline) {
          throw new Error('Plugin setup error')
        }
      }

      const pipeline = new Pipeline({
        middlewares: [new ErrorMiddleware()],
        plugins: [new ErrorPlugin()]
      })

      const listener = vi.fn()
      pipeline.on('test', listener)

      // Normal event should work
      await pipeline.emit('test', 'normal')
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            payload: 'normal'
          })
        })
      )

      // Error event should throw
      await expect(pipeline.emit('test', 'error')).rejects.toThrow('Middleware error')

      // Listener errors should be handled gracefully
      const errorListener = vi.fn(() => {
        throw new Error('Listener error')
      })
      const normalListener = vi.fn()

      pipeline.on('error-test', errorListener)
      pipeline.on('error-test', normalListener)

      await pipeline.emit('error-test', 'data')

      expect(errorListener).toHaveBeenCalledOnce()
      expect(normalListener).toHaveBeenCalledOnce()
    })

    it('should support dynamic plugin installation', async () => {
      const pipeline = new Pipeline()

      // Create plugin that can be installed later
      class DynamicPlugin extends Plugin {
        readonly name = 'dynamic-plugin'
        interceptedEvents: any[] = []

        setup(pipeline: Pipeline) {
          const emitHook: PluginEmitHook = async (type, payload, originalEmit) => {
            this.interceptedEvents.push({ type, payload })
            await originalEmit(type, payload)
          }

          this.setEmitHook(emitHook)
        }
      }

      const listener = vi.fn()
      pipeline.on('test', listener)

      // Emit event before plugin
      await pipeline.emit('test', 'before-plugin')
      expect(listener).toHaveBeenCalledTimes(1)

      // Install plugin dynamically
      const dynamicPlugin = new DynamicPlugin()
      pipeline.use(dynamicPlugin)

      // Emit event after plugin
      await pipeline.emit('test', 'after-plugin')
      expect(listener).toHaveBeenCalledTimes(2)
      expect(dynamicPlugin.interceptedEvents).toHaveLength(1)
      expect(dynamicPlugin.interceptedEvents[0]).toEqual({
        type: 'test',
        payload: 'after-plugin'
      })
    })

    it('should maintain performance with many listeners and events', async () => {
      const pipeline = new Pipeline()
      const listeners: any[] = []

      // Add many listeners
      for (let i = 0; i < 100; i++) {
        const listener = vi.fn()
        listeners.push(listener)
        pipeline.on('performance-test', listener)
      }

      const startTime = Date.now()

      // Emit many events
      for (let i = 0; i < 100; i++) {
        await pipeline.emit('performance-test', i)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000) // 1 second

      // All listeners should have been called for all events
      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledTimes(100)
      })
    })
  })

  describe('version export', () => {
    it('should export correct version', () => {
      const { version } = require('../src/index')
      expect(version).toBe('0.1.0')
    })
  })
})