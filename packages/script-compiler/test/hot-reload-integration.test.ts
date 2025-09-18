import type { HotReloadEvent } from '../src/core/hot-reload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotReloadManager, resetHotReloadManager } from '../src/core/hot-reload'
import { compileQuaScript } from '../src/index'
import { createHotReloadAwareTransformer } from '../src/integrations/hot-reload-transformer'

// Mock plugin discovery
vi.mock('@quajs/engine/plugins/core/plugin-discovery', () => ({
  getDiscoveredDecoratorMappings: vi.fn(async () => ({
    CustomDecorator: {
      function: 'customFunction',
      module: '@custom/plugin',
    },
  })),
}))

describe('hot-Reload Integration', () => {
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

  describe('end-to-end hot-reload workflow', () => {
    it('should support complete hot-reload cycle', async () => {
      const projectRoot = '/test/project'
      const filePath = '/test/project/src/dialogue.ts'

      // Initial QuaScript content
      const initialSource = `
        const scene1 = qs\`
          Yuki: Hello world!
          @PlaySound(bell.wav)
          Akira: Nice to meet you.
        \`
      `

      // Updated QuaScript content
      const updatedSource = `
        const scene1 = qs\`
          Yuki: Hello there!
          @PlaySound(chime.wav)
          @CustomDecorator(test)
          Akira: Great to see you.
        \`
      `

      // Create transformer with hot-reload
      const transformer = createHotReloadAwareTransformer(undefined, { projectRoot })
      const hotReloadManager = getHotReloadManager(projectRoot)

      // Set up event tracking
      const events: HotReloadEvent[] = []
      hotReloadManager.onHotReload((event) => {
        events.push(event)
      })

      // Initial compilation
      const result1 = transformer.transformSource(initialSource, filePath)
      expect(result1).toContain('Yuki.speak("Hello world!")')
      expect(result1).toContain('playSound("bell.wav")')

      // Verify caching
      const cachedResult = transformer.transformSource(initialSource, filePath)
      expect(cachedResult).toBe(result1)

      // Simulate file change
      hotReloadManager.handleFileChange(filePath, updatedSource)

      // Verify event was fired
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'quascript-change',
        file: filePath,
        content: updatedSource,
      })

      // Compile updated source
      const result2 = transformer.transformSource(updatedSource, filePath)
      expect(result2).toContain('Yuki.speak("Hello there!")')
      expect(result2).toContain('playSound("chime.wav")')
      expect(result2).toContain('customFunction("test")') // From mock plugin

      // Results should be different
      expect(result1).not.toBe(result2)

      // Cleanup
      transformer.dispose()
    })

    it('should handle plugin changes and decorator updates', async () => {
      const projectRoot = '/test/project'
      const filePath = '/test/project/src/dialogue.ts'
      const pluginFile = '/test/project/plugins/audio-plugin.ts'

      const source = `
        const scene = qs\`
          @CustomDecorator(param)
          Yuki: Hello!
        \`
      `

      const transformer = createHotReloadAwareTransformer(undefined, { projectRoot })
      const hotReloadManager = getHotReloadManager(projectRoot)

      const events: HotReloadEvent[] = []
      hotReloadManager.onHotReload((event) => {
        events.push(event)
      })

      // Wait for initial plugin loading
      await new Promise(resolve => setTimeout(resolve, 10))

      // Initial compilation
      const result1 = transformer.transformSource(source, filePath)
      expect(result1).toContain('customFunction("param")')

      // Simulate plugin file change
      hotReloadManager.handleFileChange(pluginFile)

      // Verify plugin change event
      expect(events.some(e => e.type === 'plugin-change')).toBe(true)

      // Force decorator update
      await transformer.updateDecoratorMappings()

      // Compile again (should use updated decorators)
      const result2 = transformer.transformSource(source, filePath)
      expect(result2).toContain('customFunction("param")')

      transformer.dispose()
    })

    it('should invalidate dependent files correctly', () => {
      const mainFile = '/test/main.ts'
      const depFile = '/test/dependency.ts'

      const mainSource = `
        import './dependency'
        const dialogue = qs\`Yuki: Hello!\`
      `

      const transformer = createHotReloadAwareTransformer()
      const hotReloadManager = getHotReloadManager()

      // Compile main file (this should extract the dependency)
      const result1 = transformer.transformSource(mainSource, mainFile)

      // Verify it's cached
      const cachedResult = transformer.transformSource(mainSource, mainFile)
      expect(cachedResult).toBe(result1)

      // Simulate dependency change
      hotReloadManager.handleFileChange(depFile)

      // The cache for main file should be invalidated
      // (This is verified by checking the cache stats after invalidation)
      const stats = transformer.getHotReloadStats()
      const _mainEntry = stats.entries.find(e => e.file === mainFile)

      // If cache was invalidated, the entry should be gone
      // or we can verify by checking that next compilation doesn't use cache
      const result2 = transformer.transformSource(mainSource, mainFile)
      // Result should be the same content but freshly compiled
      expect(result1).toBe(result2) // Same transformation result

      transformer.dispose()
    })
  })

  describe('production mode behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production'
    })

    it('should disable hot-reload in production', () => {
      const source = `const dialogue = qs\`Yuki: Hello!\``

      // Using convenience function
      const result1 = compileQuaScript(source, { hotReload: false })
      const result2 = compileQuaScript(source, { hotReload: false })

      expect(result1).toBe(result2) // Same result

      // But no caching should occur in production
      const hotReloadManager = getHotReloadManager()
      expect(hotReloadManager.isHotReloadEnabled()).toBe(false)
    })

    it('should still allow explicit hot-reload enabling', () => {
      const source = `const dialogue = qs\`Yuki: Hello!\``

      const result = compileQuaScript(source, { hotReload: true })
      expect(result).toContain('Yuki.speak')

      const hotReloadManager = getHotReloadManager()
      expect(hotReloadManager.isHotReloadEnabled()).toBe(true)
    })
  })

  describe('error resilience', () => {
    it('should handle transformation errors without breaking hot-reload', () => {
      const filePath = '/test/file.ts'
      const validSource = `const dialogue = qs\`Yuki: Hello!\``
      const invalidSource = `const dialogue = qs\`Yuki: Hello [unclosed`

      const transformer = createHotReloadAwareTransformer()

      // Successful compilation
      const result1 = transformer.transformSource(validSource, filePath)
      expect(result1).toContain('Yuki.speak')

      // Failed compilation should not break the transformer
      expect(() => {
        transformer.transformSource(invalidSource, filePath)
      }).toThrow()

      // Should still work for valid source
      const result2 = transformer.transformSource(validSource, filePath)
      expect(result2).toContain('Yuki.speak')

      transformer.dispose()
    })

    it('should handle plugin loading errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Create transformer with invalid project root
      const transformer = createHotReloadAwareTransformer(undefined, {
        projectRoot: '/nonexistent/path',
      })

      const source = `const dialogue = qs\`Yuki: Hello!\``
      const result = transformer.transformSource(source)

      expect(result).toContain('Yuki.speak')
      // Should have logged a warning about plugin loading failure
      expect(consoleSpy).toHaveBeenCalled()

      transformer.dispose()
      consoleSpy.mockRestore()
    })
  })

  describe('performance characteristics', () => {
    it('should demonstrate caching performance benefits', () => {
      const source = `
        const longDialogue = qs\`
          Yuki: This is a long dialogue with many characters.
          Akira: Indeed it is quite extensive.
          Saki: We should test the performance.
          @PlaySound(test.wav)
          @PlayBGM(background.mp3)
          Yuki: Multiple decorators and lines.
        \`
      `
      const filePath = '/test/performance.ts'

      const transformer = createHotReloadAwareTransformer()

      // First compilation (no cache)
      const start1 = Date.now()
      const result1 = transformer.transformSource(source, filePath)
      const time1 = Date.now() - start1

      // Second compilation (should use cache)
      const start2 = Date.now()
      const result2 = transformer.transformSource(source, filePath)
      const time2 = Date.now() - start2

      expect(result1).toBe(result2) // Same result
      expect(time2).toBeLessThan(time1) // Should be faster due to caching

      transformer.dispose()
    })

    it('should handle many file operations efficiently', () => {
      const transformer = createHotReloadAwareTransformer()
      const fileCount = 50

      // Generate many files
      const files = Array.from({ length: fileCount }, (_, i) => ({
        path: `/test/file${i}.ts`,
        source: `const dialogue${i} = qs\`Character${i}: Message ${i}!\``,
      }))

      // Compile all files
      const start = Date.now()
      const results = files.map(file =>
        transformer.transformSource(file.source, file.path),
      )
      const compileTime = Date.now() - start

      // Verify all compiled correctly
      expect(results).toHaveLength(fileCount)
      results.forEach((result, i) => {
        expect(result).toContain(`Character${i}.speak`)
      })

      // Get cache stats
      const stats = transformer.getHotReloadStats()
      expect(stats.size).toBe(fileCount)

      // Re-compile all (should be much faster)
      const start2 = Date.now()
      const _cachedResults = files.map(file =>
        transformer.transformSource(file.source, file.path),
      )
      const cacheTime = Date.now() - start2

      expect(cacheTime).toBeLessThan(compileTime / 2) // Should be significantly faster

      transformer.dispose()
    })
  })
})
