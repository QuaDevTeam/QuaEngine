import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Pipeline, Plugin, type PluginEmitHook, type PluginOnHook, type PluginOffHook } from '../src/index'

describe('Plugin', () => {
  let pipeline: Pipeline

  beforeEach(() => {
    pipeline = new Pipeline()
  })

  describe('abstract plugin class', () => {
    class TestPlugin extends Plugin {
      readonly name = 'test-plugin'
      setupCalled = false

      setup(pipeline: Pipeline) {
        this.setupCalled = true
      }
    }

    it('should create plugin with required properties', () => {
      const plugin = new TestPlugin()
      expect(plugin.name).toBe('test-plugin')
      expect(plugin).toBeInstanceOf(Plugin)
    })

    it('should call setup when installed', () => {
      const plugin = new TestPlugin()
      pipeline.use(plugin)

      expect(plugin.setupCalled).toBe(true)
    })

    it('should not install same plugin twice', () => {
      const plugin = new TestPlugin()

      pipeline.use(plugin)
      pipeline.use(plugin) // Should be ignored

      expect(plugin.setupCalled).toBe(true)
    })
  })

  describe('plugin hooks', () => {
    describe('emit hook', () => {
      class EmitHookPlugin extends Plugin {
        readonly name = 'emit-hook-plugin'
        emitCalls: Array<{ type: string; payload: unknown }> = []

        setup(pipeline: Pipeline) {
          const emitHook: PluginEmitHook = async (type, payload, originalEmit) => {
            this.emitCalls.push({ type, payload })

            // Modify the payload
            const modifiedPayload = typeof payload === 'string' ? payload.toUpperCase() : payload
            await originalEmit(type, modifiedPayload)
          }

          this.setEmitHook(emitHook)
        }
      }

      it('should intercept emit calls', async () => {
        const plugin = new EmitHookPlugin()
        const listener = vi.fn()

        pipeline.use(plugin)
        pipeline.on('test', listener)

        await pipeline.emit('test', 'hello')

        expect(plugin.emitCalls).toHaveLength(1)
        expect(plugin.emitCalls[0]).toEqual({
          type: 'test',
          payload: 'hello'
        })

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              type: 'test',
              payload: 'HELLO' // Modified by plugin
            })
          })
        )
      })

      it('should allow plugin to prevent original emit', async () => {
        class PreventEmitPlugin extends Plugin {
          readonly name = 'prevent-emit-plugin'

          setup(pipeline: Pipeline) {
            const emitHook: PluginEmitHook = async (type, payload, originalEmit) => {
              // Don't call originalEmit - prevent the event
              if (type === 'blocked') {
                return
              }
              await originalEmit(type, payload)
            }

            this.setEmitHook(emitHook)
          }
        }

        const plugin = new PreventEmitPlugin()
        const blockedListener = vi.fn()
        const allowedListener = vi.fn()

        pipeline.use(plugin)
        pipeline.on('blocked', blockedListener)
        pipeline.on('allowed', allowedListener)

        await pipeline.emit('blocked', 'data')
        await pipeline.emit('allowed', 'data')

        expect(blockedListener).not.toHaveBeenCalled()
        expect(allowedListener).toHaveBeenCalledOnce()
      })
    })

    describe('on hook', () => {
      class OnHookPlugin extends Plugin {
        readonly name = 'on-hook-plugin'
        registrations: Array<{ type: string; listener: unknown }> = []

        setup(pipeline: Pipeline) {
          const onHook: PluginOnHook = (type, listener, originalOn) => {
            this.registrations.push({ type, listener })
            return originalOn(type, listener)
          }

          this.setOnHook(onHook)
        }
      }

      it('should intercept listener registration', () => {
        const plugin = new OnHookPlugin()
        const listener = vi.fn()

        pipeline.use(plugin)
        pipeline.on('test', listener)

        expect(plugin.registrations).toHaveLength(1)
        expect(plugin.registrations[0]).toEqual({
          type: 'test',
          listener
        })
      })

      it('should allow plugin to modify listener registration', async () => {
        class ModifyOnPlugin extends Plugin {
          readonly name = 'modify-on-plugin'

          setup(pipeline: Pipeline) {
            const onHook: PluginOnHook = (type, listener, originalOn) => {
              // Wrap the listener
              const wrappedListener = (context: any) => {
                context.event.payload = `[WRAPPED] ${context.event.payload}`
                return listener(context)
              }

              return originalOn(type, wrappedListener)
            }

            this.setOnHook(onHook)
          }
        }

        const plugin = new ModifyOnPlugin()
        const listener = vi.fn()

        pipeline.use(plugin)
        pipeline.on('test', listener)

        await pipeline.emit('test', 'hello')

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              payload: '[WRAPPED] hello'
            })
          })
        )
      })
    })

    describe('off hook', () => {
      class OffHookPlugin extends Plugin {
        readonly name = 'off-hook-plugin'
        removals: Array<{ type: string; listener: unknown }> = []

        setup(pipeline: Pipeline) {
          const offHook: PluginOffHook = (type, listener, originalOff) => {
            this.removals.push({ type, listener })
            return originalOff(type, listener)
          }

          this.setOffHook(offHook)
        }
      }

      it('should intercept listener removal', () => {
        const plugin = new OffHookPlugin()
        const listener = vi.fn()

        pipeline.use(plugin)
        pipeline.on('test', listener)
        pipeline.off('test', listener)

        expect(plugin.removals).toHaveLength(1)
        expect(plugin.removals[0]).toEqual({
          type: 'test',
          listener
        })
      })
    })

    describe('combined hooks', () => {
      class NetworkPlugin extends Plugin {
        readonly name = 'network-plugin'
        private networkListeners = new Map<string, Set<Function>>()

        setup(pipeline: Pipeline) {
          // Intercept emit to send over network
          const emitHook: PluginEmitHook = async (type, payload, originalEmit) => {
            // Simulate network send
            this.sendToNetwork(type, payload)
            // Don't call originalEmit - we're replacing local with network
          }

          // Intercept on to register network listeners
          const onHook: PluginOnHook = (type, listener, originalOn) => {
            if (!this.networkListeners.has(type)) {
              this.networkListeners.set(type, new Set())
            }
            this.networkListeners.get(type)!.add(listener)

            // Don't register locally, we handle it via network
            return pipeline
          }

          this.setEmitHook(emitHook)
          this.setOnHook(onHook)
        }

        private sendToNetwork(type: string, payload: unknown) {
          // Simulate network transmission and reception
          setTimeout(() => {
            this.receiveFromNetwork(type, payload)
          }, 0)
        }

        private receiveFromNetwork(type: string, payload: unknown) {
          const listeners = this.networkListeners.get(type)
          if (listeners) {
            const context = {
              event: {
                type,
                payload,
                timestamp: Date.now(),
                id: `network-${Date.now()}`
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

      it('should support complex network plugin', async () => {
        const plugin = new NetworkPlugin()
        const listener = vi.fn()

        pipeline.use(plugin)
        pipeline.on('network-event', listener)

        await pipeline.emit('network-event', 'network-data')

        // Wait for network simulation
        await new Promise(resolve => setTimeout(resolve, 10))

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              type: 'network-event',
              payload: 'network-data',
              id: expect.stringContaining('network-')
            })
          })
        )
      })
    })
  })

  describe('async plugin setup', () => {
    class AsyncPlugin extends Plugin {
      readonly name = 'async-plugin'
      setupCompleted = false

      async setup(pipeline: Pipeline) {
        await new Promise(resolve => setTimeout(resolve, 10))
        this.setupCompleted = true
      }
    }

    it('should handle async plugin setup', async () => {
      const plugin = new AsyncPlugin()

      pipeline.use(plugin)

      // Setup is async but install is sync
      expect(plugin.setupCompleted).toBe(false)

      // Wait for async setup
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(plugin.setupCompleted).toBe(true)
    })

    it('should handle plugin setup errors gracefully', async () => {
      class ErrorPlugin extends Plugin {
        readonly name = 'error-plugin'

        async setup(pipeline: Pipeline) {
          throw new Error('Setup failed')
        }
      }

      const plugin = new ErrorPlugin()

      // Should not throw during install
      expect(() => pipeline.use(plugin)).not.toThrow()

      // Wait for async error to be caught
      await new Promise(resolve => setTimeout(resolve, 10))
    })
  })

  describe('plugin interface compatibility', () => {
    // Test legacy plugin interface
    const legacyPlugin = {
      name: 'legacy-plugin',
      install: vi.fn()
    }

    it('should support legacy plugin interface', () => {
      pipeline.use(legacyPlugin)

      expect(legacyPlugin.install).toHaveBeenCalledWith(pipeline)
    })
  })
})