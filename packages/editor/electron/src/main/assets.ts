import type { EditorProject } from '@quajs/editor-core'
import type { ProjectClient } from '../project-service/client.js'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { projectPath } from '../project-service/asset-files.js'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.ogv': 'video/ogg',
}

/** Session URLs expose indexed media only, never a general-purpose file protocol. */
export class AssetProtocol {
  private token = randomUUID()
  private readonly cache = new Map<string, Uint8Array>()
  private readonly pending = new Map<string, Promise<Uint8Array>>()
  private readonly streams = new Set<ReturnType<typeof createReadStream>>()
  private cacheBytes = 0

  constructor(private readonly current: () => EditorProject | undefined, private readonly service: ProjectClient) {
    protocol.handle('qua-asset', request => this.respond(request).catch(() => new Response('Asset unavailable', { status: 404 })))
  }

  reset(): void {
    this.token = randomUUID()
    this.cache.clear()
    this.cacheBytes = 0
    this.pending.clear()
    for (const stream of this.streams) stream.destroy()
    this.streams.clear()
  }

  url(root: string, path: string, thumbnail: boolean): string {
    const project = this.current()
    const entry = project?.entries.find(entry => entry.path === path)
    if (!project || root !== project.root || !entry || !['image', 'audio', 'video'].includes(entry.kind))
      throw new Error('媒体已移除或项目已切换。')
    return `qua-asset://${this.token}/${encodeURIComponent(path)}?v=${entry.modified}&thumbnail=${thumbnail ? '1' : '0'}`
  }

  private async respond(request: Request): Promise<Response> {
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405 })
    const url = new URL(request.url)
    const token = this.token
    const project = this.current()
    if (!project || url.hostname !== token)
      return new Response(null, { status: 403 })
    const path = decodeURIComponent(url.pathname.slice(1))
    const entry = project.entries.find(entry => entry.path === path)
    if (!entry || !['image', 'audio', 'video'].includes(entry.kind))
      return new Response(null, { status: 404 })
    const canonical = await projectPath(project.root, path)
    if (token !== this.token)
      return new Response(null, { status: 410 })
    const metadata = await stat(canonical)
    if (entry.kind === 'image') {
      const preview = url.searchParams.get('thumbnail') !== '1'
      const key = `${token}:${path}:${metadata.mtimeMs}:${metadata.size}:${preview}`
      let bytes = this.cache.get(key)
      if (!bytes) {
        let pending = this.pending.get(key)
        if (!pending) {
          pending = this.service.request<Uint8Array>('thumbnail', project.root, path, preview).then((bytes) => {
            if (token === this.token) {
              this.cache.set(key, bytes)
              this.cacheBytes += bytes.byteLength
              while (this.cache.size > 128 || this.cacheBytes > 8 * 1024 * 1024) {
                const oldest = this.cache.keys().next().value!
                this.cacheBytes -= this.cache.get(oldest)!.byteLength
                this.cache.delete(oldest)
              }
            }
            return bytes
          }).finally(() => this.pending.delete(key))
          this.pending.set(key, pending)
        }
        bytes = await pending
        if (token !== this.token || request.signal.aborted)
          return new Response(null, { status: 410 })
      }
      else {
        this.cache.delete(key)
        this.cache.set(key, bytes)
      }
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
    }
    const mime = MIME[extname(path).toLowerCase()]
    if (!mime)
      return new Response(null, { status: 415 })
    const headers = new Headers({ 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Security-Policy': 'default-src \'none\'', 'X-Content-Type-Options': 'nosniff' })
    let start = 0
    let end = metadata.size - 1
    const range = request.headers.get('range')
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2]))
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${metadata.size}` } })
      start = match[1] ? Number(match[1]) : Math.max(0, metadata.size - Number(match[2]))
      end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= metadata.size)
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${metadata.size}` } })
      headers.set('Content-Range', `bytes ${start}-${end}/${metadata.size}`)
    }
    headers.set('Content-Length', String(Math.max(0, end - start + 1)))
    if (request.method === 'HEAD' || metadata.size === 0)
      return new Response(null, { headers, status: range ? 206 : 200 })
    const stream = createReadStream(canonical, { start, end })
    this.streams.add(stream)
    const abort = (): void => {
      stream.destroy()
    }
    request.signal.addEventListener('abort', abort, { once: true })
    stream.on('close', () => {
      this.streams.delete(stream)
      request.signal.removeEventListener('abort', abort)
    })
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { headers, status: range ? 206 : 200 })
  }
}
