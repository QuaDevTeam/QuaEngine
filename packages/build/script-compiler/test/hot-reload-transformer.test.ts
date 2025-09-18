import type { DecoratorMapping } from '../src/core/types'
import type { HotReloadAwareTransformer } from '../src/integrations/hot-reload-transformer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetHotReloadManager } from '../src/core/hot-reload'
import { createHotReloadAwareTransformer } from '../src/integrations/hot-reload-transformer'

// Mock the plugin discovery system
vi.mock('@quajs/plugin-discovery', () => ({
  getDiscoveredDecoratorMappings: vi.fn(async () => ({
    MockDecorator: {
      function: 'mockFunction',
      module: '@mock/plugin',
    },
  })),
}))

describe('hotReloadAwareTransformer', () => {
  let transformer: HotReloadAwareTransformer
  let originalNodeEnv: string | undefined

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    resetHotReloadManager()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    transformer?.dispose()
    resetHotReloadManager()
  })

  describe('basic transformation', () => {
    beforeEach(() => {
      transformer = createHotReloadAwareTransformer()
    })

    it('should transform QuaScript with caching', () => {
      const source = `
        const dialogue = qs\`
          Yuki: Hello world!
        \`
      `
      const filePath = '/test/file.ts'

      // First transformation
      const result1 = transformer.transformSource(source, filePath)
      expect(result1).toContain('Yuki.speak')

      // Second transformation should use cache
      const result2 = transformer.transformSource(source, filePath)
      expect(result1).toBe(result2)
    })

    it('should invalidate cache on source changes', () => {
      const source1 = `const dialogue = qs\`Yuki: Hello!\``
      const source2 = `const dialogue = qs\`Yuki: Hi there!\``
      const filePath = '/test/file.ts'

      const result1 = transformer.transformSource(source1, filePath)
      const result2 = transformer.transformSource(source2, filePath)

      // Results should be different
      expect(result1).not.toBe(result2)
      expect(result2).toContain('Hi there!')
    })

    it('should work without file path (no caching)', () => {
      const source = `const dialogue = qs\`Yuki: Hello!\``

      const result = transformer.transformSource(source)
      expect(result).toContain('Yuki.speak')
    })
  })

  describe('plugin hot-reload', () => {
    it('should update decorator mappings', async () => {
      const initialMappings: DecoratorMapping = {
        TestDecorator: {
          function: 'testFn',
          module: 'test',
        },
      }

      transformer = createHotReloadAwareTransformer(initialMappings)

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10))

      const currentMappings = transformer.getCurrentDecoratorMappings()

      // Should include both initial and discovered mappings
      expect(currentMappings.TestDecorator).toEqual({
        function: 'testFn',
        module: 'test',
      })
      expect(currentMappings.MockDecorator).toEqual({
        function: 'mockFunction',
        module: '@mock/plugin',
      })
    })

    it('should handle plugin loading failures gracefully', async () => {
      // Create transformer with projectRoot that will cause plugin discovery to fail
      transformer = createHotReloadAwareTransformer(undefined, {
        projectRoot: '/nonexistent/path',
      })

      // Should not throw
      await transformer.updateDecoratorMappings()

      // Should still have default mappings
      const mappings = transformer.getCurrentDecoratorMappings()
      expect(typeof mappings).toBe('object')
    })
  })

  describe('hot-reload statistics', () => {
    beforeEach(() => {
      transformer = createHotReloadAwareTransformer()
    })

    it('should provide cache statistics', () => {
      const source = `const dialogue = qs\`Yuki: Hello!\``
      const filePath = '/test/file.ts'

      // Transform to populate cache
      transformer.transformSource(source, filePath)

      const stats = transformer.getHotReloadStats()
      expect(stats.size).toBeGreaterThan(0)
      expect(stats.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: filePath,
          }),
        ]),
      )
    })
  })

  describe('file invalidation', () => {
    beforeEach(() => {
      transformer = createHotReloadAwareTransformer()
    })

    it('should invalidate specific files', () => {
      const source = `const dialogue = qs\`Yuki: Hello!\``
      const filePath = '/test/file.ts'

      // Transform and cache
      const result1 = transformer.transformSource(source, filePath)

      // Invalidate file
      transformer.invalidateFile(filePath)

      // Next transform should not use cache (will be the same result but not cached)
      const result2 = transformer.transformSource(source, filePath)
      expect(result1).toBe(result2) // Same transformation result
    })
  })

  describe('production mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production'
    })

    it('should disable hot-reload in production', () => {
      transformer = createHotReloadAwareTransformer()

      const source = `const dialogue = qs\`Yuki: Hello!\``
      const filePath = '/test/file.ts'

      // Transform twice
      const result1 = transformer.transformSource(source, filePath)
      const result2 = transformer.transformSource(source, filePath)

      // Should get same result but no caching in production
      expect(result1).toBe(result2)

      // Stats should show no cache in production
      const stats = transformer.getHotReloadStats()
      expect(stats.size).toBe(0)
    })
  })

  describe('dependency extraction', () => {
    beforeEach(() => {
      transformer = createHotReloadAwareTransformer()
    })

    it('should extract import dependencies', () => {
      const source = `
        import { Character } from './character'
        import utils from '../utils'
        const dialogue = qs\`Yuki: Hello!\`
      `
      const filePath = '/test/file.ts'

      transformer.transformSource(source, filePath)

      const stats = transformer.getHotReloadStats()
      const entry = stats.entries.find(e => e.file === filePath)

      expect(entry?.dependencies).toContain('./character')
      expect(entry?.dependencies).toContain('../utils')
    })

    it('should extract require dependencies', () => {
      const source = `
        const path = require('path')
        const utils = require('./utils')
        const dialogue = qs\`Yuki: Hello!\`
      `
      const filePath = '/test/file.ts'

      transformer.transformSource(source, filePath)

      const stats = transformer.getHotReloadStats()
      const entry = stats.entries.find(e => e.file === filePath)

      expect(entry?.dependencies).toContain('path')
      expect(entry?.dependencies).toContain('./utils')
    })
  })

  describe('error handling', () => {
    it('should handle transformation errors gracefully', () => {
      transformer = createHotReloadAwareTransformer()

      // Invalid QuaScript syntax
      const invalidSource = `const dialogue = qs\`Yuki: Hello [unclosed`

      expect(() => {
        transformer.transformSource(invalidSource, '/test/file.ts')
      }).toThrow()
    })

    it('should handle decorator mapping update errors', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      transformer = createHotReloadAwareTransformer()

      // Mock the function to throw an error
      const _originalUpdateMethod = transformer.updateDecoratorMappings
      transformer.updateDecoratorMappings = vi.fn().mockRejectedValue(new Error('Plugin error'))

      await transformer.updateDecoratorMappings()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update decorator mappings'),
        expect.any(Error),
      )

      consoleSpy.mockRestore()
    })
  })
})
