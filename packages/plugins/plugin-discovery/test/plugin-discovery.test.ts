import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  discoverPlugins,
  getDiscoveredDecoratorMappings,
  loadPlugin,
  getAvailablePlugins,
  validatePluginConfig,
  mergeDecoratorMappings,
  type PluginConfig,
  type DecoratorMapping
} from '../src/index'

// Mock fs functions
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}))

const mockReadFileSync = vi.mocked(readFileSync)
const mockExistsSync = vi.mocked(existsSync)

describe('plugin Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('discoverPlugins', () => {
    it('should discover plugins from qua.plugins.json', async () => {
      const pluginConfig = {
        plugins: [
          {
            name: 'audio-plugin',
            version: '1.0.0',
            decorators: {
              PlaySound: { function: 'playSound', module: 'audio' }
            }
          }
        ]
      }

      // Mock to return true only for the first qua.plugins.json path
      mockExistsSync.mockImplementation((path: any) => {
        const pathStr = path.toString()
        return pathStr.endsWith('/test/project/qua.plugins.json')
      })

      mockReadFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString()
        if (pathStr.endsWith('/test/project/qua.plugins.json')) {
          return JSON.stringify(pluginConfig)
        }
        throw new Error('File not found')
      })

      const plugins = await discoverPlugins('/test/project')

      expect(plugins).toHaveLength(1)
      expect(plugins[0].name).toBe('audio-plugin')
      expect(plugins[0].decorators).toBeDefined()
    })

    it('should discover plugins from package.json dependencies', async () => {
      const packageJson = {
        dependencies: {
          '@quajs/plugin-audio': '^1.0.0',
          'regular-package': '^1.0.0'
        }
      }

      // Mock to return true only for package.json
      mockExistsSync.mockImplementation((path: any) => {
        const pathStr = path.toString()
        return pathStr.endsWith('/test/project/package.json')
      })

      mockReadFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString()
        if (pathStr.endsWith('/test/project/package.json')) {
          return JSON.stringify(packageJson)
        }
        throw new Error('File not found')
      })

      const plugins = await discoverPlugins('/test/project')

      expect(plugins.length).toBeGreaterThan(0)
      expect(plugins.some(p => p.name === '@quajs/plugin-audio')).toBe(true)
      expect(plugins.some(p => p.name === 'regular-package')).toBe(false)
    })

    it('should handle missing configuration files gracefully', async () => {
      mockExistsSync.mockReturnValue(false)

      const plugins = await discoverPlugins('/test/project')

      expect(plugins).toEqual([])
    })

    it('should handle invalid JSON gracefully', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('invalid json')

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const plugins = await discoverPlugins('/test/project')

      expect(plugins).toEqual([])
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('getDiscoveredDecoratorMappings', () => {
    it('should merge decorators from all discovered plugins', async () => {
      const pluginConfig = {
        plugins: [
          {
            name: 'audio-plugin',
            decorators: {
              PlaySound: { function: 'playSound', module: 'audio' }
            }
          },
          {
            name: 'video-plugin',
            decorators: {
              PlayVideo: { function: 'playVideo', module: 'video' }
            }
          }
        ]
      }

      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().endsWith('/test/project/qua.plugins.json')
      })
      mockReadFileSync.mockImplementation((path: any) => {
        if (path.toString().endsWith('/test/project/qua.plugins.json')) {
          return JSON.stringify(pluginConfig)
        }
        throw new Error('File not found')
      })

      const mappings = await getDiscoveredDecoratorMappings('/test/project')

      expect(mappings).toEqual({
        PlaySound: { function: 'playSound', module: 'audio' },
        PlayVideo: { function: 'playVideo', module: 'video' }
      })
    })

    it('should return empty mappings when no plugins have decorators', async () => {
      const pluginConfig = {
        plugins: [
          { name: 'simple-plugin' }
        ]
      }

      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().endsWith('/test/project/qua.plugins.json')
      })
      mockReadFileSync.mockImplementation((path: any) => {
        if (path.toString().endsWith('/test/project/qua.plugins.json')) {
          return JSON.stringify(pluginConfig)
        }
        throw new Error('File not found')
      })

      const mappings = await getDiscoveredDecoratorMappings('/test/project')

      expect(mappings).toEqual({})
    })
  })

  describe('loadPlugin', () => {
    it('should load a specific plugin by name', async () => {
      const pluginConfig = {
        plugins: [
          { name: 'audio-plugin', version: '1.0.0' },
          { name: 'video-plugin', version: '2.0.0' }
        ]
      }

      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().endsWith('/test/project/qua.plugins.json')
      })
      mockReadFileSync.mockImplementation((path: any) => {
        if (path.toString().endsWith('/test/project/qua.plugins.json')) {
          return JSON.stringify(pluginConfig)
        }
        throw new Error('File not found')
      })

      const plugin = await loadPlugin('audio-plugin', '/test/project')

      expect(plugin).not.toBeNull()
      expect(plugin?.name).toBe('audio-plugin')
      expect(plugin?.version).toBe('1.0.0')
    })

    it('should return null for non-existent plugin', async () => {
      mockExistsSync.mockReturnValue(false)

      const plugin = await loadPlugin('non-existent', '/test/project')

      expect(plugin).toBeNull()
    })
  })

  describe('getAvailablePlugins', () => {
    it('should return list of available plugin names', async () => {
      const pluginConfig = {
        plugins: [
          { name: 'audio-plugin' },
          { name: 'video-plugin' },
          { name: 'ui-plugin' }
        ]
      }

      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().endsWith('/test/project/qua.plugins.json')
      })
      mockReadFileSync.mockImplementation((path: any) => {
        if (path.toString().endsWith('/test/project/qua.plugins.json')) {
          return JSON.stringify(pluginConfig)
        }
        throw new Error('File not found')
      })

      const names = await getAvailablePlugins('/test/project')

      expect(names).toEqual(['audio-plugin', 'video-plugin', 'ui-plugin'])
    })
  })

  describe('validatePluginConfig', () => {
    it('should validate correct plugin config', () => {
      const config: PluginConfig = {
        name: 'test-plugin',
        version: '1.0.0'
      }

      expect(validatePluginConfig(config)).toBe(true)
    })

    it('should reject config without name', () => {
      const config = {
        version: '1.0.0'
      }

      expect(validatePluginConfig(config)).toBe(false)
    })

    it('should reject null or undefined config', () => {
      expect(validatePluginConfig(null)).toBe(false)
      expect(validatePluginConfig(undefined)).toBe(false)
    })

    it('should reject config with empty name', () => {
      const config = {
        name: '',
        version: '1.0.0'
      }

      expect(validatePluginConfig(config)).toBe(false)
    })
  })

  describe('mergeDecoratorMappings', () => {
    it('should merge multiple decorator mappings', () => {
      const mapping1: DecoratorMapping = {
        PlaySound: { function: 'playSound', module: 'audio' }
      }

      const mapping2: DecoratorMapping = {
        PlayVideo: { function: 'playVideo', module: 'video' }
      }

      const mapping3: DecoratorMapping = {
        ShowUI: { function: 'showUI', module: 'ui' }
      }

      const merged = mergeDecoratorMappings(mapping1, mapping2, mapping3)

      expect(merged).toEqual({
        PlaySound: { function: 'playSound', module: 'audio' },
        PlayVideo: { function: 'playVideo', module: 'video' },
        ShowUI: { function: 'showUI', module: 'ui' }
      })
    })

    it('should handle overlapping keys (later mappings override)', () => {
      const mapping1: DecoratorMapping = {
        PlaySound: { function: 'playSound1', module: 'audio1' }
      }

      const mapping2: DecoratorMapping = {
        PlaySound: { function: 'playSound2', module: 'audio2' }
      }

      const merged = mergeDecoratorMappings(mapping1, mapping2)

      expect(merged).toEqual({
        PlaySound: { function: 'playSound2', module: 'audio2' }
      })
    })

    it('should handle empty mappings', () => {
      const mapping: DecoratorMapping = {
        PlaySound: { function: 'playSound', module: 'audio' }
      }

      const merged = mergeDecoratorMappings({}, mapping, {})

      expect(merged).toEqual({
        PlaySound: { function: 'playSound', module: 'audio' }
      })
    })
  })
})