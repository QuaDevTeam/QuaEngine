import type { DevAssetManifestRecord, DevVfsMiddlewareOptions } from '@quajs/assets-web/vite'
import type { Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { createDevAssetRecord } from '@quajs/assets-web/vite'
import { createLogger } from '@quajs/logger'
import { normalizeSpritePath, SPRITE_UI_SKIN_SOURCE_FILE } from './contracts'
import { createDerivedSpriteAssets } from './importers'

const logger = createLogger('plugin-sprite:vite')

type SyntheticSpriteRecord = DevAssetManifestRecord & { content?: Uint8Array }

export interface SpriteVitePluginOptions {
  enabled?: boolean
  source?: string
  devVfsBase?: string
}

export function createSpriteVitePlugin(options: SpriteVitePluginOptions = {}): Plugin {
  const {
    enabled = true,
    source = 'assets',
    devVfsBase = '/@qua-assets',
  } = options

  if (!enabled) {
    return {
      name: '@quajs/plugin-sprite:vite-disabled',
      apply: () => false,
    }
  }

  let projectRoot = process.cwd()
  let command: 'build' | 'serve' = 'build'
  let lastSyntheticRecords = new Map<string, DevAssetManifestRecord>()

  return {
    name: '@quajs/plugin-sprite:vite',
    enforce: 'pre',
    configResolved(config) {
      projectRoot = config.root
      command = config.command
    },
    configureServer(server) {
      if (command !== 'serve') {
        return
      }

      const sourcePath = resolve(projectRoot, source)
      const vfsBase = normalizeRouteBase(devVfsBase)
      server.watcher.add(sourcePath)

      server.middlewares.use(async (req, res, next) => {
        const pathname = getRequestPathname(req.url)
        if (!pathname || !pathname.startsWith(`${vfsBase}/`)) {
          next()
          return
        }

        try {
          if (pathname === `${vfsBase}/manifest.json`) {
            const records = await createPhysicalAssetRecords(sourcePath, vfsBase)
            const synthetic = await createSyntheticSpriteRecords(sourcePath, records)
            sendJson(res, {
              version: 'dev',
              created: new Date().toISOString(),
              provider: 'dev-vfs',
              assets: mergeRecords(records, synthetic),
            })
            return
          }

          const relativeAssetPath = safeDecodeURIComponent(pathname.slice(vfsBase.length + 1))
          if (!relativeAssetPath) {
            next()
            return
          }

          const physicalPath = resolve(sourcePath, relativeAssetPath)
          if (await pathExists(physicalPath)) {
            next()
            return
          }

          const records = await createPhysicalAssetRecords(sourcePath, vfsBase)
          const synthetic = await createSyntheticSpriteRecords(sourcePath, records)
          const asset = synthetic.find(item => item.path === relativeAssetPath)
          if (!asset) {
            next()
            return
          }

          sendJsonBuffer(res, Buffer.from(asset.content || new Uint8Array()))
        }
        catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : String(error))
        }
      })

      const updateSyntheticAssets = async () => {
        try {
          const records = await createPhysicalAssetRecords(sourcePath, vfsBase)
          const synthetic = await createSyntheticSpriteRecords(sourcePath, records)
          const nextMap = new Map<string, DevAssetManifestRecord>()
          for (const record of synthetic) {
            nextMap.set(record.id, record)
          }

          for (const [id, record] of nextMap) {
            const prev = lastSyntheticRecords.get(id)
            if (!prev || prev.hash !== record.hash || prev.size !== record.size || prev.path !== record.path) {
              server.ws.send({
                type: 'custom',
                event: 'qua-assets:update',
                data: {
                  type: 'changed',
                  assetId: record.id,
                  record,
                  path: record.path,
                  hash: record.hash,
                  timestamp: Date.now(),
                },
              })
            }
          }

          for (const [id, record] of lastSyntheticRecords) {
            if (nextMap.has(id)) {
              continue
            }
            server.ws.send({
              type: 'custom',
              event: 'qua-assets:update',
              data: {
                type: 'removed',
                assetId: id,
                path: record.path,
                timestamp: Date.now(),
              },
            })
          }

          lastSyntheticRecords = nextMap
        }
        catch (error) {
          logger.warn(`Failed to refresh synthetic sprite assets: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      server.watcher.on('change', updateSyntheticAssets)
      server.watcher.on('add', updateSyntheticAssets)
      server.watcher.on('unlink', updateSyntheticAssets)

      logger.info(`Sprite dev manifest HMR mounted under ${vfsBase}`)
    },
  }
}

async function createPhysicalAssetRecords(sourcePath: string, vfsBase = '/@qua-assets'): Promise<DevAssetManifestRecord[]> {
  const devOptions = createDevRecordOptions(sourcePath, vfsBase)
  const files = await listFiles(sourcePath)
  return await Promise.all(files
    .filter(file => !isSpriteSourceOnlyFile(file))
    .map(file => createDevAssetRecord(devOptions, file)))
}

async function createSyntheticSpriteRecords(sourcePath: string, physicalRecords: readonly DevAssetManifestRecord[]): Promise<SyntheticSpriteRecord[]> {
  const assets = physicalRecords.map(record => ({
    name: record.name,
    path: record.path,
    relativePath: record.path,
    size: record.size,
    hash: record.hash,
    type: record.type,
    locales: [record.locale],
    mimeType: record.mimeType,
    mtime: record.mtime,
  }))

  const generated = await createDerivedSpriteAssets(sourcePath, assets)
  return generated.map(asset => ({
    id: createDevAssetId(asset.type, asset.relativePath, asset.locales?.[0] || 'default'),
    bundleName: 'dev-vfs',
    name: asset.name,
    type: asset.type,
    locale: asset.locales?.[0] || 'default',
    path: asset.relativePath,
    hash: asset.hash,
    size: asset.size,
    version: asset.mtime || Date.now(),
    mtime: asset.mtime || Date.now(),
    mimeType: asset.mimeType || inferGeneratedMimeType(asset.relativePath),
    content: asset.content,
  }))
}

async function listFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const files = await Promise.all(entries.map(async (entry) => {
      const entryPath = join(root, entry.name)
      if (entry.isDirectory()) {
        return await listFiles(entryPath)
      }
      return entry.isFile() ? [entryPath] : []
    }))
    return files.flat()
  }
  catch {
    return []
  }
}

function createDevRecordOptions(sourcePath: string, vfsBase: string) {
  return {
    sourcePath,
    vfsBase,
    listFiles,
    readFile: async (filePath: string) => new Uint8Array(await readFile(filePath)),
    statFile: async (filePath: string) => await stat(filePath),
    createReadStream,
    resolvePath: (...segments: string[]) => resolve(...segments),
    relativePath: (from: string, to: string) => relative(from, to),
    normalizePath: (filePath: string) => normalizeSpritePath(filePath) || filePath.replace(/\\/g, '/'),
    sha256: async (data: Uint8Array) => createHash('sha256').update(data).digest('hex'),
  } satisfies DevVfsMiddlewareOptions
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  }
  catch {
    return false
  }
}

function createDevAssetId(type: string, name: string, locale: string): string {
  return `dev-vfs:${locale}:${type}:${name}`
}

function normalizeRouteBase(route: string): string {
  const normalized = route.startsWith('/') ? route : `/${route}`
  return normalized.replace(/\/+$/, '')
}

function getRequestPathname(url: string | undefined): string | null {
  if (!url) {
    return null
  }
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

function sendJson(res: any, data: unknown): void {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(JSON.stringify(data))
}

function sendJsonBuffer(res: any, data: Buffer): void {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(data)
}

function sendError(res: any, statusCode: number, message: string): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(message)
}

function isSpriteSourceOnlyFile(path: string): boolean {
  const normalized = normalizeSpritePath(path) || path
  return normalized.endsWith('.psd')
    || normalized.endsWith('.psb')
    || normalized.endsWith(`/${SPRITE_UI_SKIN_SOURCE_FILE}`)
}

function mergeRecords(
  physical: readonly DevAssetManifestRecord[],
  synthetic: readonly SyntheticSpriteRecord[],
): DevAssetManifestRecord[] {
  const records = new Map<string, DevAssetManifestRecord>()
  for (const record of synthetic) {
    const { content: _content, ...rest } = record
    records.set(record.id, rest)
  }
  for (const record of physical) {
    records.set(record.id, record)
  }
  return [...records.values()]
}

function inferGeneratedMimeType(relativePath: string): string {
  return relativePath.toLowerCase().endsWith('.json') ? 'application/json' : 'image/png'
}
