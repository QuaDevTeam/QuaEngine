import type { Server } from 'node:net'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { createChildProxy } from '../src/network/child-proxy.js'
import { fetchHttps } from '../src/network/fetch.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const close of cleanup.splice(0)) close()
  vi.unstubAllGlobals()
})

async function listen(server: Server): Promise<number> {
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept))
  cleanup.push(() => server.close())
  return (server.address() as import('node:net').AddressInfo).port
}

function tunnel(proxyUrl: string, target: string, authenticate = true): Promise<{ status: number, text?: string }> {
  const proxy = new URL(proxyUrl)
  return new Promise((accept, reject) => {
    const req = request({ hostname: proxy.hostname, port: proxy.port, method: 'CONNECT', path: target, headers: authenticate ? { 'Proxy-Authorization': `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}` } : {} })
    req.once('error', reject)
    req.once('connect', (response, socket) => {
      socket.on('error', reject)
      if (response.statusCode !== 200) {
        socket.destroy()
        accept({ status: response.statusCode! })
        return
      }
      socket.once('data', (bytes) => {
        socket.destroy()
        accept({ status: response.statusCode!, text: bytes.toString() })
      })
      socket.write('tunnel bytes')
    })
    req.end()
  })
}

it('requires the per-process credential before resolving or opening a tunnel', async () => {
  const resolver = vi.fn(async () => 'DIRECT')
  const proxy = await createChildProxy(resolver, fetch)
  cleanup.push(proxy.close)
  expect(await tunnel(proxy.environment.HTTPS_PROXY!, '127.0.0.1:1', false)).toEqual({ status: 407 })
  expect(resolver).not.toHaveBeenCalled()
})

it('re-resolves destinations and follows only the PAC fallback sequence, including explicit DIRECT', async () => {
  const echo = createServer(socket => socket.pipe(socket))
  const port = await listen(echo)
  const resolver = vi.fn(async () => 'PROXY 127.0.0.1:1')
  const proxy = await createChildProxy(resolver, fetch)
  cleanup.push(proxy.close)
  expect(await tunnel(proxy.environment.HTTPS_PROXY!, `127.0.0.1:${port}`)).toEqual({ status: 502 })
  resolver.mockResolvedValue(`PROXY 127.0.0.1:1; DIRECT`)
  expect(await tunnel(proxy.environment.HTTPS_PROXY!, `127.0.0.1:${port}`)).toEqual({ status: 200, text: 'tunnel bytes' })
  expect(resolver).toHaveBeenCalledTimes(2)
})

it('supports SOCKS5 remote DNS for proxy-only destination names', async () => {
  const socks = createServer((socket) => {
    socket.once('data', (greeting) => {
      expect(greeting[0]).toBe(5)
      socket.write(Buffer.from([5, 0]))
      socket.once('data', (command) => {
        expect(command[3]).toBe(3)
        expect(command.subarray(5, 5 + command[4]).toString()).toBe('proxy-only.invalid')
        socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 80]))
        socket.pipe(socket)
      })
    })
  })
  const port = await listen(socks)
  const proxy = await createChildProxy(async () => `SOCKS5 127.0.0.1:${port}`, fetch)
  cleanup.push(proxy.close)
  expect(await tunnel(proxy.environment.HTTPS_PROXY!, 'proxy-only.invalid:443')).toEqual({ status: 200, text: 'tunnel bytes' })
})

it('rejects an HTTPS downgrade before sending the redirected request', async () => {
  const transport = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://insecure.invalid' } }))
  vi.stubGlobal('fetch', transport)
  await expect(fetchHttps('https://updates.invalid', AbortSignal.timeout(1000))).rejects.toThrow('requires HTTPS')
  expect(transport).toHaveBeenCalledTimes(1)
})
