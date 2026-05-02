import type { Plugin, ViteDevServer } from 'vite'
import type { AssetBundleManifest, QuaEngineVitePluginOptions } from '../core/types'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import { defineConfig, QuackBundler } from '@quajs/quack'
import { logPluginMessage, normalizePath } from '../core/utils'

type DevAssetType = 'images' | 'characters' | 'audio' | 'video' | 'scripts' | 'data'

interface DevAssetManifestRecord {
  id: string
  bundleName: string
  name: string
  type: DevAssetType
  locale: string
  path: string
  hash: string
  size: number
  version: number
  mtime: number
  mimeType: string
}

interface DevAssetManifest {
  version: string
  created: string
  provider: 'dev-vfs'
  assets: DevAssetManifestRecord[]
}

/**
 * Vite plugin for Quack asset bundling integration
 *
 * This plugin:
 * 1. Integrates with the Quack bundler
 * 2. Processes game assets during build
 * 3. Generates asset bundles and manifests
 * 4. Provides development-time asset watching
 */
export function quackPlugin(options: QuaEngineVitePluginOptions['assetBundling'] = {}): Plugin {
  const {
    enabled = true,
    source = 'assets',
    output = 'dist/assets',
    format = 'auto',
    devVfs = true,
    devVfsBase = '/@qua-assets',
    compression = { algorithm: 'deflate', level: 6 },
    encryption = { enabled: false, algorithm: 'xor' },
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
      if (command === 'serve' && devVfs) {
        logPluginMessage('Development mode detected - using QuaAssets VFS instead of bundling', 'info')
        return
      }

      try {
        const sourcePath = resolve(projectRoot, source)
        const outputPath = resolve(projectRoot, output)

        logPluginMessage(`Asset bundling: ${sourcePath} -> ${outputPath}`, 'info')

        // Check if source directory exists
        try {
          await access(sourcePath)
        }
        catch {
          logPluginMessage(`Asset source directory not found: ${sourcePath}`, 'warn')
          return
        }

        const quackConfig = defineConfig({
          source: sourcePath,
          output: outputPath + (format === 'qpk' ? '.qpk' : '.zip'),
          format,
          compression,
          encryption,
          verbose: true,
        })

        const bundler = new QuackBundler(quackConfig)

        // Create bundle
        const stats = await bundler.bundle()

        // Generate manifest for Vite
        bundleManifest = {
          version: '1.0.0',
          buildNumber: stats.buildNumber || Date.now(),
          totalFiles: stats.totalFiles,
          totalSize: stats.totalSize,
          assets: stats.assetsByType,
          locales: stats.locales?.map((l: any) => l.code) || [],
        }

        logPluginMessage(`Asset bundle created: ${stats.totalFiles} files, ${formatBytes(stats.totalSize)}`, 'info')
      }
      catch (error) {
        logPluginMessage(`Asset bundling failed: ${error}`, 'error')
        throw error
      }
    },

    generateBundle() {
      if (bundleManifest) {
        // Emit asset manifest as a build artifact
        this.emitFile({
          type: 'asset',
          fileName: 'asset-manifest.json',
          source: JSON.stringify(bundleManifest, null, 2),
        })

        logPluginMessage('Asset manifest generated', 'info')
      }
    },

    configureServer(server) {
      // Development mode: watch assets directory
      if (process.env.NODE_ENV !== 'production') {
        const sourcePath = resolve(projectRoot, source)
        const vfsBase = normalizeRouteBase(devVfsBase)

        server.watcher.add(sourcePath)

        if (devVfs) {
          server.middlewares.use(async (req, res, next) => {
            const pathname = getRequestPathname(req.url)
            if (!pathname)
              return next()

            if (pathname === `${vfsBase}/manifest.json`) {
              try {
                const manifest = await createDevAssetManifest(sourcePath)
                sendJson(res, manifest)
              }
              catch (error) {
                sendError(res, 500, `Failed to create asset manifest: ${error instanceof Error ? error.message : String(error)}`)
              }
              return
            }

            if (pathname.startsWith(`${vfsBase}/`)) {
              const encodedAssetPath = pathname.slice(vfsBase.length + 1)
              const relativeAssetPath = safeDecodeURIComponent(encodedAssetPath)
              if (!relativeAssetPath) {
                sendError(res, 400, `Invalid asset path: ${encodedAssetPath}`)
                return
              }

              const assetPath = resolve(sourcePath, relativeAssetPath)

              if (!isInsideDirectory(assetPath, sourcePath)) {
                sendError(res, 403, 'Asset path is outside the VFS root')
                return
              }

              try {
                const assetStats = await stat(assetPath)
                if (!assetStats.isFile()) {
                  sendError(res, 404, `Asset not found: ${relativeAssetPath}`)
                  return
                }

                res.setHeader('Content-Type', getMimeType(assetPath))
                res.setHeader('Cache-Control', 'no-cache')
                const stream = createReadStream(assetPath)
                stream.on('error', (error) => {
                  if (!res.headersSent) {
                    sendError(res, 500, `Failed to read asset: ${error.message}`)
                  }
                  else {
                    res.destroy(error)
                  }
                })
                stream.pipe(res)
              }
              catch {
                sendError(res, 404, `Asset not found: ${relativeAssetPath}`)
              }
              return
            }

            next()
          })

          logPluginMessage(`QuaAssets development VFS mounted at ${vfsBase}`, 'info')
        }

        server.watcher.on('change', async (file) => {
          const relativePath = relative(sourcePath, file)
          if (isInsideDirectory(file, sourcePath)) {
            logPluginMessage(`Asset changed: ${relativePath}`, 'info')
            await sendDevAssetUpdate(server, sourcePath, file, 'changed')
          }
        })

        server.watcher.on('add', async (file) => {
          const relativePath = relative(sourcePath, file)
          if (isInsideDirectory(file, sourcePath)) {
            logPluginMessage(`Asset added: ${relativePath}`, 'info')
            await sendDevAssetUpdate(server, sourcePath, file, 'added')
          }
        })

        server.watcher.on('unlink', async (file) => {
          const relativePath = relative(sourcePath, file)
          if (isInsideDirectory(file, sourcePath)) {
            logPluginMessage(`Asset removed: ${relativePath}`, 'info')
            sendRemovedDevAssetUpdate(server, sourcePath, file)
          }
        })
      }
    },
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

async function createDevAssetManifest(sourcePath: string): Promise<DevAssetManifest> {
  const files = await listFiles(sourcePath)
  const assets = await Promise.all(files.map(file => createDevAssetRecord(sourcePath, file)))

  return {
    version: 'dev',
    created: new Date().toISOString(),
    provider: 'dev-vfs',
    assets,
  }
}

async function listFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(entries.map(async (entry) => {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        return await listFiles(entryPath)
      }
      if (entry.isFile()) {
        return [entryPath]
      }
      return []
    }))

    return files.flat()
  }
  catch {
    return []
  }
}

