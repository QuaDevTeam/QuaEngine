import { gunzipSync } from 'node:zlib'
import { inspectTar } from '@quajs/editor-core'
import { afterEach, describe, expect, it } from 'vitest'
import { createRegistry } from '../src/index'
import { NpmSource } from '../src/npm'
import { findPackage, review, synchronize } from '../src/registry'
import { automaticReview } from '../src/review'
import { archive, fixture } from './fixtures'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(close => close()))
async function setup() {
  const value = await fixture()
  cleanups.push(value.DB.close)
  return value
}
function answer(harmful = 0.01) {
  return {
    model: 'jev-fixture',
    answers: {
      spam: { type: 'noul', noul: 0.01 },
      harmful: { type: 'noul', noul: harmful },
      relevant: { type: 'noul', noul: 0.98 },
    },
    usage: { input_tokens: 100, output_tokens: 3 },
  }
}
describe('automatic review and recovery', () => {
  it('keeps deterministic checks authoritative and records/caches typed Jev probabilities and usage', async () => {
    const { env, npm } = await setup()
    env.REVIEW_MODE = 'jev'
    env.TYPESAFE_API_KEY = 'fixture-only'
    const candidate = await new NpmSource(npm.network).fetch(npm.name)
    let calls = 0
    const network: typeof fetch = async (url, init) => {
      calls++
      expect(String(url)).toBe('https://api.typesafe.ai/v1/systemone')
      const request = JSON.parse(String(init?.body))
      expect(request.questions.harmful.type).toBe('noul')
      expect(request.state.package.name).toBe(npm.name)
      expect(request.questions.spam.instructions).toContain('untrusted')
      return Response.json(answer())
    }
    const result = await automaticReview(env, candidate, undefined, network)
    expect(result).toMatchObject({
      status: 'approved',
      policy: 'jev-v1',
      model: 'jev-fixture',
      usage: { input_tokens: 100, output_tokens: 3 },
    })
    expect(await automaticReview(env, candidate, undefined, network)).toEqual(
      result,
    )
    expect(calls).toBe(1)
    expect(
      (
        await automaticReview(
          env,
          {
            ...candidate,
            scan: { ...candidate.scan, flags: ['credential-access'] },
          },
          undefined,
          network,
        )
      ).status,
    ).toBe('pending')
    expect(calls).toBe(1)
  })
  it('quarantines uncertain, malformed, unavailable and over-budget Jev results', async () => {
    const { env, npm } = await setup()
    env.REVIEW_MODE = 'jev'
    env.TYPESAFE_API_KEY = 'fixture-only'
    env.JEV_DAILY_LIMIT = '3'
    const candidate = await new NpmSource(npm.network).fetch(npm.name)
    for (const [index, data] of [
      answer(0.4),
      answer(1.1),
      { ...answer(), usage: { input_tokens: -1, output_tokens: 3 } },
    ].entries()) {
      expect(
        (
          await automaticReview(
            env,
            { ...candidate, hash: `case-${index}` },
            undefined,
            async () => Response.json(data),
          )
        ).status,
      ).toBe('pending')
    }
    let calls = 0
    const result = await automaticReview(
      env,
      { ...candidate, hash: 'budget' },
      undefined,
      async () => {
        calls++
        return Response.json(answer())
      },
    )
    expect(result.status).toBe('pending')
    expect(calls).toBe(0)
    env.TYPESAFE_API_KEY = ''
    expect(
      (await automaticReview(env, { ...candidate, hash: 'missing-key' }))
        .reason,
    ).toContain('密钥未配置')
  })
  it('retains a maintainer quarantine across syncs, then accepts a new published ownership proof without duplicate registration', async () => {
    const value = await setup()
    const { env, npm, request, DB, owner } = value
    const worker = createRegistry(npm.network)
    const claim = async () =>
      (
        (await (
          await worker.fetch(request('/api/claims', { name: npm.name }), env)
        ).json()) as { claim: string }
      ).claim
    npm.claim = await claim()
    expect(
      (await worker.fetch(request('/api/submissions', { name: npm.name }), env))
        .status,
    ).toBe(201)
    npm.maintainer = 'successor'
    npm.version = '2.0.0'
    for (let i = 0; i < 2; i++) {
      await DB.prepare('UPDATE packages SET next_sync = 0').run()
      await synchronize(env, new NpmSource(npm.network))
      expect((await findPackage(env, npm.name))?.status).toBe('pending')
    }
    npm.claim = await claim()
    npm.version = '2.0.1'
    expect(
      (await worker.fetch(request('/api/submissions', { name: npm.name }), env))
        .status,
    ).toBe(200)
    const row = (await findPackage(env, npm.name))!
    expect(row.status).toBe('approved')
    await review(
      env,
      owner,
      npm.name,
      row.review_hash,
      'suspend',
      '运营紧急暂停',
      false,
    )
    npm.version = '2.0.2'
    await DB.prepare('UPDATE packages SET next_sync = 0').run()
    await synchronize(env, new NpmSource(npm.network))
    expect((await findPackage(env, npm.name))?.status).toBe('suspended')
    npm.claim = await claim()
    expect(
      (await worker.fetch(request('/api/submissions', { name: npm.name }), env))
        .status,
    ).toBe(409)
  })
  it('quarantines actual credential and executable archive content and rejects trailing or escaping tar entries', async () => {
    const { env, npm } = await setup()
    const candidate = await new NpmSource(npm.network).fetch(npm.name)
    const scan = inspectTar(
      gunzipSync(
        archive({
          'package.json': JSON.stringify(npm.manifest),
          '.env': 'FIXTURE_SECRET=fixture',
          'payload.js': 'import { exec } from \'node:child_process\'',
        }),
      ),
    ).scan
    expect(scan.flags).toContain('credential-file')
    expect(scan.flags).toContain('dynamic-execution')
    expect((await automaticReview(env, { ...candidate, scan })).status).toBe(
      'pending',
    )
    expect(() =>
      inspectTar(gunzipSync(archive({ '../outside.js': 'fixture' }))),
    ).toThrow('不安全路径')
    const bytes = gunzipSync(archive({ 'package.json': '{}' }))
    expect(() =>
      inspectTar(
        Buffer.concat([bytes, Buffer.from('hidden trailing content')]),
      ),
    ).toThrow('额外内容')
  })
  it('applies the fast edge throttle before database or npm work', async () => {
    const { env, request, npm } = await setup()
    const keys: string[] = []
    env.REQUEST_LIMITER = {
      limit: async ({ key }) => {
        keys.push(key)
        return { success: false }
      },
    }
    const response = await createRegistry(npm.network).fetch(
      request('/api/catalog'),
      env,
    )
    expect(response.status).toBe(429)
    expect(keys[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(npm.fetches).toBe(0)
  })
  it('rejects upstream tarball redirection and changed immutable versions', async () => {
    const { npm } = await setup()
    const source = new NpmSource(npm.network)
    const previous = await source.fetch(npm.name)
    npm.claim = 'a'.repeat(64)
    await expect(source.fetch(npm.name, previous)).rejects.toThrow('相同版本')
    const malicious = new NpmSource(async (input, init) => {
      const response = await npm.network(input, init)
      const value = (await response.json()) as Record<string, any>
      value.dist.tarball = 'https://attacker.test/secret.tgz'
      return Response.json(value)
    })
    await expect(malicious.fetch(npm.name)).rejects.toThrow(
      '只接受 registry.npmjs.org',
    )
  })
})
