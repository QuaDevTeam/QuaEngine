import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { quaEngine, quaEnginePlugin, quackPlugin, quaScriptCompilerPlugin } from '../src/index'

const quackMocks = vi.hoisted(() => ({
  bundle: vi.fn().mockResolvedValue({
    buildNumber: 'test-build',
    totalFiles: 1,
    totalSize: 10,
    assetsByType: {},
    locales: [],
  }),
  defineConfig: vi.fn((config: any) => config),
  constructor: vi.fn(),
}))

const scriptCompilerMocks = vi.hoisted(() => ({
  buildEnd: vi.fn(),
  configResolved: vi.fn(),
  configureServer: vi.fn(),
  handleHotUpdate: vi.fn(),
  transform: vi.fn(),
}))

// Mock dependencies
vi.mock('@quajs/script-compiler', () => ({
  quaScriptPlugin: vi.fn(() => ({
    buildEnd: scriptCompilerMocks.buildEnd,
    configResolved: scriptCompilerMocks.configResolved,
    configureServer: scriptCompilerMocks.configureServer,
    handleHotUpdate: scriptCompilerMocks.handleHotUpdate,
    name: 'qua-script-mock',
    transform: scriptCompilerMocks.transform,
  })),
}))

vi.mock('@quajs/quack', () => ({
  defineConfig: quackMocks.defineConfig,
  QuackBundler: class {
    constructor(config: any) {
      quackMocks.constructor(config)
    }

    bundle = quackMocks.bundle
  },
}))

