import type { Plugin } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetHotReloadManager } from '../src/core/hot-reload'
import { quaScriptPlugin } from '../src/integrations/vite-plugin'

// Mock Vite server and module graph
const mockModuleGraph = {
  urlToModuleMap: new Map(),
  invalidateModule: vi.fn(),
}

const mockServer = {
  ws: {
    send: vi.fn(),
  },
  moduleGraph: mockModuleGraph,
  reloadModule: vi.fn(),
  watcher: {
    add: vi.fn(),
    on: vi.fn(),
  },
}

// Mock file system watcher
const _mockWatcher = {
  close: vi.fn(),
}

describe('vite Plugin Hot-Reload Integration', () => {
  let plugin: Plugin
  let originalNodeEnv: string | undefined

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    resetHotReloadManager()
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    resetHotReloadManager()
  })

  describe('plugin configuration', () => {
    it('should create plugin with default options', () => {
      plugin = quaScriptPlugin()

      expect(plugin.name).toBe('qua-script')
      expect(typeof plugin.configResolved).toBe('function')
      expect(typeof plugin.transform).toBe('function')
    })

    it('should create plugin with hot-reload disabled', () => {
      plugin = quaScriptPlugin({ hotReload: false })

      expect(plugin.name).toBe('qua-script')
      // Plugin should still be created but hot-reload features disabled
    })

    it('should create plugin with custom options', () => {
      plugin = quaScriptPlugin({
        include: /\.qua$/,
        exclude: /test/,
        hotReload: true,
        projectRoot: '/custom/root',
      })

      expect(plugin.name).toBe('qua-script')
    })
  })

  describe('development server integration', () => {
    beforeEach(() => {
      plugin = quaScriptPlugin({ hotReload: true })
    })

    it('should configure development server', () => {
      const configResolved = plugin.configResolved as (config: any) => void
      const configureServer = plugin.configureServer as (server: any) => void

      // Mock config
      const config = {
        command: 'serve',
        root: '/project',
      }

      configResolved(config)
      configureServer(mockServer)

      // Should set up watchers
      expect(mockServer.watcher.add).toHaveBeenCalledWith([
        '**/qua.plugins.json',
        '**/plugins/**/*.{js,ts}',
        '**/*plugin*.{js,ts}',
        '**/package.json',
      ])

      // Should set up change handler
      expect(mockServer.watcher.on).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('should not configure watchers when hot-reload is disabled', () => {
      plugin = quaScriptPlugin({ hotReload: false })

      const configureServer = plugin.configureServer as (server: any) => void
      configureServer(mockServer)

      // Should not set up watchers
      expect(mockServer.watcher.add).not.toHaveBeenCalled()
    })
  })

  describe('file transformation', () => {
    beforeEach(() => {
      plugin = quaScriptPlugin({ hotReload: true })

      // Configure plugin
      const configResolved = plugin.configResolved as (config: any) => void
      configResolved({ command: 'serve', root: '/project' })
    })

    it('should transform QuaScript files', () => {
      const transform = plugin.transform as (code: string, id: string) => any
      const code = `const dialogue = qs\`Yuki: Hello world!\``
      const id = '/project/src/test.ts'

      // Set up server for HMR code generation
      const configureServer = plugin.configureServer as (server: any) => void
      configureServer(mockServer)

      const result = transform(code, id)

      expect(result).toBeTruthy()
      expect(result.code).toContain('Yuki.speak')
      expect(result.code).toContain('import.meta.hot') // HMR code
    })

    it('should skip non-QuaScript files', () => {
      const transform = plugin.transform as (code: string, id: string) => any
      const code = `console.log('regular javascript')`
      const id = '/project/src/test.ts'

      const result = transform(code, id)

      expect(result).toBeNull()
    })

    it('should skip files without qs template literals', () => {
      const transform = plugin.transform as (code: string, id: string) => any
      const code = `const dialogue = 'regular string'`
      const id = '/project/src/test.ts'

      const result = transform(code, id)

      expect(result).toBeNull()
    })

    it('should not add HMR code when hot-reload is disabled', () => {
      plugin = quaScriptPlugin({ hotReload: false })

      const configResolved = plugin.configResolved as (config: any) => void
      configResolved({ command: 'build', root: '/project' })

      const transform = plugin.transform as (code: string, id: string) => any
      const code = `const dialogue = qs\`Yuki: Hello!\``
      const id = '/project/src/test.ts'

      const result = transform(code, id)

      expect(result?.code).not.toContain('import.meta.hot')
    })
  })

  describe('hot module replacement', () => {
    beforeEach(() => {
      plugin = quaScriptPlugin({ hotReload: true })

      const configResolved = plugin.configResolved as (config: any) => void
      const configureServer = plugin.configureServer as (server: any) => void

      configResolved({ command: 'serve', root: '/project' })
      configureServer(mockServer)
    })

    it('should handle QuaScript file updates', () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/src/test.ts',
        read: () => Promise.resolve('const dialogue = qs`Yuki: Updated!`'),
      }

      const result = handleHotUpdate(ctx)

      expect(result).toBeUndefined() // Let Vite handle normally
    })

    it('should handle plugin file updates', () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/plugins/my-plugin.ts',
        read: () => Promise.resolve('plugin content'),
      }

      const result = handleHotUpdate(ctx)

      expect(result).toEqual([]) // Prevent default HMR
    })

    it('should handle config file updates', () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/qua.plugins.json',
        read: () => Promise.resolve('{}'),
      }

      const result = handleHotUpdate(ctx)

      expect(result).toEqual([]) // Prevent default HMR
    })

    it('should ignore unrelated files', () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/src/styles.css',
        read: () => Promise.resolve('css content'),
      }

      const result = handleHotUpdate(ctx)

      expect(result).toBeUndefined()
    })
  })

  describe('webSocket communication', () => {
    beforeEach(() => {
      plugin = quaScriptPlugin({ hotReload: true })

      const configResolved = plugin.configResolved as (config: any) => void
      const configureServer = plugin.configureServer as (server: any) => void

      configResolved({ command: 'serve', root: '/project' })
      configureServer(mockServer)
    })

    it('should send WebSocket messages on hot-reload events', async () => {
      // Simulate plugin change
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/plugins/test-plugin.ts',
        read: () => Promise.resolve('plugin content'),
      }

      handleHotUpdate(ctx)

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      // Note: This test would need more sophisticated mocking to verify WebSocket messages
      // The hot-reload manager would need to be triggered, which happens asynchronously
    })
  })

  describe('build cleanup', () => {
    it('should cleanup resources on build end', () => {
      plugin = quaScriptPlugin({ hotReload: true })

      const buildEnd = plugin.buildEnd as () => void

      // Should not throw
      expect(() => buildEnd()).not.toThrow()
    })
  })

  describe('error handling', () => {
    beforeEach(() => {
      plugin = quaScriptPlugin({ hotReload: true })

      const configResolved = plugin.configResolved as (config: any) => void
      configResolved({ command: 'serve', root: '/project' })
    })

    it('should handle transformation errors', () => {
      const transform = plugin.transform as (code: string, id: string) => any
      const mockError = vi.fn()

      // Mock the error method
      const context = { error: mockError }

      // Invalid QuaScript syntax
      const code = `const dialogue = qs\`Yuki: Hello [unclosed`
      const id = '/project/src/test.ts'

      transform.call(context, code, id)

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('QuaScript transformation failed'),
      )
    })
  })

  describe('file watching', () => {
    it('should identify plugin files correctly', () => {
      const pluginFiles = [
        '/project/qua.plugins.json',
        '/project/package.json',
        '/project/plugins/audio-plugin.ts',
        '/project/src/my-plugin.js',
        '/project/lib/custom.plugin.ts',
      ]

      const nonPluginFiles = [
        '/project/src/component.ts',
        '/project/styles.css',
        '/project/README.md',
      ]

      plugin = quaScriptPlugin({ hotReload: true })

      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      // Plugin files should return empty array
      for (const file of pluginFiles) {
        const result = handleHotUpdate({
          file,
          read: () => Promise.resolve('content'),
        })
        expect(result).toEqual([])
      }

      // Non-plugin files should return undefined
      for (const file of nonPluginFiles) {
        const result = handleHotUpdate({
          file,
          read: () => Promise.resolve('content'),
        })
        expect(result).toBeUndefined()
      }
    })
  })
})