async function createDevAssetRecord(sourcePath: string, file: string): Promise<DevAssetManifestRecord> {
  const relativePath = normalizePath(relative(sourcePath, file))
  const assetInfo = inferDevAssetInfo(relativePath)
  const [buffer, stats] = await Promise.all([
    readFile(file),
    stat(file),
  ])
  const hash = createHash('sha256').update(buffer).digest('hex')

  return {
    id: createDevAssetId(assetInfo.type, assetInfo.name, assetInfo.locale),
    bundleName: 'dev-vfs',
    name: assetInfo.name,
    type: assetInfo.type,
    locale: assetInfo.locale,
    path: relativePath,
    hash,
    size: stats.size,
    version: stats.mtimeMs,
    mtime: stats.mtimeMs,
    mimeType: getMimeType(file),
  }
}

function createRemovedDevAssetRecord(sourcePath: string, file: string): Pick<DevAssetManifestRecord, 'id' | 'path'> {
  const relativePath = normalizePath(relative(sourcePath, file))
  const assetInfo = inferDevAssetInfo(relativePath)

  return {
    id: createDevAssetId(assetInfo.type, assetInfo.name, assetInfo.locale),
    path: relativePath,
  }
}

async function sendDevAssetUpdate(
  server: ViteDevServer,
  sourcePath: string,
  file: string,
  type: 'added' | 'changed',
): Promise<void> {
  try {
    const record = await createDevAssetRecord(sourcePath, file)
    server.ws.send({
      type: 'custom',
      event: 'qua-assets:update',
      data: {
        type,
        assetId: record.id,
        record,
        path: record.path,
        hash: record.hash,
        timestamp: Date.now(),
      },
    })
  }
  catch (error) {
    logPluginMessage(`Failed to send asset VFS update: ${error}`, 'warn')
  }
}