vi.mock('@quajs/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

describe('@quajs/vite-plugin', () => {
  let tempDir: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
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

    it('should forward lifecycle hooks to the base script compiler plugin', async () => {
      const plugin = quaScriptCompilerPlugin()
      const server = {
        ws: { send: vi.fn() },
      }
      const hotUpdateContext = {
        file: '/project/scene.qs',
        server,
      }

      await (plugin.configResolved as any)?.({ root: '/project', command: 'serve' })
      await (plugin.configureServer as any)?.(server)
      await (plugin.handleHotUpdate as any)?.(hotUpdateContext)
      await (plugin.buildEnd as any)?.()

      expect(scriptCompilerMocks.configResolved).toHaveBeenCalled()
      expect(scriptCompilerMocks.configureServer).toHaveBeenCalledWith(server)
      expect(scriptCompilerMocks.handleHotUpdate).toHaveBeenCalledWith(hotUpdateContext)
      expect(scriptCompilerMocks.buildEnd).toHaveBeenCalled()
      expect(server.ws.send).toHaveBeenCalledWith(expect.objectContaining({
        event: 'qua-script-update',
      }))
    })

    it('should return disabled plugin when disabled', () => {
      const enginePlugin = quaEnginePlugin({ enabled: false })
      expect(typeof enginePlugin.apply).toBe('function')
      expect(enginePlugin.apply?.({} as any, {} as any)).toBe(false)

      const quackPlugin_ = quackPlugin({ enabled: false })
      expect(typeof quackPlugin_.apply).toBe('function')
      expect(quackPlugin_.apply?.({} as any, {} as any)).toBe(false)

      const scriptPlugin = quaScriptCompilerPlugin({ enabled: false })
      expect(typeof scriptPlugin.apply).toBe('function')
      expect(scriptPlugin.apply?.({} as any, {} as any)).toBe(false)
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

    it('should compose external vite plugins without centralizing their hooks', () => {
      const featurePlugin = {
        name: 'feature-hot-reload',
        configureServer: vi.fn(),
        handleHotUpdate: vi.fn(),
      }

      const plugins = quaEngine({
        vitePlugins: [
          false as any,
          [featurePlugin],
        ],
      })

      expect(plugins).toContain(featurePlugin)
      expect(plugins.some(plugin => plugin === false || plugin == null)).toBe(false)
    })
  })

  describe('development asset VFS', () => {
    it('should skip bundling in serve mode when dev VFS is enabled', async () => {
      tempDir = join(tmpdir(), `qua-vfs-${Date.now()}`)
      await mkdir(join(tempDir, 'assets'), { recursive: true })

      const plugin = quackPlugin({ source: 'assets', devVfs: true })

      plugin.configResolved?.({ root: tempDir, command: 'serve' } as any)
      await (plugin.buildStart as any)?.call({})

      expect(quackMocks.constructor).not.toHaveBeenCalled()
      expect(quackMocks.bundle).not.toHaveBeenCalled()
    })

    it('should keep bundling in serve mode when dev VFS is disabled', async () => {
      tempDir = join(tmpdir(), `qua-vfs-${Date.now()}`)
      await mkdir(join(tempDir, 'assets'), { recursive: true })

      const plugin = quackPlugin({ source: 'assets', devVfs: false })

      plugin.configResolved?.({ root: tempDir, command: 'serve' } as any)
      await (plugin.buildStart as any)?.call({})

      expect(quackMocks.constructor).toHaveBeenCalledWith(expect.objectContaining({
        source: join(tempDir, 'assets'),
      }))
      expect(quackMocks.bundle).toHaveBeenCalled()
    })

    it('should serve a dev VFS manifest and asset files', async () => {
      tempDir = join(tmpdir(), `qua-vfs-${Date.now()}`)
      const assetsDir = join(tempDir, 'assets')
      await mkdir(join(assetsDir, 'images'), { recursive: true })
      await writeFile(join(assetsDir, 'images', 'bg.png'), 'image-data')

      const plugin = quackPlugin({ source: 'assets', devVfsBase: '/@qua-assets' })
      const middlewareHandlers: Function[] = []
      const server = {
        middlewares: {
          use: vi.fn((handler) => middlewareHandlers.push(handler))
        },
        watcher: {
          add: vi.fn(),
          on: vi.fn()
        },
        ws: {
          send: vi.fn()
        }
      }

      plugin.configResolved?.({ root: tempDir, command: 'serve' } as any)
      plugin.configureServer?.(server as any)

      const manifestResponse = createMockResponse()
      await middlewareHandlers[0](
        { url: '/@qua-assets/manifest.json' },
        manifestResponse,
        vi.fn()
      )

      const manifest = JSON.parse(manifestResponse.body)
      expect(manifest.provider).toBe('dev-vfs')
      expect(manifest.assets[0]).toMatchObject({
        id: 'dev-vfs:default:images:bg.png',
        name: 'bg.png',
        type: 'images',
        path: 'images/bg.png'
      })

      const assetResponse = createMockResponse()
      await middlewareHandlers[0](
        { url: '/@qua-assets/images/bg.png' },
        assetResponse,
        vi.fn()
      )

      await assetResponse.finished
      expect(assetResponse.headers['Content-Type']).toBe('image/png')
      expect(assetResponse.body).toBe('image-data')
    })

    it('should classify video assets in the dev VFS manifest', async () => {
      tempDir = join(tmpdir(), `qua-vfs-${Date.now()}`)
      const assetsDir = join(tempDir, 'assets')
      await mkdir(join(assetsDir, 'video'), { recursive: true })
      await writeFile(join(assetsDir, 'video', 'intro.mp4'), 'video-data')

      const plugin = quackPlugin({ source: 'assets' })
      const middlewareHandlers: Function[] = []
      const server = {
        middlewares: {
          use: vi.fn((handler) => middlewareHandlers.push(handler))
        },
        watcher: {
          add: vi.fn(),
          on: vi.fn()
        },
        ws: {
          send: vi.fn()
        }
      }

      plugin.configResolved?.({ root: tempDir, command: 'serve' } as any)
      plugin.configureServer?.(server as any)

      const manifestResponse = createMockResponse()
      await middlewareHandlers[0](
        { url: '/@qua-assets/manifest.json' },
        manifestResponse,
        vi.fn()
      )

      const manifest = JSON.parse(manifestResponse.body)
      expect(manifest.assets[0]).toMatchObject({
        id: 'dev-vfs:default:video:intro.mp4',
        name: 'intro.mp4',
        type: 'video',
        path: 'video/intro.mp4',
        mimeType: 'video/mp4'
      })
    })

    it('should reject invalid VFS asset paths without throwing', async () => {
      tempDir = join(tmpdir(), `qua-vfs-${Date.now()}`)
      const assetsDir = join(tempDir, 'assets')
      await mkdir(join(assetsDir, 'images'), { recursive: true })

      const plugin = quackPlugin({ source: 'assets' })
      const middlewareHandlers: Function[] = []
      const server = {
        middlewares: {
          use: vi.fn((handler) => middlewareHandlers.push(handler))
        },
        watcher: {
          add: vi.fn(),
          on: vi.fn()
        },
        ws: {
          send: vi.fn()
        }
      }

      plugin.configResolved?.({ root: tempDir, command: 'serve' } as any)
      plugin.configureServer?.(server as any)

      const badEncodingResponse = createMockResponse()
      await middlewareHandlers[0](
        { url: '/@qua-assets/%E0%A4%A' },
        badEncodingResponse,
        vi.fn()
      )
      expect(badEncodingResponse.statusCode).toBe(400)

      const directoryResponse = createMockResponse()
      await middlewareHandlers[0](
        { url: '/@qua-assets/images' },
        directoryResponse,
        vi.fn()
      )
      expect(directoryResponse.statusCode).toBe(404)
    })

    it('should not mount VFS middleware when dev VFS is disabled', () => {
      tempDir = join(tmpdir(), `qua-vfs-${Date.now()}`)

      const plugin = quackPlugin({ source: 'assets', devVfs: false })
      const server = {
        middlewares: {
          use: vi.fn()
        },
        watcher: {
          add: vi.fn(),
          on: vi.fn()
        },
        ws: {
          send: vi.fn()
        }
      }

      plugin.configResolved?.({ root: tempDir, command: 'serve' } as any)
      plugin.configureServer?.(server as any)

      expect(server.middlewares.use).not.toHaveBeenCalled()
      expect(server.watcher.add).toHaveBeenCalledWith(join(tempDir, 'assets'))
      expect(server.watcher.on).toHaveBeenCalled()
    })

    it('should emit qua-assets:update when watched assets change', async () => {
      tempDir = join(tmpdir(), `qua-vfs-${Date.now()}`)
      const assetsDir = join(tempDir, 'assets')
      const imagePath = join(assetsDir, 'images', 'bg.png')
      await mkdir(join(assetsDir, 'images'), { recursive: true })
      await writeFile(imagePath, 'image-data')

      const plugin = quackPlugin({ source: 'assets' })
      const watcherHandlers = new Map<string, Function>()
      const server = {
        middlewares: {
          use: vi.fn()
        },
        watcher: {
          add: vi.fn(),
          on: vi.fn((event, handler) => watcherHandlers.set(event, handler))
        },
        ws: {
          send: vi.fn()
        }
      }

      plugin.configResolved?.({ root: tempDir, command: 'serve' } as any)
      plugin.configureServer?.(server as any)

      await watcherHandlers.get('change')!(imagePath)

      expect(server.ws.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'custom',
        event: 'qua-assets:update',
        data: expect.objectContaining({
          type: 'changed',
          assetId: 'dev-vfs:default:images:bg.png',
          record: expect.objectContaining({
            path: 'images/bg.png'
          })
        })
      }))
    })
  })
})

function createMockResponse() {
  const response = new Writable({
    write(chunk, _encoding, callback) {
      response.body += chunk.toString()
      callback()
    },
  }) as Writable & {
    statusCode: number
    headers: Record<string, string>
    body: string
    finished: Promise<void>
    headersSent: boolean
    setHeader: (name: string, value: string) => void
    destroy: (error?: Error) => void
  }

  response.statusCode = 200
  response.headers = {}
  response.body = ''
  response.headersSent = false
  response.finished = new Promise<void>((resolve) => {
    response.once('finish', resolve)
  })
  response.setHeader = (name: string, value: string) => {
    response.headers[name] = value
  }
  response.destroy = vi.fn()

  return response
}
