import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(
  process.env.REGISTRY_TOOLING_PACKAGE
  || resolve(root, '../../.codex-tmp/registry-tooling/package.json'),
)
const { Miniflare, convertV4MiniflareOptions, Response } = require('miniflare')

function tar(files) {
  const chunks = []
  for (const [path, content] of Object.entries(files)) {
    const data = Buffer.from(content)
    const header = Buffer.alloc(512)
    header.write(`package/${path}`, 0, 100)
    header.write('0000644\0', 100, 8)
    header.write('0000000\0', 108, 8)
    header.write('0000000\0', 116, 8)
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12)
    header.write('00000000000\0', 136, 12)
    header.fill(32, 148, 156)
    header.write('0', 156)
    header.write('ustar\0', 257, 6)
    header.write(
      `${header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0')}\0 `,
      148,
      8,
    )
    chunks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
let claim = ''
let version = '1.0.0'
let absent = false
const name = '@example/qua-workerd'
const origin = 'https://registry.example.test'
const access = 'b'.repeat(64)
const worker = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: resolve(root, 'dist/index.js'),
    compatibilityDate: '2026-09-01',
    d1Databases: ['DB'],
    ratelimits: {
      REQUEST_LIMITER: {
        namespace_id: '1001',
        simple: { limit: 120, period: 60 },
      },
    },
    bindings: {
      PUBLIC_ORIGIN: origin,
      GITHUB_CLIENT_ID: 'fixture',
      GITHUB_CLIENT_SECRET: 'fixture',
      ABUSE_SECRET: 'a'.repeat(64),
      ADMIN_GITHUB_IDS: '[]',
      REVIEW_MODE: 'system',
    },
    outboundService: async (request) => {
      assert.equal(new URL(request.url).origin, 'https://registry.npmjs.org')
      if (absent)
        return new Response('{}', { status: 404 })
      const manifest = {
        name,
        version,
        type: 'module',
        maintainers: [{ name: 'publisher' }],
        description: 'Runtime plugin fixture',
        quajs: {
          extension: {
            schemaVersion: 1,
            id: 'fixture.workerd',
            title: 'Workerd plugin',
            runtime: { entry: './index.js' },
          },
          registry: { claim },
        },
      }
      const bytes = tar({
        'package.json': JSON.stringify(manifest),
        'index.js': 'export const plugin = {}',
      })
      return request.url.endsWith('.tgz')
        ? new Response(bytes)
        : Response.json({
            ...manifest,
            dist: {
              integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
              tarball: `https://registry.npmjs.org/${name}/-/${version}.tgz`,
            },
          })
    },
  }),
)
try {
  const db = await worker.getD1Database('DB')
  const schema = await readFile(
    resolve(root, 'migrations/0001_registry.sql'),
    'utf8',
  )
  await db.batch(
    schema
      .split(';')
      .map(sql => sql.trim())
      .filter(Boolean)
      .map(sql => db.prepare(sql)),
  )
  const time = Math.floor(Date.now() / 1000)
  await db
    .prepare('INSERT INTO accounts(id, login, created_at) VALUES (?1, ?2, ?3)')
    .bind('1', 'fixture', time - 864000)
    .run()
  await db
    .prepare(
      'INSERT INTO sessions(hash, account_id, kind, expires_at) VALUES (?1, \'1\', \'editor\', ?2)',
    )
    .bind(createHash('sha256').update(access).digest('hex'), time + 3600)
    .run()
  const request = (path, body) =>
    worker.dispatchFetch(`${origin}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${access}`,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.11',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  assert.equal((await request('/health')).status, 200)
  claim = (await (await request('/api/claims', { name })).json()).claim
  const submitted = await request('/api/submissions', { name })
  const result = await submitted.json()
  assert.equal(submitted.status, 201, JSON.stringify(result))
  assert.equal(result.status, 'approved')
  assert.equal(
    (await (await request('/api/catalog')).json()).plugins[0].version,
    '1.0.0',
  )
  version = '1.1.0'
  await db.prepare('UPDATE packages SET next_sync = 0').run()
  await (await worker.getWorker()).scheduled({ cron: '*/15 * * * *' })
  assert.equal(
    (await (await request('/api/catalog')).json()).plugins[0].version,
    '1.1.0',
  )
  absent = true
  await db.prepare('UPDATE packages SET next_sync = 0').run()
  await (await worker.getWorker()).scheduled({ cron: '*/15 * * * *' })
  assert.equal(
    (await (await request('/api/catalog')).json()).plugins.length,
    0,
  )
  process.stdout.write(
    'workerd + D1: migration, authenticated claim, tarball verification, automatic review, catalog, scheduled update and withdrawal passed\n',
  )
}
finally {
  await worker.dispose()
}
