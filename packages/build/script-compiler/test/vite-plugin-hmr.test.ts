import type { Plugin } from 'vite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
        include: /\.qs$/,
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

    it('should configure development server', async () => {
      const configResolved = plugin.configResolved as (config: any) => Promise<void>
      const configureServer = plugin.configureServer as (server: any) => void

      // Mock config
      const config = {
        command: 'serve',
        root: '/project',
      }

      await configResolved(config)
      configureServer(mockServer)

      // Should set up watchers
      expect(mockServer.watcher.add).toHaveBeenCalledWith([
        '**/qua.plugins.json',
        '**/quascript.config.json',
        '**/qua.config.json',
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
    beforeEach(async () => {
      plugin = quaScriptPlugin({ hotReload: true })

      // Configure plugin
      const configResolved = plugin.configResolved as (config: any) => Promise<void>
      await configResolved({ command: 'serve', root: '/project' })
    })

    it('should transform QuaScript files', async () => {
      const transform = plugin.transform as (code: string, id: string) => any
      const code = `const dialogue = qs\`Yuki: Hello world!\``
      const id = '/project/src/test.ts'

      // Set up server for HMR code generation
      const configureServer = plugin.configureServer as (server: any) => void
      configureServer(mockServer)

      const result = await transform(code, id)

      expect(result).toBeTruthy()
      expect(result.code).toContain('speakWithEngine(ctx.engine, "Yuki"')
      expect(result.code).toContain('import.meta.hot') // HMR code
      expect(result.map).toBeTruthy()
      expect(result.map.sources).toContain(id)
      expect(result.map.mappings).not.toBe('')
    })

    it('should transform standalone .qs files into modules', async () => {
      const transform = plugin.transform as (code: string, id: string) => any
      const code = `
        Yuki: Hello world!
      `
      const id = '/project/src/test.qs'

      // Set up server for HMR code generation
      const configureServer = plugin.configureServer as (server: any) => void
      configureServer(mockServer)

      const result = await transform(code, id)

      expect(result).toBeTruthy()
      expect(result.code).toContain('export default function createQuaScript(scope = {})')
      expect(result.code).toContain('speakWithEngine(ctx.engine, "Yuki"')
      expect(result.code).toContain('import.meta.hot')
      expect(result.map).toBeTruthy()
      expect(result.map.sources.length).toBeGreaterThan(0)
      expect(result.map.mappings).not.toBe('')
    })

    it('should skip non-QuaScript files', async () => {
      const transform = plugin.transform as (code: string, id: string) => any
      const code = `console.log('regular javascript')`
      const id = '/project/src/test.ts'

      const result = await transform(code, id)

      expect(result).toBeNull()
    })

    it('should skip files without qs template literals', async () => {
      const transform = plugin.transform as (code: string, id: string) => any
      const code = `const dialogue = 'regular string'`
      const id = '/project/src/test.ts'

      const result = await transform(code, id)

      expect(result).toBeNull()
    })

    it('should load decorator compiler settings from QuaScript config', async () => {
      const root = mkdtempSync(join(tmpdir(), 'quascript-vite-'))
      writeFileSync(join(root, 'quascript.config.json'), JSON.stringify({
        decorators: {
          autoCollect: false,
        },
      }), 'utf-8')
      writeFileSync(join(root, 'qua.plugins.json'), JSON.stringify({
        plugins: [
          {
            name: '@quajs/plugin-background',
            decorators: {
              SetBackground: {
                function: 'setBackgroundWithEngine',
                module: '@quajs/plugin-background',
              },
            },
          },
        ],
      }), 'utf-8')

      plugin = quaScriptPlugin({ hotReload: false })
      const configResolved = plugin.configResolved as (config: any) => Promise<void>
      await configResolved({ command: 'build', root })

      const transform = plugin.transform as (this: { error: (message: string) => never }, code: string, id: string) => Promise<any>

      await expect(transform.call({
        error(message: string): never {
          throw new Error(message)
        },
      }, '@SetBackground(\'classroom.png\')\nYuki: Hello\n', join(root, 'scene.qs'))).rejects.toThrow(
        'Unknown QuaScript decorator @SetBackground',
      )
    })

    it('should not add HMR code when hot-reload is disabled', async () => {
      plugin = quaScriptPlugin({ hotReload: false })

      const configResolved = plugin.configResolved as (config: any) => Promise<void>
      await configResolved({ command: 'build', root: '/project' })

      const transform = plugin.transform as (code: string, id: string) => any
      const code = `const dialogue = qs\`Yuki: Hello!\``
      const id = '/project/src/test.ts'

      const result = await transform(code, id)

      expect(result?.code).not.toContain('import.meta.hot')
    })
  })

  describe('hot module replacement', () => {
    beforeEach(async () => {
      plugin = quaScriptPlugin({ hotReload: true })

      const configResolved = plugin.configResolved as (config: any) => Promise<void>
      const configureServer = plugin.configureServer as (server: any) => void

      await configResolved({ command: 'serve', root: '/project' })
      configureServer(mockServer)
    })

    it('should handle QuaScript file updates', async () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/src/test.ts',
        read: () => Promise.resolve('const dialogue = qs`Yuki: Updated!`'),
      }

      const result = await handleHotUpdate(ctx)

      expect(result).toBeUndefined() // Let Vite handle normally
    })

    it('should handle plugin file updates', async () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/plugins/my-plugin.ts',
        read: () => Promise.resolve('plugin content'),
      }

      const result = await handleHotUpdate(ctx)

      expect(result).toEqual([]) // Prevent default HMR
    })

    it('should handle config file updates', async () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/qua.plugins.json',
        read: () => Promise.resolve('{}'),
      }

      const result = await handleHotUpdate(ctx)

      expect(result).toEqual([]) // Prevent default HMR
    })

    it('should ignore unrelated files', async () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/src/styles.css',
        read: () => Promise.resolve('css content'),
      }

      const result = await handleHotUpdate(ctx)

      expect(result).toBeUndefined()
    })
  })

  describe('webSocket communication', () => {
    beforeEach(async () => {
      plugin = quaScriptPlugin({ hotReload: true })

      const configResolved = plugin.configResolved as (config: any) => Promise<void>
      const configureServer = plugin.configureServer as (server: any) => void

      await configResolved({ command: 'serve', root: '/project' })
      configureServer(mockServer)
    })

    it('should send WebSocket messages on hot-reload events', async () => {
      // Simulate plugin change
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: any) => any

      const ctx = {
        file: '/project/plugins/test-plugin.ts',
        read: () => Promise.resolve('plugin content'),
      }

      await handleHotUpdate(ctx)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockServer.ws.send).toHaveBeenCalledWith(expect.objectContaining({
        event: 'qua-script:reload',
        data: expect.objectContaining({
          type: 'plugin-change',
          file: '/project/plugins/test-plugin.ts',
        }),
      }))
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
    beforeEach(async () => {
      plugin = quaScriptPlugin({ hotReload: true })

      const configResolved = plugin.configResolved as (config: any) => Promise<void>
      await configResolved({ command: 'serve', root: '/project' })
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
    it('should identify plugin files correctly', async () => {
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
        const result = await handleHotUpdate({
          file,
          read: () => Promise.resolve('content'),
        })
        expect(result).toEqual([])
      }

      // Non-plugin files should return undefined
      for (const file of nonPluginFiles) {
        const result = await handleHotUpdate({
          file,
          read: () => Promise.resolve('content'),
        })
        expect(result).toBeUndefined()
      }
    })
  })
})
