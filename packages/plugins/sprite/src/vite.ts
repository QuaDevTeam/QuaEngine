import type { DevAssetManifestRecord } from '@quajs/assets-web/vite'
import type { Plugin, ViteDevServer } from 'vite'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { createDevAssetRecord } from '@quajs/assets-web/vite'
import { createLogger } from '@quajs/logger'
import {
  createSpriteManifestFromAssets,
  getSpriteManifestPath,
  resolveSpriteFamily,
  serializeSpriteManifest,
  SPRITE_CHARACTERS_DIR,
} from './contracts'

const logger = createLogger('plugin-sprite:vite')

export interface SpriteVitePluginOptions {
  enabled?: boolean
  source?: string
  devVfsBase?: string
}

interface SyntheticSpriteManifestAsset {
  family: string
  record: DevAssetManifestRecord
  content: Buffer
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
            const synthetic = createSyntheticSpriteManifestAssets(records)
            sendJson(res, {
              version: 'dev',
              created: new Date().toISOString(),
              provider: 'dev-vfs',
              assets: mergeRecords(records, synthetic.map(asset => asset.record)),
            })
            return
          }

          const relativeAssetPath = safeDecodeURIComponent(pathname.slice(vfsBase.length + 1))
          if (!relativeAssetPath || !isSpriteManifestAssetRequest(relativeAssetPath)) {
            next()
            return
          }

          if (await pathExists(resolve(sourcePath, relativeAssetPath))) {
            next()
            return
          }

          const records = await createPhysicalAssetRecords(sourcePath, vfsBase)
          const synthetic = createSyntheticSpriteManifestAssets(records)
          const asset = synthetic.find(item => item.record.path === relativeAssetPath)
          if (!asset) {
            next()
            return
          }

          sendJsonBuffer(res, asset.content)
        }
        catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : String(error))
        }
      })

      const sendUpdate = async (file: string) => {
        await maybeSendSpriteManifestUpdate(server, sourcePath, file)
      }

      server.watcher.on('change', sendUpdate)
      server.watcher.on('add', sendUpdate)
      server.watcher.on('unlink', sendUpdate)

      logger.info(`Sprite dev manifest HMR mounted under ${vfsBase}`)
    },
  }
}

async function maybeSendSpriteManifestUpdate(
  server: ViteDevServer,
  sourcePath: string,
  file: string,
): Promise<void> {
  const normalizedSource = normalizeFilePath(sourcePath)
  const normalizedFile = normalizeFilePath(file)
  if (!isInsideDirectory(normalizedFile, normalizedSource)) {
    return
  }

  const relativePath = normalizeFilePath(relative(sourcePath, file))
  if (!relativePath.startsWith(`${SPRITE_CHARACTERS_DIR}/`)) {
    return
  }

  const family = resolveSpriteFamily(relativePath)
  if (!family) {
    return
  }

  try {
    const records = await createPhysicalAssetRecords(sourcePath)
    const synthetic = createSyntheticSpriteManifestAssets(records)
    const manifestPath = `${SPRITE_CHARACTERS_DIR}/${getSpriteManifestPath(family)}`
    const asset = synthetic.find(item => item.record.path === manifestPath)

    if (asset) {
      server.ws.send({
        type: 'custom',
        event: 'qua-assets:update',
        data: {
          type: 'changed',
          assetId: asset.record.id,
          record: asset.record,
          path: asset.record.path,
          hash: asset.record.hash,
          timestamp: Date.now(),
        },
      })
      return
    }

    server.ws.send({
      type: 'custom',
      event: 'qua-assets:update',
      data: {
        type: 'removed',
        assetId: createDevAssetId('characters', getSpriteManifestPath(family), 'default'),
        path: manifestPath,
        timestamp: Date.now(),
      },
    })
  }
  catch (error) {
    logger.warn(`Failed to send sprite manifest update: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function createPhysicalAssetRecords(sourcePath: string, vfsBase = '/@qua-assets'): Promise<DevAssetManifestRecord[]> {
  const devOptions = createDevRecordOptions(sourcePath, vfsBase)
  const files = await listFiles(sourcePath)
  return await Promise.all(files.map(file => createDevAssetRecord(devOptions, file)))
}

function createSyntheticSpriteManifestAssets(records: readonly DevAssetManifestRecord[]): SyntheticSpriteManifestAsset[] {
  const assetSources = records.map(record => ({
    relativePath: record.path,
    size: record.size,
    hash: record.hash,
    mimeType: record.mimeType,
    mtime: record.mtime,
  }))
  const families = collectSpriteFamilies(records)
  const generated: SyntheticSpriteManifestAsset[] = []

  for (const family of families) {
    const manifestPath = `${SPRITE_CHARACTERS_DIR}/${getSpriteManifestPath(family)}`
    if (records.some(record => record.path === manifestPath)) {
      continue
    }

    const manifest = createSpriteManifestFromAssets(assetSources, family)
    if (!manifest) {
      continue
    }

    const content = Buffer.from(`${serializeSpriteManifest(manifest)}\n`, 'utf8')
    const familyRecords = records.filter(record => resolveSpriteFamily(record.path) === family)
    const familyMtimes = familyRecords.map(record => record.mtime || 0).filter(Boolean)
    const mtime = familyMtimes.length > 0 ? Math.max(...familyMtimes) : Date.now()

    generated.push({
      family,
      content,
      record: {
        id: createDevAssetId('characters', getSpriteManifestPath(family), 'default'),
        bundleName: 'dev-vfs',
        name: getSpriteManifestPath(family),
        type: 'characters',
        locale: 'default',
        path: manifestPath,
        hash: createHash('sha256').update(content).digest('hex'),
        size: content.byteLength,
        version: mtime,
        mtime,
        mimeType: 'application/json',
      },
    })
  }

  return generated
}

function collectSpriteFamilies(records: readonly DevAssetManifestRecord[]): string[] {
  const families = new Set<string>()
  for (const record of records) {
    if (!record.path.startsWith(`${SPRITE_CHARACTERS_DIR}/`)) {
      continue
    }

    const family = resolveSpriteFamily(record.path)
    if (family) {
      families.add(family)
    }
  }
  return [...families].sort()
}

function mergeRecords(
  physical: readonly DevAssetManifestRecord[],
  synthetic: readonly DevAssetManifestRecord[],
): DevAssetManifestRecord[] {
  const records = new Map<string, DevAssetManifestRecord>()
  for (const record of physical) {
    records.set(record.id, record)
  }
  for (const record of synthetic) {
    records.set(record.id, record)
  }
  return [...records.values()]
}

function isSpriteManifestAssetRequest(relativePath: string): boolean {
  return relativePath.startsWith(`${SPRITE_CHARACTERS_DIR}/`)
    && relativePath.endsWith('/sprite.manifest.json')
}

function createDevRecordOptions(sourcePath: string, vfsBase?: string) {
  return {
    sourcePath,
    vfsBase,
    listFiles,
    readFile: async (path: string) => new Uint8Array(await readFile(path)),
    statFile: stat,
    createReadStream,
    resolvePath: resolve,
    relativePath: relative,
    normalizePath: normalizeFilePath,
    sha256: (data: Uint8Array) => createHash('sha256').update(data).digest('hex'),
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
      return entry.isFile() ? [entryPath] : []
    }))
    return files.flat()
  }
  catch {
    return []
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
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

function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function isInsideDirectory(path: string, directory: string): boolean {
  const normalizedDirectory = directory.replace(/\/$/, '')
  return path === normalizedDirectory || path.startsWith(`${normalizedDirectory}/`)
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
