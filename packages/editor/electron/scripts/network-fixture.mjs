import { execFile } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer as httpServer } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { connect } from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'

/** Test-only TLS origin reachable at *.invalid exclusively through this proxy. */
export async function networkFixture(directory, handler) {
  const key = join(directory, 'fixture-key.pem')
  const cert = join(directory, 'fixture-cert.pem')
  await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=updates.invalid', '-addext', 'subjectAltName=DNS:updates.invalid,DNS:tools.invalid,DNS:github.com'])
  const certificate = await readFile(cert)
  const pin = createHash('sha256').update(new X509Certificate(certificate).publicKey.export({ type: 'spki', format: 'der' })).digest('base64')
  const requests = []
  const tunnels = []
  const sockets = new Set()
  const origin = httpsServer({ key: await readFile(key), cert: certificate }, (request, response) => {
    requests.push({ url: request.url, host: request.headers.host, method: request.method })
    handler(request, response)
  })
  const proxy = httpServer((request, response) => {
    if (request.url?.startsWith('http://tools.invalid/')) {
      request.url = new URL(request.url).pathname
      handler(request, response)
    }
    else {
      response.writeHead(502).end()
    }
  })
  for (const server of [origin, proxy]) {
    server.on('connection', (socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      socket.on('error', () => {})
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  }
  proxy.on('connect', (request, socket, head) => {
    tunnels.push(request.url)
    if (!['updates.invalid:443', 'tools.invalid:443', 'github.com:443'].includes(request.url)) {
      socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      return
    }
    const upstream = connect(origin.address().port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length)
        upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    sockets.add(upstream)
    upstream.on('close', () => {
      sockets.delete(upstream)
      socket.destroy()
    })
    socket.on('close', () => upstream.destroy())
    upstream.on('error', () => socket.destroy())
  })
  return {
    cert,
    pin,
    requests,
    tunnels,
    proxy: `127.0.0.1:${proxy.address().port}`,
    close() {
      for (const socket of sockets)
        socket.destroy()
      origin.close()
      proxy.close()
    },
  }
}
