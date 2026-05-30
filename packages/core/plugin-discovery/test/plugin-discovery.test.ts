import type { DecoratorMapping, PluginConfig } from '../src/index'
import { existsSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discoverPlugins,
  getAvailablePlugins,
  getDiscoveredDecoratorMappings,
  getDiscoveredLanguageContributions,
  loadPlugin,
  mergeDecoratorMappings,
  validatePluginConfig,
} from '../src/index'

// Mock fs functions
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

const mockReadFileSync = vi.mocked(readFileSync)
const mockExistsSync = vi.mocked(existsSync)

function mockJsonFiles(files: Record<string, unknown>): void {
  mockExistsSync.mockImplementation(path => hasOwn(files, path.toString()))
  mockReadFileSync.mockImplementation((path) => {
    const key = path.toString()
    if (!hasOwn(files, key)) {
      throw new Error('File not found')
    }

    const value = files[key]
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
}

function hasOwn(files: Record<string, unknown>, path: string): boolean {
  return Object.prototype.hasOwnProperty.call(files, path)
}

function dependencyPackageJsonPath(packageName: string): string {
  return `/test/project/node_modules/${packageName}/package.json`
}

describe('plugin discovery', () => {
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
              AudioChapter: { function: 'configureAudioChapterWithEngine', module: '@quajs/plugin-audio' },
              PlayVoice: { function: 'playVoiceWithEngine', module: '@quajs/plugin-audio' },
            },
            renderer: {
              vue: '@quajs/renderer-vue/plugins/audio',
            },
          },
        ],
      }

      mockJsonFiles({
        '/test/project/qua.plugins.json': pluginConfig,
      })

      const plugins = await discoverPlugins('/test/project')

      expect(plugins).toHaveLength(1)
      expect(plugins[0].name).toBe('audio-plugin')
      expect(plugins[0].decorators).toBeDefined()
    })

    it('should discover plugins from package.json dependencies', async () => {
      mockJsonFiles({
        '/test/project/package.json': {
          dependencies: {
            '@quajs/character': '^1.0.0',
            '@quajs/plugin-audio': '^1.0.0',
            '@quajs/story-graph': '^1.0.0',
            'regular-package': '^1.0.0',
          },
          peerDependencies: {
            '@quajs/plugin-background': '^1.0.0',
          },
          optionalDependencies: {
            '@quajs/plugin-backlog': '^1.0.0',
          },
        },
        [dependencyPackageJsonPath('@quajs/plugin-audio')]: {
          name: '@quajs/plugin-audio',
          version: '0.1.0',
          main: './dist/index.js',
          quajs: {
            type: 'plugin',
            category: 'audio',
            decorators: {
              PlayBGM: { function: 'playBGMWithEngine', module: '@quajs/plugin-audio' },
            },
            renderer: {
              web: '@quajs/renderer-web/plugins/audio',
            },
          },
        },
        [dependencyPackageJsonPath('@quajs/character')]: {
          name: '@quajs/character',
          version: '0.1.0',
          main: './dist/index.js',
          quajs: {
            type: 'feature',
            category: 'visual',
            decorators: {
              SetSprite: { function: 'sprite', module: '@quajs/character' },
            },
            renderer: {
              web: '@quajs/renderer-web/plugins/character',
              vue: '@quajs/renderer-vue/plugins/character',
            },
          },
        },
        [dependencyPackageJsonPath('@quajs/plugin-background')]: {
          name: '@quajs/plugin-background',
          version: '0.1.0',
          main: './dist/index.js',
          quajs: {
            type: 'plugin',
            category: 'visual',
            decorators: {
              SetBackground: { function: 'setBackgroundWithEngine', module: '@quajs/plugin-background' },
            },
            renderer: {
              web: '@quajs/renderer-web/plugins/background',
              vue: '@quajs/renderer-vue/plugins/background',
            },
          },
        },
        [dependencyPackageJsonPath('@quajs/story-graph')]: {
          name: '@quajs/story-graph',
          version: '0.1.0',
          main: './dist/index.js',
          quajs: {
            type: 'plugin',
            category: 'story',
            decorators: {
              Chapter: { function: 'setStoryMetadataWithEngine', module: '@quajs/story-graph' },
            },
          },
        },
        [dependencyPackageJsonPath('@quajs/plugin-backlog')]: {
          name: '@quajs/plugin-backlog',
          version: '0.1.0',
          main: './dist/index.js',
        },
        [dependencyPackageJsonPath('regular-package')]: {
          name: 'regular-package',
          version: '1.0.0',
          main: './dist/index.js',
        },
      })

      const plugins = await discoverPlugins('/test/project')

      expect(plugins).toHaveLength(4)
      expect(plugins.some(p => p.name === '@quajs/character')).toBe(true)
      expect(plugins.some(p => p.name === '@quajs/plugin-audio')).toBe(true)
      expect(plugins.some(p => p.name === '@quajs/plugin-background')).toBe(true)
      expect(plugins.some(p => p.name === '@quajs/story-graph')).toBe(true)
      expect(plugins.some(p => p.name === '@quajs/plugin-backlog')).toBe(false)
      expect(plugins.some(p => p.name === 'regular-package')).toBe(false)

      const characterPlugin = plugins.find(plugin => plugin.name === '@quajs/character')
      expect(characterPlugin?.renderer).toEqual({
        web: '@quajs/renderer-web/plugins/character',
        vue: '@quajs/renderer-vue/plugins/character',
      })

      const audioPlugin = plugins.find(plugin => plugin.name === '@quajs/plugin-audio')
      expect(audioPlugin?.version).toBe('0.1.0')
      expect(audioPlugin?.main).toBe('@quajs/plugin-audio/dist/index.js')
      expect(audioPlugin?.entry).toBe('@quajs/plugin-audio/dist/index.js')
      expect(audioPlugin?.renderer).toEqual({
        web: '@quajs/renderer-web/plugins/audio',
      })

      const backgroundPlugin = plugins.find(plugin => plugin.name === '@quajs/plugin-background')
      expect(backgroundPlugin?.renderer).toEqual({
        web: '@quajs/renderer-web/plugins/background',
        vue: '@quajs/renderer-vue/plugins/background',
      })
    })

    it('should not discover convention-named packages without explicit Qua metadata', async () => {
      mockJsonFiles({
        '/test/project/package.json': {
          dependencies: {
            '@quajs/plugin-missing-metadata': '^1.0.0',
            'quajs-plugin-local': '^1.0.0',
          },
        },
        [dependencyPackageJsonPath('@quajs/plugin-missing-metadata')]: {
          name: '@quajs/plugin-missing-metadata',
          version: '1.0.0',
          main: './dist/index.js',
        },
        [dependencyPackageJsonPath('quajs-plugin-local')]: {
          name: 'quajs-plugin-local',
          version: '1.0.0',
          main: './dist/index.js',
        },
      })

      await expect(discoverPlugins('/test/project')).resolves.toEqual([])
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
              AudioChapter: { function: 'configureAudioChapterWithEngine', module: '@quajs/plugin-audio' },
            },
          },
          {
            name: 'video-plugin',
            decorators: {
              PlayVideo: { function: 'playVideo', module: 'video' },
            },
          },
        ],
      }

      mockJsonFiles({
        '/test/project/qua.plugins.json': pluginConfig,
      })

      const mappings = await getDiscoveredDecoratorMappings('/test/project')

      expect(mappings).toEqual({
        AudioChapter: { function: 'configureAudioChapterWithEngine', module: '@quajs/plugin-audio' },
        PlayVideo: { function: 'playVideo', module: 'video' },
      })
    })

    it('should return empty mappings when no plugins have decorators', async () => {
      const pluginConfig = {
        plugins: [
          { name: 'simple-plugin' },
        ],
      }

      mockJsonFiles({
        '/test/project/qua.plugins.json': pluginConfig,
      })

      const mappings = await getDiscoveredDecoratorMappings('/test/project')

      expect(mappings).toEqual({})
    })

    it('should reject conflicting decorators discovered from different plugins', async () => {
      mockJsonFiles({
        '/test/project/qua.plugins.json': {
          plugins: [
            {
              name: 'audio-one',
              decorators: {
                PlayVoice: { function: 'playVoice1', module: 'audio1' },
              },
            },
            {
              name: 'audio-two',
              decorators: {
                PlayVoice: { function: 'playVoice2', module: 'audio2' },
              },
            },
          ],
        },
      })

      await expect(getDiscoveredDecoratorMappings('/test/project')).rejects.toThrow(
        'Conflicting decorator mapping for @PlayVoice: "audio1#playVoice1" vs "audio2#playVoice2".',
      )
    })
  })

  describe('getDiscoveredLanguageContributions', () => {
    it('should merge language contributions from discovered plugins', async () => {
      const pluginConfig = {
        plugins: [
          {
            name: 'background-plugin',
            language: {
              decorators: {
                SetBackground: {
                  args: [
                    {
                      name: 'asset',
                      assetRoots: ['assets/images'],
                      assetExtensions: ['.png'],
                    },
                    {
                      name: 'transition',
                      values: ['fade', 'instant'],
                    },
                  ],
                },
              },
            },
          },
        ],
      }

      mockJsonFiles({
        '/test/project/qua.plugins.json': pluginConfig,
      })

      const language = await getDiscoveredLanguageContributions('/test/project')

      expect(language.decorators?.SetBackground.args?.[0].assetRoots).toEqual(['assets/images'])
      expect(language.decorators?.SetBackground.args?.[1].values).toEqual(['fade', 'instant'])
    })
  })

  describe('loadPlugin', () => {
    it('should load a specific plugin by name', async () => {
      const pluginConfig = {
        plugins: [
          { name: 'audio-plugin', version: '1.0.0' },
          { name: 'video-plugin', version: '2.0.0' },
        ],
      }

      mockJsonFiles({
        '/test/project/qua.plugins.json': pluginConfig,
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
          { name: 'ui-plugin' },
        ],
      }

      mockJsonFiles({
        '/test/project/qua.plugins.json': pluginConfig,
      })

      const names = await getAvailablePlugins('/test/project')

      expect(names).toEqual(['audio-plugin', 'video-plugin', 'ui-plugin'])
    })
  })

  describe('validatePluginConfig', () => {
    it('should validate correct plugin config', () => {
      const config: PluginConfig = {
        name: 'test-plugin',
        version: '1.0.0',
      }

      expect(validatePluginConfig(config)).toBe(true)
    })

    it('should reject config without name', () => {
      const config = {
        version: '1.0.0',
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
        version: '1.0.0',
      }

      expect(validatePluginConfig(config)).toBe(false)
    })
  })

  describe('mergeDecoratorMappings', () => {
    it('should merge multiple decorator mappings', () => {
      const mapping1: DecoratorMapping = {
        PlayVoice: { function: 'playVoiceWithEngine', module: '@quajs/plugin-audio' },
      }

      const mapping2: DecoratorMapping = {
        PlayVideo: { function: 'playVideo', module: 'video' },
      }

      const mapping3: DecoratorMapping = {
        SetAudioGain: { function: 'setAudioGainWithEngine', module: '@quajs/plugin-audio' },
      }

      const merged = mergeDecoratorMappings(mapping1, mapping2, mapping3)

      expect(merged).toEqual({
        PlayVoice: { function: 'playVoiceWithEngine', module: '@quajs/plugin-audio' },
        PlayVideo: { function: 'playVideo', module: 'video' },
        SetAudioGain: { function: 'setAudioGainWithEngine', module: '@quajs/plugin-audio' },
      })
    })

    it('should allow overlapping keys when the mapping is identical', () => {
      const mapping1: DecoratorMapping = {
        PlayVoice: { function: 'playVoiceWithEngine', module: '@quajs/plugin-audio' },
      }

      const mapping2: DecoratorMapping = {
        PlayVoice: { function: 'playVoiceWithEngine', module: '@quajs/plugin-audio' },
      }

      const merged = mergeDecoratorMappings(mapping1, mapping2)

      expect(merged).toEqual({
        PlayVoice: { function: 'playVoiceWithEngine', module: '@quajs/plugin-audio' },
      })
    })

    it('should reject conflicting overlapping keys', () => {
      const mapping1: DecoratorMapping = {
        PlayVoice: { function: 'playVoice1', module: 'audio1' },
      }

      const mapping2: DecoratorMapping = {
        PlayVoice: { function: 'playVoice2', module: 'audio2' },
      }

      expect(() => mergeDecoratorMappings(mapping1, mapping2)).toThrow(
        'Conflicting decorator mapping for @PlayVoice: "audio1#playVoice1" vs "audio2#playVoice2".',
      )
    })

    it('should handle empty mappings', () => {
      const mapping: DecoratorMapping = {
        PlayVoice: { function: 'playVoiceWithEngine', module: '@quajs/plugin-audio' },
      }

      const merged = mergeDecoratorMappings({}, mapping, {})

      expect(merged).toEqual({
        PlayVoice: { function: 'playVoiceWithEngine', module: '@quajs/plugin-audio' },
      })
    })
  })
})