function sendRemovedDevAssetUpdate(
  server: ViteDevServer,
  sourcePath: string,
  file: string,
): void {
  const record = createRemovedDevAssetRecord(sourcePath, file)
  server.ws.send({
    type: 'custom',
    event: 'qua-assets:update',
    data: {
      type: 'removed',
      assetId: record.id,
      path: record.path,
      timestamp: Date.now(),
    },
  })
}

function inferDevAssetInfo(relativePath: string): { type: DevAssetType, name: string, locale: string } {
  let parts = normalizePath(relativePath).split('/').filter(Boolean)
  let locale = 'default'

  if (parts[0] === 'locales' && parts[1] && isLocaleSegment(parts[1])) {
    locale = parts[1]
    parts = parts.slice(2)
  }

  let type = isDevAssetType(parts[0]) ? parts[0] : getAssetTypeByExtension(relativePath)
  let nameParts = isDevAssetType(parts[0]) ? parts.slice(1) : parts

  if (nameParts.length === 0) {
    nameParts = [basename(relativePath)]
  }

  let name = nameParts.join('/')
  const localizedName = stripFilenameLocale(name)
  if (localizedName.locale) {
    locale = localizedName.locale
    name = localizedName.name
  }

  return { type, name, locale }
}

function stripFilenameLocale(name: string): { name: string, locale?: string } {
  const extension = extname(name)
  if (!extension)
    return { name }

  const base = name.slice(0, -extension.length)
  const match = base.match(/^(.*)\.([a-z]{2}(?:-[a-z]{2}|-[A-Z]{2})?)$/)
  if (!match)
    return { name }

  return {
    name: `${match[1]}${extension}`,
    locale: match[2],
  }
}

function createDevAssetId(type: DevAssetType, name: string, locale: string): string {
  return `dev-vfs:${locale}:${type}:${name}`
}

function isDevAssetType(value: string | undefined): value is DevAssetType {
  return value === 'images'
    || value === 'characters'
    || value === 'audio'
    || value === 'video'
    || value === 'scripts'
    || value === 'data'
}

function getAssetTypeByExtension(path: string): DevAssetType {
  const extension = extname(path).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'].includes(extension))
    return 'images'
  if (['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(extension))
    return 'audio'
  if (['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'].includes(extension))
    return 'video'
  if (['.js', '.mjs', '.ts', '.json5'].includes(extension))
    return 'scripts'
  return 'data'
}

function isLocaleSegment(value: string): boolean {
  return /^(default|[a-z]{2}(?:-[a-z]{2}|-[A-Z]{2})?)$/.test(value)
}

function normalizeRouteBase(route: string): string {
  const normalized = route.startsWith('/') ? route : `/${route}`
  return normalized.replace(/\/+$/, '')
}

function getRequestPathname(url: string | undefined): string | null {
  if (!url)
    return null

  try {
    return new URL(url, 'http://qua.local').pathname
  }
  catch {
    return null
  }
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return null
  }
}

function isInsideDirectory(path: string, directory: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedDirectory = normalizePath(directory).replace(/\/$/, '')
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
}

function sendJson(res: any, data: unknown): void {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(JSON.stringify(data))
}

function sendError(res: any, statusCode: number, message: string): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(message)
}

function getMimeType(path: string): string {
  const extension = extname(path).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ts': 'text/typescript',
    '.txt': 'text/plain',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
  }

  return mimeTypes[extension] || 'application/octet-stream'
}
