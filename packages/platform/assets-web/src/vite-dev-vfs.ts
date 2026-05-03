export type DevAssetType = 'images' | 'characters' | 'audio' | 'video' | 'scripts' | 'data'

export interface DevAssetManifestRecord {
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

export interface DevAssetManifest {
  version: string
  created: string
  provider: 'dev-vfs'
  assets: DevAssetManifestRecord[]
}

export interface DevVfsMiddlewareOptions {
  sourcePath: string
  vfsBase?: string
  listFiles: (directory: string) => Promise<string[]>
  readFile: (path: string) => Promise<Uint8Array>
  statFile: (path: string) => Promise<{ isFile: () => boolean, size: number, mtimeMs: number }>
  createReadStream: (path: string) => { on: (...args: any[]) => unknown, pipe: (target: any) => unknown }
  resolvePath: (...segments: string[]) => string
  relativePath: (from: string, to: string) => string
  normalizePath: (path: string) => string
  sha256: (data: Uint8Array) => string | Promise<string>
}

export function createDevVfsMiddleware(options: DevVfsMiddlewareOptions) {
  const vfsBase = normalizeRouteBase(options.vfsBase || '/@qua-assets')

  return async (req: { url?: string }, res: any, next: () => void) => {
    const pathname = getRequestPathname(req.url)
    if (!pathname)
      return next()

    if (pathname === `${vfsBase}/manifest.json`) {
      try {
        const files = await options.listFiles(options.sourcePath)
        const assets = await Promise.all(files.map(file => createDevAssetRecord(options, file)))
        sendJson(res, {
          version: 'dev',
          created: new Date().toISOString(),
          provider: 'dev-vfs',
          assets,
        } satisfies DevAssetManifest)
      }
      catch (error) {
        sendError(res, 500, `Failed to create asset manifest: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }

    if (!pathname.startsWith(`${vfsBase}/`)) {
      return next()
    }

    const encodedAssetPath = pathname.slice(vfsBase.length + 1)
    const relativeAssetPath = safeDecodeURIComponent(encodedAssetPath)
    if (!relativeAssetPath) {
      sendError(res, 400, `Invalid asset path: ${encodedAssetPath}`)
      return
    }

    const assetPath = options.resolvePath(options.sourcePath, relativeAssetPath)
    if (!isInsideDirectory(options.normalizePath(assetPath), options.normalizePath(options.sourcePath))) {
      sendError(res, 403, 'Asset path is outside the VFS root')
      return
    }

    try {
      const stats = await options.statFile(assetPath)
      if (!stats.isFile()) {
        sendError(res, 404, `Asset not found: ${relativeAssetPath}`)
        return
      }
      res.setHeader('Content-Type', getMimeType(assetPath))
      res.setHeader('Cache-Control', 'no-cache')
      const stream = options.createReadStream(assetPath)
      stream.on('error', (error: Error) => {
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
  }
}

export async function createDevAssetRecord(options: DevVfsMiddlewareOptions, file: string): Promise<DevAssetManifestRecord> {
  const relativePath = options.normalizePath(options.relativePath(options.sourcePath, file))
  const assetInfo = inferDevAssetInfo(relativePath)
  const [buffer, stats] = await Promise.all([
    options.readFile(file),
    options.statFile(file),
  ])
  const hash = await options.sha256(buffer)
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

export async function createDevVfsUpdate(
  options: DevVfsMiddlewareOptions,
  file: string,
  type: 'added' | 'changed' | 'removed',
) {
  if (type === 'removed') {
    const relativePath = options.normalizePath(options.relativePath(options.sourcePath, file))
    const assetInfo = inferDevAssetInfo(relativePath)
    return {
      type,
      assetId: createDevAssetId(assetInfo.type, assetInfo.name, assetInfo.locale),
      path: relativePath,
      timestamp: Date.now(),
    }
  }

  const record = await createDevAssetRecord(options, file)
  return {
    type,
    assetId: record.id,
    record,
    path: record.path,
    hash: record.hash,
    timestamp: Date.now(),
  }
}

export function inferDevAssetInfo(relativePath: string): { type: DevAssetType, name: string, locale: string } {
  let parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  let locale = 'default'

  if (parts[0] === 'locales' && parts[1] && isLocaleSegment(parts[1])) {
    locale = parts[1]
    parts = parts.slice(2)
  }

  const type = isDevAssetType(parts[0]) ? parts[0] : getAssetTypeByExtension(relativePath)
  let nameParts = isDevAssetType(parts[0]) ? parts.slice(1) : parts
  if (nameParts.length === 0) {
    nameParts = [relativePath.split('/').pop() || relativePath]
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
  const extension = name.includes('.') ? `.${name.split('.').pop()}` : ''
  if (!extension)
    return { name }
  const base = name.slice(0, -extension.length)
  const match = base.match(/^(.*)\.([a-z]{2}(?:-[a-z]{2}|-[A-Z]{2})?)$/)
  return match ? { name: `${match[1]}${extension}`, locale: match[2] } : { name }
}

function createDevAssetId(type: DevAssetType, name: string, locale: string): string {
  return `dev-vfs:${locale}:${type}:${name}`
}

function isDevAssetType(value: string | undefined): value is DevAssetType {
  return value === 'images' || value === 'characters' || value === 'audio' || value === 'video' || value === 'scripts' || value === 'data'
}

function getAssetTypeByExtension(path: string): DevAssetType {
  const extension = path.toLowerCase().slice(path.lastIndexOf('.'))
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
  const normalizedDirectory = directory.replace(/\/$/, '')
  return path === normalizedDirectory || path.startsWith(`${normalizedDirectory}/`)
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
  const extension = path.toLowerCase().slice(path.lastIndexOf('.'))
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
