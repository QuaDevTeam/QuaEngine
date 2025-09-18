import { describe, it, expect, beforeEach, vi } from 'vitest'
import { quaEngine, quaEnginePlugin, quackPlugin, quaScriptCompilerPlugin } from '../src/index'

// Mock dependencies
vi.mock('@quajs/script-compiler', () => ({
  quaScriptPlugin: vi.fn(() => ({
    name: 'qua-script-mock',
    transform: vi.fn()
  }))
}))

vi.mock('@quajs/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

describe('@quajs/vite-plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('quaEngine main plugin', () => {
    it('should return array of plugins by default', () => {
      const plugins = quaEngine()
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins.length).toBeGreaterThan(0)
    })

    it('should include script compiler plugin when enabled', () => {
      const plugins = quaEngine({
        scriptCompiler: { enabled: true }
      })
      
      const scriptPlugin = plugins.find(p => p.name === 'qua-script-compiler')
      expect(scriptPlugin).toBeDefined()
    })

    it('should exclude disabled plugins', () => {
      const plugins = quaEngine({
        scriptCompiler: { enabled: false },
        pluginDiscovery: { enabled: false },
        assetBundling: { enabled: false }
      })
      
      // Should only have dev server plugin
      expect(plugins.length).toBeLessThan(4)
    })

    it('should configure plugins with options', () => {
      const options = {
        scriptCompiler: {
          enabled: true,
          include: /\.ts$/,
          projectRoot: '/test'
        },
        pluginDiscovery: {
          enabled: true,
          generateVirtualRegistry: true
        },
        assetBundling: {
          enabled: true,
          source: 'test-assets',
          format: 'qpk' as const
        }
      }

      const plugins = quaEngine(options)
      expect(plugins.length).toBeGreaterThan(0)
    })
  })

  describe('individual plugins', () => {
    it('should create engine plugin', () => {
      const plugin = quaEnginePlugin()
      expect(plugin.name).toBe('qua-engine')
      expect(typeof plugin.configResolved).toBe('function')
    })

    it('should create quack plugin', () => {
      const plugin = quackPlugin()
      expect(plugin.name).toBe('quack')
      expect(typeof plugin.configResolved).toBe('function')
    })

    it('should create script compiler plugin', () => {
      const plugin = quaScriptCompilerPlugin()
      expect(plugin.name).toBe('qua-script-compiler')
      expect(typeof plugin.transform).toBe('function')
    })

    it('should return disabled plugin when disabled', () => {
      const enginePlugin = quaEnginePlugin({ enabled: false })
      expect(enginePlugin.apply).toBe(false)

      const quackPlugin_ = quackPlugin({ enabled: false })
      expect(quackPlugin_.apply).toBe(false)

      const scriptPlugin = quaScriptCompilerPlugin({ enabled: false })
      expect(scriptPlugin.apply).toBe(false)
    })
  })

  describe('plugin configuration', () => {
    it('should handle empty configuration', () => {
      const plugins = quaEngine({})
      expect(plugins.length).toBeGreaterThan(0)
    })

    it('should handle partial configuration', () => {
      const plugins = quaEngine({
        scriptCompiler: { projectRoot: '/custom' }
      })
      expect(plugins.length).toBeGreaterThan(0)
    })
  })
})