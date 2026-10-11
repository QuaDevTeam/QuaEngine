import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

/** Real video URLs need byte ranges; Blob/local-file playback hid this QA server bug. */
export function createCocosArtifactServer(artifact) {
  const root = resolve(artifact)
  return createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end()
        return
      }
      const url = new URL(request.url, 'http://localhost')
      const path = resolve(root, `.${decodeURIComponent(url.pathname)}`, url.pathname === '/' ? 'index.html' : '')
      if (!path.startsWith(root + sep))
        throw new Error('Asset path outside artifact')
      const bytes = await readFile(path)
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' })[extname(path)] || 'application/octet-stream')
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Accept-Ranges', 'bytes')
      let start = 0
      let end = bytes.length - 1
      if (request.headers.range && request.method !== 'HEAD') {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range)
        if (range && (range[1] || range[2])) {
          start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]))
          end = range[1] && range[2] ? Math.min(end, Number(range[2])) : end
        }
        if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) {
          response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end()
          return
        }
        response.statusCode = 206
        response.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`)
      }
      response.setHeader('Content-Length', Math.max(0, end - start + 1))
      response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1))
    }
    catch { response.writeHead(404).end() }
  })
}
