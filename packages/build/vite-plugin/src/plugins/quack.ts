import type { Plugin, ViteDevServer } from 'vite'
import type { AssetBundleManifest, QuaEngineVitePluginOptions } from '../core/types'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { createDevVfsMiddleware, createDevVfsUpdate } from '@quajs/assets-web/vite'
import { defineConfig, QuackBundler } from '@quajs/quack'
import { logPluginMessage, normalizePath } from '../core/utils'

export function quackPlugin(options: QuaEngineVitePluginOptions['assetBundling'] = {}): Plugin {
  const {
    enabled = true,
    source = 'assets',
    output = 'dist/assets',
    format = 'auto',
    devVfs = true,
    devVfsBase = '/@qua-assets',
    compression = { algorithm: 'none', level: 0 },
    encryption = { enabled: false, algorithm: 'xor' },
    plugins = [],
  } = options

  if (!enabled) {
    return {
      name: 'quack-disabled',
      apply: () => false,
    }
  }

  let projectRoot: string
  let command: 'build' | 'serve' = 'build'
  let bundleManifest: AssetBundleManifest | null = null

  return {
    name: 'quack',
    configResolved(config) {
      projectRoot = config.root
      command = config.command
      logPluginMessage('Quack asset bundler initialized', 'info')
    },

    async buildStart() {
      bundleManifest = null
      if (command === 'serve' && devVfs) {
        logPluginMessage('Development mode detected - using QuaAssets VFS instead of bundling', 'info')
        return
      }

      const sourcePath = resolve(projectRoot, source)
      const outputPath = resolve(projectRoot, output)
      try {
        await access(sourcePath)
      }
      catch {
        logPluginMessage(`Asset source directory not found: ${sourcePath}`, 'warn')
        return
      }

      let bundleFile: string | undefined
      const emitBundle = (fileName: string, bytes: Uint8Array) => {
        if (command === 'build') this.emitFile({ type: 'asset', fileName, source: bytes })
      }
      const quackConfig = defineConfig({
        source: sourcePath,
        output: outputPath + (format === 'qpk' ? '.qpk' : '.zip'),
        format,
        compression,
        encryption,
        plugins: [...plugins, {
          name: 'qua-vite-bundle-output',
          version: '0.1.0',
          async postBundle(bundlePath) {
            // Rollup owns final output. Files written directly by Quack during
            // buildStart would otherwise be deleted by Vite's emptyOutDir.
            bundleFile = basename(bundlePath)
            emitBundle(bundleFile, await readFile(bundlePath))
          },
        }],
        verbose: true,
      })

      const bundler = new QuackBundler(quackConfig)
      const stats = await bundler.bundle()
      bundleManifest = {
        version: '1.0.0',
        buildNumber: stats.buildNumber || Date.now(),
        totalFiles: stats.totalFiles,
        totalSize: stats.totalSize,
        assets: stats.assetsByType,
        locales: stats.locales?.map((locale: any) => locale.code) || [],
        bundleFile,
      }

      logPluginMessage(`Asset bundle created: ${stats.totalFiles} files, ${formatBytes(stats.totalSize)}`, 'info')
    },

    generateBundle() {
      if (!bundleManifest)
        return

      this.emitFile({
        type: 'asset',
        fileName: 'asset-manifest.json',
        source: JSON.stringify(bundleManifest, null, 2),
      })
      logPluginMessage('Asset manifest generated', 'info')
    },

    configureServer(server) {
      if (process.env.NODE_ENV === 'production')
        return

      const sourcePath = resolve(projectRoot, source)
      const vfsBase = normalizeRouteBase(devVfsBase)
      server.watcher.add(sourcePath)

      if (devVfs) {
        server.middlewares.use(createDevVfsMiddleware(createDevVfsOptions(sourcePath, vfsBase)))
        logPluginMessage(`QuaAssets development VFS mounted at ${vfsBase}`, 'info')
      }

      server.watcher.on('change', async file => maybeSendDevAssetUpdate(server, sourcePath, file, 'changed'))
      server.watcher.on('add', async file => maybeSendDevAssetUpdate(server, sourcePath, file, 'added'))
      server.watcher.on('unlink', async file => maybeSendDevAssetUpdate(server, sourcePath, file, 'removed'))
    },
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

async function listFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(entries.map(async (entry) => {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory())
        return await listFiles(entryPath)
      if (entry.isFile())
        return [entryPath]
      return []
    }))
    return files.flat()
  }
  catch {
    return []
  }
}

async function maybeSendDevAssetUpdate(
  server: ViteDevServer,
  sourcePath: string,
  file: string,
  type: 'added' | 'changed' | 'removed',
): Promise<void> {
  const relativePath = relative(sourcePath, file)
  if (!isInsideDirectory(file, sourcePath))
    return

  logPluginMessage(`Asset ${type}: ${relativePath}`, 'info')
  try {
    const data = await createDevVfsUpdate(createDevVfsOptions(sourcePath), file, type)
    server.ws.send({
      type: 'custom',
      event: 'qua-assets:update',
      data,
    })
  }
  catch (error) {
    logPluginMessage(`Failed to send asset VFS update: ${error}`, 'warn')
  }
}

function createDevVfsOptions(sourcePath: string, vfsBase?: string) {
  return {
    sourcePath,
    vfsBase,
    listFiles,
    readFile: async (path: string) => new Uint8Array(await readFile(path)),
    statFile: stat,
    createReadStream,
    resolvePath: resolve,
    relativePath: relative,
    normalizePath,
    sha256: (data: Uint8Array) => createHash('sha256').update(data).digest('hex'),
  }
}

function normalizeRouteBase(route: string): string {
  const normalized = route.startsWith('/') ? route : `/${route}`
  return normalized.replace(/\/+$/, '')
}

function isInsideDirectory(path: string, directory: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedDirectory = normalizePath(directory).replace(/\/$/, '')
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
}
