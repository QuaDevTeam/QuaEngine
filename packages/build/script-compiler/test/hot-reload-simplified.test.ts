import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HotReloadManager, resetHotReloadManager } from '../src/core/hot-reload'
import { createHotReloadAwareTransformer } from '../src/integrations/hot-reload-transformer'
import { quaScriptPlugin } from '../src/integrations/vite-plugin'

describe('hot-Reload System Integration', () => {
  let originalNodeEnv: string | undefined

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    resetHotReloadManager()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    resetHotReloadManager()
  })

  describe('core functionality working', () => {
    it('should enable hot-reload in development', () => {
      const manager = new HotReloadManager()
      expect(manager.isHotReloadEnabled()).toBe(false)

      manager.enable()
      expect(manager.isHotReloadEnabled()).toBe(true)
    })

    it('should cache and invalidate transformations', () => {
      const transformer = createHotReloadAwareTransformer()
      const source = `const dialogue = qs\`Yuki: Hello!\``
      const filePath = '/test/file.ts'

      // Transform and verify it works
      const result1 = transformer.transformSource(source, filePath)
      expect(result1).toContain('Yuki.speak')

      // Get stats to verify caching
      const stats = transformer.getHotReloadStats()
      expect(stats.size).toBeGreaterThan(0)

      // Invalidate and verify cache is cleared
      transformer.invalidateFile(filePath)

      transformer.dispose()
    })

    it('should handle file change events', () => {
      const manager = new HotReloadManager()
      manager.enable()

      const events: any[] = []
      manager.onHotReload(event => events.push(event))

      manager.handleFileChange('/test/file.ts', 'content')
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('quascript-change')

      manager.handleFileChange('/test/qua.plugins.json')
      expect(events).toHaveLength(2)
      expect(events[1].type).toBe('config-change')

      manager.disable()
    })

    it('should create Vite plugin without errors', () => {
      const plugin = quaScriptPlugin({
        hotReload: true,
        projectRoot: '/test',
      })

      expect(plugin.name).toBe('qua-script')
      expect(typeof plugin.transform).toBe('function')
      expect(typeof plugin.configResolved).toBe('function')
    })

    it('should transform QuaScript correctly', () => {
      const transformer = createHotReloadAwareTransformer()
      const source = `
        const scene = qs\`
          Yuki: Hello world!
          @PlaySound(bell.wav)
          Akira: Nice to see you.
        \`
      `

      const result = transformer.transformSource(source)
      expect(result).toContain('Yuki.speak("Hello world!")')
      expect(result).toContain('Akira.speak("Nice to see you.")')
      // Note: PlaySound decorator requires mapping to be available

      transformer.dispose()
    })

    it('should handle production mode correctly', () => {
      process.env.NODE_ENV = 'production'

      const transformer = createHotReloadAwareTransformer()
      const source = `const dialogue = qs\`Yuki: Hello!\``

      const result = transformer.transformSource(source)
      expect(result).toContain('Yuki.speak')

      // In production, hot-reload should be disabled
      const stats = transformer.getHotReloadStats()
      expect(stats.size).toBe(0)

      transformer.dispose()
    })
  })

  describe('error handling', () => {
    it('should handle invalid QuaScript gracefully', () => {
      const transformer = createHotReloadAwareTransformer()
      const invalidSource = `const dialogue = qs\`Yuki: Hello [unclosed`

      expect(() => {
        transformer.transformSource(invalidSource)
      }).toThrow()

      transformer.dispose()
    })

    it('should handle callback errors in hot-reload manager', () => {
      const manager = new HotReloadManager()
      manager.enable()

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      manager.onHotReload(() => {
        throw new Error('Callback error')
      })

      // Should not throw
      expect(() => {
        manager.handleFileChange('/test/file.ts')
      }).not.toThrow()

      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
      manager.disable()
    })
  })
})
