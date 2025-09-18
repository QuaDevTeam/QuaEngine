import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginAPIRegistry, PluginDiscovery } from '../src/plugins'

describe('plugin system integration', () => {
  let registry: PluginAPIRegistry
  let discovery: PluginDiscovery

  beforeEach(() => {
    registry = PluginAPIRegistry.getInstance()
    discovery = new PluginDiscovery()
  })

  afterEach(() => {
    // Clean up registry
    // registry.clear() // If such method exists
  })

  describe('plugin API Registry', () => {
    it('should be a singleton', () => {
      const registry1 = PluginAPIRegistry.getInstance()
      const registry2 = PluginAPIRegistry.getInstance()
      expect(registry1).toBe(registry2)
    })

    it('should register and unregister plugins', () => {
      const mockRegistration = {
        pluginName: 'test',
        apis: [{
          name: 'testFunction',
          fn: () => 'test',
          module: 'test',
        }],
        decorators: {
          TestDecorator: {
            function: 'testFunction',
            module: 'test',
          },
        },
      }

      registry.registerPlugin(mockRegistration)

      expect(registry.hasAPI('test', 'testFunction')).toBe(true)
      expect(registry.hasDecorator('TestDecorator')).toBe(true)

      registry.unregisterPlugin('test')

      expect(registry.hasAPI('test', 'testFunction')).toBe(false)
      expect(registry.hasDecorator('TestDecorator')).toBe(false)
    })

    it('should prevent duplicate plugin registrations', () => {
      const mockRegistration = {
        pluginName: 'test',
        apis: [{
          name: 'testFunction',
          fn: () => 'test',
          module: 'test',
        }],
        decorators: {},
      }

      registry.registerPlugin(mockRegistration)
      expect(() => registry.registerPlugin(mockRegistration)).toThrow('already registered')
    })

    it('should generate extended decorator mappings', () => {
      const mockRegistration = {
        pluginName: 'test',
        apis: [],
        decorators: {
          TestDecorator: {
            function: 'testFunction',
            module: 'test',
          },
        },
      }

      registry.registerPlugin(mockRegistration)

      const mappings = registry.getExtendedDecoratorMappings()

      expect(mappings).toHaveProperty('TestDecorator')
      expect(mappings.TestDecorator).toEqual({
        function: 'testFunction',
        module: 'test',
      })
    })
  })

  describe('plugin Discovery System', () => {
    it('should discover plugins from package.json', async () => {
      const plugins = await discovery.discoverPlugins()
      expect(Array.isArray(plugins)).toBe(true)
    })

    it('should get decorator mappings from discovered plugins', async () => {
      const mappings = await discovery.getDecoratorMappings()
      expect(typeof mappings).toBe('object')
    })

    it('should handle missing package.json gracefully', async () => {
      const emptyDiscovery = new PluginDiscovery('/nonexistent')
      const plugins = await emptyDiscovery.discoverPlugins()
      expect(plugins).toEqual([])
    })
  })
})
