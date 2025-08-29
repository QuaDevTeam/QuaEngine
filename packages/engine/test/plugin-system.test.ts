import type { EngineContext } from '../src/plugins'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AchievementPlugin, PluginAPIRegistry } from '../src/plugins'

// Mock engine context
function createMockEngineContext(): EngineContext {
  return {
    engine: {} as any,
    store: {
      state: {},
      commit: vi.fn(),
    } as any,
    assets: {} as any,
    pipeline: {
      emit: vi.fn().mockResolvedValue(undefined),
    } as any,
    stepId: 'test-step-1',
  }
}

describe('plugin System Integration', () => {
  let registry: PluginAPIRegistry
  let plugin: AchievementPlugin
  let mockContext: EngineContext

  beforeEach(() => {
    registry = PluginAPIRegistry.getInstance()
    plugin = new AchievementPlugin()
    mockContext = createMockEngineContext()
  })

  afterEach(() => {
    // Clean up registry
    registry.unregisterPlugin('achievement')
  })

  describe('plugin API Registry', () => {
    it('should be a singleton', () => {
      const registry1 = PluginAPIRegistry.getInstance()
      const registry2 = PluginAPIRegistry.getInstance()
      expect(registry1).toBe(registry2)
    })

    it('should register and unregister plugins', async () => {
      const registration = await plugin.registerAPIs()
      registry.registerPlugin(registration)

      expect(registry.hasAPI('achievement', 'unlock')).toBe(true)
      expect(registry.hasDecorator('UnlockAchievement')).toBe(true)

      registry.unregisterPlugin('achievement')

      expect(registry.hasAPI('achievement', 'unlock')).toBe(false)
      expect(registry.hasDecorator('UnlockAchievement')).toBe(false)
    })

    it('should prevent duplicate plugin registrations', async () => {
      const registration = await plugin.registerAPIs()
      registry.registerPlugin(registration)

      expect(() => registry.registerPlugin(registration)).toThrow('already registered')
    })

    it('should generate extended decorator mappings', async () => {
      const registration = await plugin.registerAPIs()
      registry.registerPlugin(registration)

      const mappings = registry.getExtendedDecoratorMappings()

      expect(mappings).toHaveProperty('UnlockAchievement')
      expect(mappings.UnlockAchievement).toEqual({
        function: 'unlock',
        module: 'achievement',
      })
    })
  })

  describe('achievement Plugin', () => {
    beforeEach(async () => {
      await plugin.init(mockContext)
    })

    afterEach(async () => {
      await plugin.destroy()
    })

    it('should register APIs correctly', async () => {
      const registration = await plugin.registerAPIs()

      expect(registration.pluginName).toBe('achievement')
      expect(registration.apis).toHaveLength(4) // unlock, isUnlocked, getProgress, addProgress
      expect(registration.decorators).toHaveProperty('UnlockAchievement')
      expect(registration.decorators).toHaveProperty('AchievementProgress')
    })

    it('should initialize with default achievements', () => {
      const module = registry.getPluginModule('achievement')
      expect(module?.isUnlocked('first_dialogue')).toBe(false)
      expect(module?.isUnlocked('story_progress')).toBe(false)
    })

    it('should unlock achievements', async () => {
      const module = registry.getPluginModule('achievement')

      const result = await module?.unlock('first_dialogue')
      expect(result).toBe(true)
      expect(module?.isUnlocked('first_dialogue')).toBe(true)

      // Should not unlock again
      const result2 = await module?.unlock('first_dialogue')
      expect(result2).toBe(false)
    })

    it('should track progress', async () => {
      const module = registry.getPluginModule('achievement')

      await module?.addProgress('story_progress', 10)
      const progress = module?.getProgress('story_progress')

      expect(progress).toEqual({
        current: 10,
        max: 100,
        percentage: 10,
      })
    })

    it('should handle game step events', async () => {
      await plugin.onStep(mockContext)

      const module = registry.getPluginModule('achievement')
      expect(module?.isUnlocked('first_dialogue')).toBe(true)
    })

    it('should emit plugin events directly via pipeline', async () => {
      await plugin.onStep(mockContext)

      // Developer manages pipeline communication directly
      expect(mockContext.pipeline.emit).toHaveBeenCalledWith(
        'achievement.unlocked',
        expect.objectContaining({
          pluginName: 'achievement',
          achievementId: 'first_dialogue',
        }),
      )
    })

    it('should demonstrate developer freedom', () => {
      // Developer has direct access to all context components through the plugin's context
      // Test that the plugin was initialized with proper context by using getContext method
      const context = (plugin as any).getContext()
      expect(context).toBeDefined()
      expect(context.store).toBeDefined()
      expect(context.pipeline).toBeDefined()
      expect(context.assets).toBeDefined()
      expect(context.engine).toBeDefined()

      // No predefined helpers - full flexibility
      expect(typeof context.pipeline.emit).toBe('function')
    })
  })
})
