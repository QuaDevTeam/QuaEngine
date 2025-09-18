import type { HotReloadEvent } from '../src/core/hot-reload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotReloadManager, HotReloadManager, resetHotReloadManager } from '../src/core/hot-reload'

describe('hotReloadManager', () => {
  let manager: HotReloadManager
  let projectRoot: string

  beforeEach(() => {
    projectRoot = '/test/project'
    manager = new HotReloadManager(projectRoot)
    resetHotReloadManager()
  })

  afterEach(() => {
    manager.disable()
    resetHotReloadManager()
  })

  describe('basic functionality', () => {
    it('should start disabled by default', () => {
      expect(manager.isHotReloadEnabled()).toBe(false)
    })

    it('should enable and disable hot-reload', () => {
      manager.enable()
      expect(manager.isHotReloadEnabled()).toBe(true)

      manager.disable()
      expect(manager.isHotReloadEnabled()).toBe(false)
    })

    it('should support callback registration and removal', () => {
      const callback = vi.fn()
      const unsubscribe = manager.onHotReload(callback)

      expect(typeof unsubscribe).toBe('function')

      unsubscribe()
      // Should not throw
    })
  })

  describe('caching', () => {
    beforeEach(() => {
      manager.enable()
    })

    it('should cache compilation results', () => {
      const filePath = '/test/file.ts'
      const source = 'const test = qs`Yuki: Hello world!`'
      const compiled = 'const test = [/* compiled */]'

      // Initially no cache
      expect(manager.getCached(filePath, source)).toBeNull()

      // Set cache
      manager.setCached(filePath, source, compiled)

      // Should return cached result
      expect(manager.getCached(filePath, source)).toBe(compiled)
    })

    it('should invalidate cache when source changes', () => {
      const filePath = '/test/file.ts'
      const source1 = 'const test = qs`Yuki: Hello!`'
      const source2 = 'const test = qs`Yuki: Hi there!`'
      const compiled = 'const test = [/* compiled */]'

      manager.setCached(filePath, source1, compiled)
      expect(manager.getCached(filePath, source1)).toBe(compiled)

      // Different source should not return cached result
      expect(manager.getCached(filePath, source2)).toBeNull()
    })

    it('should invalidate cache when decorator mappings change', () => {
      const filePath = '/test/file.ts'
      const source = 'const test = qs`Yuki: Hello!`'
      const compiled = 'const test = [/* compiled */]'

      manager.setCached(filePath, source, compiled)
      expect(manager.getCached(filePath, source)).toBe(compiled)

      // Update decorator mappings
      manager.updateDecoratorMappings({ NewDecorator: { function: 'test', module: 'test' } })

      // Cache should be invalidated
      expect(manager.getCached(filePath, source)).toBeNull()
    })

    it('should handle dependencies correctly', () => {
      const mainFile = '/test/main.ts'
      const depFile = '/test/dep.ts'
      const source = 'import dep from "./dep"'
      const compiled = 'const test = [/* compiled */]'

      manager.setCached(mainFile, source, compiled, [depFile])

      // Invalidating dependency should invalidate main file
      manager.invalidateFile(depFile)

      expect(manager.getCached(mainFile, source)).toBeNull()
    })
  })

  describe('event handling', () => {
    let events: HotReloadEvent[]
    let callback: (event: HotReloadEvent) => void

    beforeEach(() => {
      events = []
      callback = (event: HotReloadEvent) => events.push(event)
      manager.enable()
      manager.onHotReload(callback)
    })

    it('should notify callbacks on file changes', () => {
      const filePath = '/test/file.ts'
      const content = 'updated content'

      manager.handleFileChange(filePath, content)

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'quascript-change',
        file: filePath,
        content,
      })
    })

    it('should detect plugin file changes', () => {
      const pluginFile = '/test/my-plugin.ts'

      manager.handleFileChange(pluginFile)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('plugin-change')
    })

    it('should detect config file changes', () => {
      const configFile = '/test/qua.plugins.json'

      manager.handleFileChange(configFile)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('config-change')
    })

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error')
      })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      manager.onHotReload(errorCallback)
      manager.handleFileChange('/test/file.ts')

      expect(errorCallback).toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalled()

      consoleError.mockRestore()
    })
  })

  describe('global manager', () => {
    it('should return singleton instance', () => {
      const manager1 = getHotReloadManager()
      const manager2 = getHotReloadManager()

      expect(manager1).toBe(manager2)
    })

    it('should reset singleton', () => {
      const manager1 = getHotReloadManager()
      resetHotReloadManager()
      const manager2 = getHotReloadManager()

      expect(manager1).not.toBe(manager2)
    })
  })

  describe('cache statistics', () => {
    beforeEach(() => {
      manager.enable()
    })

    it('should provide cache statistics', () => {
      const stats1 = manager.getCacheStats()
      expect(stats1.size).toBe(0)
      expect(stats1.entries).toEqual([])

      // Add some cache entries
      manager.setCached('/test/file1.ts', 'source1', 'compiled1', ['/dep1'])
      manager.setCached('/test/file2.ts', 'source2', 'compiled2', ['/dep2'])

      const stats2 = manager.getCacheStats()
      expect(stats2.size).toBe(2)
      expect(stats2.entries).toHaveLength(2)
      expect(stats2.entries[0]).toMatchObject({
        file: '/test/file1.ts',
        dependencies: ['/dep1'],
      })
    })
  })

  describe('disabled state behavior', () => {
    it('should not cache when disabled', () => {
      // Manager starts disabled
      const filePath = '/test/file.ts'
      const source = 'source'
      const compiled = 'compiled'

      manager.setCached(filePath, source, compiled)
      expect(manager.getCached(filePath, source)).toBeNull()
    })

    it('should not notify callbacks when disabled', () => {
      const callback = vi.fn()
      manager.onHotReload(callback)

      manager.handleFileChange('/test/file.ts')

      expect(callback).not.toHaveBeenCalled()
    })
  })
})
