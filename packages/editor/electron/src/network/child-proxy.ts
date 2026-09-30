import type { IncomingHttpHeaders } from 'node:http'
import type { Socket } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect } from 'node:net'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { getCACertificates } from 'node:tls'
import { SocksClient } from 'socks'

type Resolver = (url: string) => Promise<string>

function headersWithoutHopByHop(headers: IncomingHttpHeaders): Record<string, string> {
  const excluded = new Set(['connection', 'proxy-connection', 'proxy-authorization', 'proxy-authenticate', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', ...(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim())])
  return Object.fromEntries(Object.entries(headers).filter(([key, value]) => value !== undefined && !excluded.has(key.toLowerCase())).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value!]))
}

/** An authenticated loopback adapter for npm/pnpm/Cargo, which cannot read OS PAC. */
export async function createChildProxy(resolveProxy: Resolver, fetchRequest: typeof fetch): Promise<{ environment: NodeJS.ProcessEnv, close: () => void }> {
  const credential = `qua:${randomBytes(32).toString('hex')}`
  const expected = Buffer.from(`Basic ${Buffer.from(credential).toString('base64')}`)
  const authorized = (value = ''): boolean => {
    const actual = Buffer.from(value)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  const sockets = new Set<Socket>()
  const server = createServer(async (request, response) => {
    if (!authorized(request.headers['proxy-authorization'])) {
      response.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="QuaEngine"' }).end()
      return
    }
    const abort = new AbortController()
    response.on('close', () => abort.abort())
    try {
      const target = new URL(request.url!)
      if (target.protocol !== 'http:' || target.username || target.password)
        throw new Error('Invalid proxy target.')
      const requestHeaders = headersWithoutHopByHop(request.headers)
      delete requestHeaders.host
      delete requestHeaders['content-length']
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
      const upstream = await fetchRequest(target.href, {
        method: request.method,
        headers: requestHeaders,
        body: hasBody ? Readable.toWeb(request) as ReadableStream<Uint8Array> : undefined,
        duplex: 'half',
        redirect: 'follow',
        signal: abort.signal,
      } as RequestInit)
      const responseHeaders = headersWithoutHopByHop(Object.fromEntries(upstream.headers))
      // Chromium fetch already decoded the body; do not tell tools to decode it twice.
      delete responseHeaders['content-encoding']
      delete responseHeaders['content-length']
      response.writeHead(upstream.status, responseHeaders)
      if (upstream.body)
        await pipeline(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream), response)
      else response.end()
    }
    catch {
      if (!response.headersSent)
        response.writeHead(502)
      response.end()
    }
  })
  server.on('connect', (request, socket, head) => {
    void (async () => {
      let upstream: Socket | undefined
      try {
        if (!authorized(request.headers['proxy-authorization'])) {
          socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n')
          return
        }
        const target = new URL(`https://${request.url}`)
        if (target.username || target.password || target.pathname !== '/' || target.search || target.hash)
          throw new Error('Invalid tunnel target.')
        upstream = await connectTarget(target, await resolveProxy(target.href))
        if (socket.destroyed) {
          upstream.destroy()
          return
        }
        sockets.add(upstream)
        upstream.on('close', () => sockets.delete(upstream!))
        socket.on('close', () => upstream?.destroy())
        upstream.on('close', () => socket.destroy())
        upstream.on('error', () => socket.destroy())
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length)
          upstream.write(head)
        socket.pipe(upstream).pipe(socket)
      }
      catch {
        upstream?.destroy()
        socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      }
    })()
  })
  server.on('connection', (socket) => {
    if (sockets.size >= 256) {
      socket.destroy()
      return
    }
    sockets.add(socket)
    socket.on('error', () => socket.destroy())
    socket.on('close', () => sockets.delete(socket))
    socket.setTimeout(120_000, () => socket.destroy())
  })
  await new Promise<void>((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', accept)
  })
  const port = (server.address() as import('node:net').AddressInfo).port
  const proxy = `http://${credential}@127.0.0.1:${port}`
  const bypass = 'localhost,127.0.0.1,::1'
  return {
    environment: {
      HTTP_PROXY: proxy,
      HTTPS_PROXY: proxy,
      ALL_PROXY: proxy,
      http_proxy: proxy,
      https_proxy: proxy,
      all_proxy: proxy,
      NO_PROXY: bypass,
      no_proxy: bypass,
      npm_config_proxy: proxy,
      npm_config_https_proxy: proxy,
      npm_config_noproxy: bypass,
      CARGO_HTTP_PROXY: proxy,
      NODE_USE_ENV_PROXY: '1',
      NODE_USE_SYSTEM_CA: '1',
    },
    close() {
      server.close()
      for (const socket of sockets)
        socket.destroy()
    },
  }
}

/** Only use DIRECT when the system resolver explicitly permits it. */
async function connectTarget(target: URL, routes: string): Promise<Socket> {
  const host = target.hostname.replace(/^\[|\]$/gu, '')
  const port = Number(target.port || 443)
  for (const route of routes.split(';').map(value => value.trim())) {
    try {
      if (route === 'DIRECT') {
        return await new Promise<Socket>((accept, reject) => {
          const socket = connect({ host, port })
          socket.setTimeout(30_000, () => socket.destroy(new Error('Connection timed out.')))
          socket.once('error', reject)
          socket.once('connect', () => {
            socket.setTimeout(0)
            accept(socket)
          })
        })
      }
      const match = /^(PROXY|HTTPS|SOCKS|SOCKS4|SOCKS5)\s+(\S+)$/u.exec(route)
      if (!match)
        continue
      const proxy = new URL(`${match[1] === 'HTTPS' ? 'https' : 'http'}://${match[2]}`)
      if (proxy.username || proxy.password || proxy.pathname !== '/')
        throw new Error('Invalid system proxy address.')
      if (match[1].startsWith('SOCKS')) {
        const result = await SocksClient.createConnection({
          command: 'connect',
          timeout: 30_000,
          proxy: { host: proxy.hostname.replace(/^\[|\]$/gu, ''), port: Number(proxy.port || 1080), type: match[1] === 'SOCKS5' ? 5 : 4 },
          destination: { host, port },
        })
        return result.socket
      }
      return await new Promise<Socket>((accept, reject) => {
        const req = (proxy.protocol === 'https:' ? httpsRequest : httpRequest)(proxy, {
          method: 'CONNECT',
          path: `${target.hostname}:${port}`,
          headers: { Host: `${target.hostname}:${port}` },
          agent: false,
          ...(proxy.protocol === 'https:' ? { ca: [...getCACertificates('default'), ...getCACertificates('system')] } : {}),
        })
        req.setTimeout(30_000, () => req.destroy(new Error('Proxy connection timed out.')))
        req.once('error', reject)
        req.once('connect', (response, socket, head) => {
          if (response.statusCode !== 200) {
            socket.destroy()
            reject(new Error('System proxy rejected tunnel.'))
          }
          else {
            socket.setTimeout(0)
            if (head.length)
              socket.unshift(head)
            accept(socket)
          }
        })
        req.end()
      })
    }
    catch { /* Follow only the fallback sequence returned by Chromium/PAC. */ }
  }
  throw new Error('No system proxy route is available.')
}
