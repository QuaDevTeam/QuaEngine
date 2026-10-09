import { afterEach, describe, expect, it } from 'vitest'
import { authRoute } from '../src/auth'
import { hash, now } from '../src/http'
import { createRegistry } from '../src/index'
import { NpmSource } from '../src/npm'
import { findPackage, review, synchronize } from '../src/registry'
import { fixture } from './fixtures'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach(close => close()))
async function setup() {
  const value = await fixture()
  cleanup.push(value.DB.close)
  return { ...value, worker: createRegistry(value.npm.network) }
}
async function submit(value: Awaited<ReturnType<typeof setup>>) {
  const { worker, request, npm, env } = value
  const claim = (await (
    await worker.fetch(request('/api/claims', { name: npm.name }), env)
  ).json()) as { claim: string }
  npm.claim = claim.claim
  const response = await worker.fetch(
    request('/api/submissions', { name: npm.name }),
    env,
  )
  expect(response.status).toBe(201)
  return (await findPackage(env, npm.name))!
}
describe('cloudflare registry policies with real SQLite and tarballs', () => {
  it('serves the catalog but fails closed before starting OAuth or accepting registrations without configured credentials', async () => {
    const { env, worker, request, DB, npm } = await setup()
    env.GITHUB_CLIENT_ID = ''
    const health = await worker.fetch(request('/health'), env)
    expect(await health.json()).toMatchObject({ registrationReady: false })
    expect((await worker.fetch(request('/api/catalog'), env)).status).toBe(200)
    expect(await (await worker.fetch(request('/'), env)).text()).not.toContain(
      'href="/login"',
    )
    for (const [path, body] of [
      ['/login', undefined],
      ['/api/device/start', {}],
      ['/api/claims', { name: npm.name }],
      ['/api/submissions', { name: npm.name }],
    ] as const) {
      const response = await worker.fetch(request(path, body), env)
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        error: 'oauth_not_configured',
      })
    }
    expect(
      (
        await DB.prepare('SELECT count(*) AS count FROM devices').first<{
          count: number
        }>()
      )?.count,
    ).toBe(0)
    expect(npm.fetches).toBe(0)
    env.GITHUB_CLIENT_ID = 'CONFIGURE_BEFORE_DEPLOY'
    expect((await worker.fetch(request('/login'), env)).status).toBe(503)
    env.GITHUB_CLIENT_ID = 'fixture'
    env.GITHUB_CLIENT_SECRET = ''
    expect(
      (await worker.fetch(request('/api/device/start', {}), env)).status,
    ).toBe(503)
  })
  it('requires an already published, explicitly declared package with publisher-owned challenge', async () => {
    const value = await setup()
    const { worker, request, npm, env } = value
    expect(
      (
        await worker.fetch(
          request('/api/claims', { name: npm.name }, false),
          env,
        )
      ).status,
    ).toBe(401)
    await worker.fetch(request('/api/claims', { name: npm.name }), env)
    expect(
      (await worker.fetch(request('/api/submissions', { name: npm.name }), env))
        .status,
    ).toBe(403)
    npm.absent = true
    expect(
      (await worker.fetch(request('/api/submissions', { name: npm.name }), env))
        .status,
    ).toBe(422)
    expect(await findPackage(env, npm.name)).toBeNull()
    npm.absent = false
    const row = await submit(value)
    expect(row.status).toBe('approved')
    expect(
      (
        await worker.fetch(
          request('/api/package?name=@example%2Fqua-plugin', undefined, false),
          env,
        )
      ).status,
    ).toBe(200)
    const previousFetches = npm.fetches
    expect(
      (await worker.fetch(request('/api/submissions', { name: npm.name }), env))
        .status,
    ).toBe(200)
    expect(npm.fetches).toBe(previousFetches)
    expect(
      (
        await env.DB.prepare('SELECT count(*) AS count FROM packages').first<{
          count: number
        }>()
      )?.count,
    ).toBe(1)
  })
  it('reviews once, automatically syncs compatible npm versions and queues capability or ownership changes', async () => {
    const value = await setup()
    const { env, npm, owner, worker, request } = value
    const row = await submit(value)
    await review(
      env,
      owner,
      npm.name,
      row.review_hash,
      'approve',
      '源码及包内容检查通过',
      false,
    )
    const packageUrl = `/api/package?name=${encodeURIComponent(npm.name)}`
    expect(
      (
        (await (await worker.fetch(request(packageUrl), env)).json()) as {
          official: boolean
        }
      ).official,
    ).toBe(false)
    npm.version = '1.1.0'
    await env.DB.prepare('UPDATE packages SET next_sync = 0').run()
    await synchronize(env, new NpmSource(npm.network))
    const refreshed = (await findPackage(env, npm.name))!
    expect(refreshed.status).toBe('approved')
    expect(JSON.parse(refreshed.approved_json!).version).toBe('1.1.0')
    npm.version = '2.0.0'
    npm.maintainer = 'new-owner'
    await env.DB.prepare('UPDATE packages SET next_sync = 0').run()
    await synchronize(env, new NpmSource(npm.network))
    expect((await findPackage(env, npm.name))?.status).toBe('pending')
    await env.DB.prepare('UPDATE packages SET next_sync = 0').run()
    await synchronize(env, new NpmSource(npm.network))
    expect((await findPackage(env, npm.name))?.status).toBe('pending')
    expect((await worker.fetch(request(packageUrl), env)).status).toBe(404)
    await expect(
      review(
        env,
        owner,
        npm.name,
        row.review_hash,
        'approve',
        '旧审查结果不能覆盖新包',
        false,
      ),
    ).rejects.toThrow('候选版本已变化')
    expect(
      (
        await env.DB.prepare('SELECT action FROM audit').all<{
          action: string
        }>()
      ).results.map(row => row.action),
    ).toContain('sync-approved')
  })
  it('official badges come from the server allowlist; withdrawals suspend listings', async () => {
    const value = await setup()
    value.npm.name = '@quajs/character'
    const row = await submit(value)
    expect(row.official).toBe(1)
    const response = await value.worker.fetch(
      value.request('/api/package?name=@quajs%2Fcharacter'),
      value.env,
    )
    expect(((await response.json()) as { official: boolean }).official).toBe(
      true,
    )
    value.npm.absent = true
    await value.DB.prepare('UPDATE packages SET next_sync = 0').run()
    await synchronize(value.env, new NpmSource(value.npm.network))
    expect((await findPackage(value.env, value.npm.name))?.status).toBe(
      'suspended',
    )
    expect(
      (
        await value.worker.fetch(
          value.request('/api/package?name=@quajs%2Fcharacter'),
          value.env,
        )
      ).status,
    ).toBe(404)
  })
  it('rejects missing entries and lifecycle hooks before insertion and applies account quotas before upstream work', async () => {
    const value = await setup()
    const source = new NpmSource(value.npm.network)
    value.npm.invalidScript = true
    await expect(source.fetch(value.npm.name)).rejects.toThrow('安装生命周期')
    value.npm.invalidScript = false
    value.npm.missingEntry = true
    await expect(source.fetch(value.npm.name)).rejects.toThrow('缺少入口')
    value.npm.missingEntry = false
    for (let i = 0; i < 15; i++) {
      await value.worker.fetch(
        value.request('/api/claims', { name: value.npm.name }),
        value.env,
      )
    }
    const previous = value.npm.fetches
    expect(
      (
        await value.worker.fetch(
          value.request('/api/submissions', { name: value.npm.name }),
          value.env,
        )
      ).status,
    ).toBe(429)
    expect(value.npm.fetches).toBe(previous)
  })
  it('binds GitHub OAuth to browser state and device authorization, and consumes editor credentials only once', async () => {
    const value = await setup()
    const network: typeof fetch = async input =>
      String(input).includes('/access_token')
        ? Response.json({ access_token: 'github-fixture-token' })
        : Response.json({
            id: 42,
            login: 'publisher',
            created_at: '2020-01-01T00:00:00Z',
          })
    const start = await authRoute(
      value.request('/api/device/start', {}, false),
      value.env,
      network,
    )
    const device = (await start!.json()) as {
      deviceCode: string
      userCode: string
    }
    const login = await authRoute(
      value.request(`/login?code=${device.userCode}`, undefined, false),
      value.env,
      network,
    )
    const state = new URL(login!.headers.get('Location')!).searchParams.get(
      'state',
    )!
    const browserCookie = login!.headers.get('Set-Cookie')!.split(';')[0]
    const callback = new Request(
      `${value.env.PUBLIC_ORIGIN}/oauth/callback?code=fixture-code&state=${state}`,
      { headers: { Cookie: browserCookie } },
    )
    const result = await authRoute(callback, value.env, network)
    expect(result?.status).toBe(302)
    const sessionCookie = result!.headers
      .getSetCookie()
      .find(cookie => cookie.startsWith('__Host-qua-session='))!
      .split(';')[0]
    const sessionToken = sessionCookie.split('=')[1]
    const approval = new Request(
      `${value.env.PUBLIC_ORIGIN}/activate?code=${device.userCode}`,
      {
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
          'Origin': value.env.PUBLIC_ORIGIN,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ csrf: await hash(`csrf:${sessionToken}`) }),
      },
    )
    expect((await authRoute(approval, value.env, network))?.status).toBe(200)
    const consumed = await authRoute(
      value.request(
        '/api/device/token',
        { deviceCode: device.deviceCode },
        false,
      ),
      value.env,
      network,
    )
    expect(((await consumed!.json()) as { token: string }).token).toMatch(
      /^[a-f0-9]{64}$/,
    )
    await expect(
      authRoute(
        value.request(
          '/api/device/token',
          { deviceCode: device.deviceCode },
          false,
        ),
        value.env,
        network,
      ),
    ).rejects.toThrow('已过期')
    await expect(authRoute(callback, value.env, network)).rejects.toThrow(
      '不匹配或已使用',
    )
    await value.DB.prepare('UPDATE sessions SET expires_at = ?1')
      .bind(now() - 1)
      .run()
  })
})
