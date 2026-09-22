import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogEntries } from '../src/plugins/registry'
import { RegistryService, serviceOrigin } from '../src/plugins/service'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
describe('registry client credential boundary', () => {
  it('keeps device secrets in main, encrypts credentials per origin, ignores remote login destinations and revokes logout', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'qua-registry-client-'))
    cleanups.push(() => rm(directory, { recursive: true, force: true }))
    let origin = 'https://registry.example.test'
    let revoked = false
    const credential = 'b'.repeat(64)
    const requests: { url: string, authorization: string | null }[] = []
    vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      requests.push({
        url: input,
        authorization: headers.get('Authorization'),
      })
      if (input.endsWith('/api/device/start')) {
        return Response.json({
          deviceCode: 'a'.repeat(64),
          userCode: 'ABCDE12345',
          verificationUrl: 'https://evil.test',
        })
      }
      if (input.endsWith('/api/device/token')) {
        return Response.json({
          token: credential,
          account: { id: '1', login: 'publisher' },
        })
      }
      if (input.endsWith('/api/me'))
        return Response.json({ id: '1', login: 'publisher' })
      if (input.endsWith('/api/logout')) {
        revoked = true
        return Response.json({ ok: true })
      }
      throw new Error('Unexpected request')
    })
    // Reversible XOR is a fixture only: production injects Electron safeStorage.
    const transform = (data: Buffer) =>
      Buffer.from(data.map(byte => byte ^ 0x55))
    const service = new RegistryService(directory, async () => origin, {
      available: () => true,
      encrypt: text => transform(Buffer.from(text)),
      decrypt: bytes => transform(bytes).toString(),
    })
    const login = await service.start()
    expect(login).toEqual({
      userCode: 'ABCDE12345',
      expiresIn: 600,
      url: `${origin}/activate?code=ABCDE12345`,
    })
    expect(await service.poll()).toEqual({ id: '1', login: 'publisher' })
    const file = (await readdir(join(directory, 'registry-auth')))[0]
    expect(
      (await readFile(join(directory, 'registry-auth', file))).includes(
        Buffer.from(credential),
      ),
    ).toBe(false)
    expect(await service.account()).toEqual({ id: '1', login: 'publisher' })
    expect(requests.at(-1)?.authorization).toBe(`Bearer ${credential}`)
    origin = 'https://another.example.test'
    const count = requests.length
    expect(await service.account()).toBeUndefined()
    expect(requests).toHaveLength(count)
    origin = 'https://registry.example.test'
    await service.logout()
    expect(revoked).toBe(true)
    expect(await readdir(join(directory, 'registry-auth'))).toEqual([])
    const unavailable = new RegistryService(directory, async () => origin, {
      available: () => false,
      encrypt: () => {
        throw new Error('Must not encrypt')
      },
      decrypt: () => '',
    })
    await expect(unavailable.start()).rejects.toThrow('安全凭据存储不可用')
  })
  it('rejects unsafe service roots and self-awarded official badges', () => {
    for (const url of [
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com/?token=secret',
    ])
      expect(() => serviceOrigin(url)).toThrow()
    const catalog = {
      schemaVersion: 1,
      registry: true,
      plugins: [{ name: '@quajs/character', reviewed: true, official: true }],
    }
    expect(catalogEntries(catalog)[0].official).toBe(false)
    expect(catalogEntries(catalog, true)[0].official).toBe(true)
  })
})
