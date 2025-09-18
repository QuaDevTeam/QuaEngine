import { describe, it, expect, beforeEach } from 'vitest'
import { PluginContextImpl } from '../src/plugins/core/context'
import { BaseEnginePlugin, PluginFramework, defineAPIFunction } from '../src/plugins'
import type { EngineContext } from '../src/plugins'

// Mock EngineContext for testing
const createMockContext = (pluginContext: PluginContextImpl): EngineContext => ({
  engine: {} as any,
  store: {} as any,
  assets: {} as any,
  pipeline: {} as any,
  plugins: pluginContext,
})

describe('Plugin Interaction System', () => {
  let pluginContext: PluginContextImpl

  beforeEach(() => {
    pluginContext = new PluginContextImpl()
  })

  describe('Plugin Context API', () => {
    it('should allow plugins to access other plugins by name', async () => {
      // Create test plugins
      class PluginA extends BaseEnginePlugin {
        readonly name = 'plugin-a'
        
        getMessage(): string {
          return 'Hello from Plugin A'
        }
      }

      class PluginB extends BaseEnginePlugin {
        readonly name = 'plugin-b'
        private pluginA?: PluginA

        async setup(ctx: EngineContext): Promise<void> {
          this.pluginA = ctx.plugins.getPlugin<PluginA>('plugin-a')
        }

        getMessageFromA(): string | undefined {
          return this.pluginA?.getMessage()
        }
      }

      const pluginA = new PluginA()
      const pluginB = new PluginB()

      // Register plugins in context
      pluginContext.registerPlugin(pluginA)
      pluginContext.registerPlugin(pluginB)

      // Initialize plugins
      const mockCtx = createMockContext(pluginContext)
      await pluginA.init(mockCtx)
      await pluginB.init(mockCtx)

      // Test interaction
      expect(pluginB.getMessageFromA()).toBe('Hello from Plugin A')
    })

    it('should allow plugins to access other plugins by ID', async () => {
      // Create test plugins with IDs
      class PluginWithId extends BaseEnginePlugin {
        readonly name = 'plugin-with-id'
        readonly id = 'unique-plugin-id'
        
        getValue(): number {
          return 42
        }
      }

      class ConsumerPlugin extends BaseEnginePlugin {
        readonly name = 'consumer-plugin'
        private targetPlugin?: PluginWithId

        async setup(ctx: EngineContext): Promise<void> {
          this.targetPlugin = ctx.plugins.getPluginById<PluginWithId>('unique-plugin-id')
        }

        getValueFromTarget(): number | undefined {
          return this.targetPlugin?.getValue()
        }
      }

      const pluginWithId = new PluginWithId()
      const consumerPlugin = new ConsumerPlugin()

      // Register plugins in context
      pluginContext.registerPlugin(pluginWithId)
      pluginContext.registerPlugin(consumerPlugin)

      // Initialize plugins
      const mockCtx = createMockContext(pluginContext)
      await pluginWithId.init(mockCtx)
      await consumerPlugin.init(mockCtx)

      // Test interaction
      expect(consumerPlugin.getValueFromTarget()).toBe(42)
    })

    it('should check if plugins are registered', async () => {
      class TestPlugin extends BaseEnginePlugin {
        readonly name = 'test-plugin'
        private hasOtherPlugin = false

        async setup(ctx: EngineContext): Promise<void> {
          this.hasOtherPlugin = ctx.plugins.hasPlugin('non-existent-plugin')
        }

        getHasOtherPlugin(): boolean {
          return this.hasOtherPlugin
        }
      }

      const testPlugin = new TestPlugin()
      pluginContext.registerPlugin(testPlugin)

      const mockCtx = createMockContext(pluginContext)
      await testPlugin.init(mockCtx)

      expect(testPlugin.getHasOtherPlugin()).toBe(false)
    })

    it('should get all registered plugins', async () => {
      class PluginCounter extends BaseEnginePlugin {
        readonly name = 'plugin-counter'
        private pluginCount = 0

        async setup(ctx: EngineContext): Promise<void> {
          this.pluginCount = ctx.plugins.getAllPlugins().size
        }

        getPluginCount(): number {
          return this.pluginCount
        }
      }

      class DummyPlugin extends BaseEnginePlugin {
        readonly name = 'dummy-plugin'
      }

      const pluginCounter = new PluginCounter()
      const dummyPlugin = new DummyPlugin()

      pluginContext.registerPlugin(dummyPlugin)
      pluginContext.registerPlugin(pluginCounter)

      const mockCtx = createMockContext(pluginContext)
      await pluginCounter.init(mockCtx)

      // Should count itself + dummy plugin
      expect(pluginCounter.getPluginCount()).toBe(2)
    })

    it('should unregister plugins correctly', () => {
      class TestPlugin extends BaseEnginePlugin {
        readonly name = 'test-plugin'
        readonly id = 'test-id'
      }

      const plugin = new TestPlugin()
      
      // Register plugin
      pluginContext.registerPlugin(plugin)
      expect(pluginContext.hasPlugin('test-plugin')).toBe(true)
      expect(pluginContext.getPluginById('test-id')).toBe(plugin)

      // Unregister plugin
      pluginContext.unregisterPlugin(plugin)
      expect(pluginContext.hasPlugin('test-plugin')).toBe(false)
      expect(pluginContext.getPluginById('test-id')).toBeUndefined()
    })
  })

  describe('Plugin Framework Helpers', () => {
    it('should provide helper methods for plugin interaction', async () => {
      class PluginA extends PluginFramework {
        readonly name = 'framework-plugin-a'
        
        protected getPluginAPIs() {
          return [
            defineAPIFunction('getFrameworkMessage', () => 'Hello from Framework Plugin A')
          ]
        }

        protected getPluginDecorators() {
          return {}
        }

        getPublicMessage(): string {
          return 'Public message from A'
        }
      }

      class PluginB extends PluginFramework {
        readonly name = 'framework-plugin-b'
        private pluginA?: PluginA

        protected getPluginAPIs() {
          return []
        }

        protected getPluginDecorators() {
          return {}
        }

        async setup(): Promise<void> {
          this.pluginA = this.getPlugin<PluginA>('framework-plugin-a')
        }

        getMessageFromA(): string | undefined {
          return this.pluginA?.getPublicMessage()
        }

        checkIfPluginAExists(): boolean {
          return this.hasPlugin('framework-plugin-a')
        }
      }

      const pluginA = new PluginA()
      const pluginB = new PluginB()

      pluginContext.registerPlugin(pluginA)
      pluginContext.registerPlugin(pluginB)

      const mockCtx = createMockContext(pluginContext)
      await pluginA.init(mockCtx)
      await pluginB.init(mockCtx)

      expect(pluginB.getMessageFromA()).toBe('Public message from A')
      expect(pluginB.checkIfPluginAExists()).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle cases where requested plugins do not exist', async () => {
      class SafePlugin extends BaseEnginePlugin {
        readonly name = 'safe-plugin'
        private nonExistentPlugin?: any

        async setup(ctx: EngineContext): Promise<void> {
          this.nonExistentPlugin = ctx.plugins.getPlugin('non-existent')
        }

        hasNonExistentPlugin(): boolean {
          return this.nonExistentPlugin !== undefined
        }
      }

      const safePlugin = new SafePlugin()
      pluginContext.registerPlugin(safePlugin)

      const mockCtx = createMockContext(pluginContext)
      await safePlugin.init(mockCtx)

      expect(safePlugin.hasNonExistentPlugin()).toBe(false)
    })

    it('should handle plugin access before initialization gracefully', () => {
      class FrameworkPlugin extends PluginFramework {
        readonly name = 'uninitialized-plugin'
        
        protected getPluginAPIs() {
          return []
        }

        protected getPluginDecorators() {
          return {}
        }

        tryToAccessPlugin(): string {
          try {
            this.getPlugin('some-plugin')
            return 'success'
          } catch (error) {
            return 'error'
          }
        }
      }

      const plugin = new FrameworkPlugin()
      expect(plugin.tryToAccessPlugin()).toBe('error')
    })
  })

  describe('Plugin Context Implementation', () => {
    it('should maintain separate name and ID registries', () => {
      class PluginWithBoth extends BaseEnginePlugin {
        readonly name = 'named-plugin'
        readonly id = 'plugin-id'
      }

      const plugin = new PluginWithBoth()
      pluginContext.registerPlugin(plugin)

      // Should be accessible by both name and ID
      expect(pluginContext.getPlugin('named-plugin')).toBe(plugin)
      expect(pluginContext.getPluginById('plugin-id')).toBe(plugin)
      expect(pluginContext.hasPlugin('named-plugin')).toBe(true)
    })

    it('should clear all plugins when requested', () => {
      class Plugin1 extends BaseEnginePlugin {
        readonly name = 'plugin-1'
        readonly id = 'id-1'
      }

      class Plugin2 extends BaseEnginePlugin {
        readonly name = 'plugin-2'
      }

      const plugin1 = new Plugin1()
      const plugin2 = new Plugin2()

      pluginContext.registerPlugin(plugin1)
      pluginContext.registerPlugin(plugin2)

      expect(pluginContext.getAllPlugins().size).toBe(2)

      pluginContext.clear()

      expect(pluginContext.getAllPlugins().size).toBe(0)
      expect(pluginContext.hasPlugin('plugin-1')).toBe(false)
      expect(pluginContext.getPluginById('id-1')).toBeUndefined()
    })
  })
})