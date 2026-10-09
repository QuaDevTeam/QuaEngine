import type { Database, Env, Network, Statement } from '../src/types'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { gzipSync } from 'node:zlib'
import { hash, now, token } from '../src/http'

export function archive(files: Record<string, string>): Uint8Array {
  const chunks: Buffer[] = []
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
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8)
    chunks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
export class NpmFixture {
  name = '@example/qua-plugin'
  version = '1.0.0'
  claim = ''
  maintainer = 'publisher'
  capability = './dist/editor.js'
  absent = false
  invalidScript = false
  missingEntry = false
  fetches = 0
  get manifest() {
    return {
      name: this.name,
      version: this.version,
      type: 'module',
      description: 'Fixture plugin',
      maintainers: [{ name: this.maintainer }],
      quajs: {
        extension: {
          schemaVersion: 1,
          id: 'example.plugin',
          title: 'Example',
          runtime: { entry: './dist/runtime.js' },
          devtools: { apiVersion: 1, entry: this.capability },
        },
        registry: { claim: this.claim },
        official: true,
      },
      ...(this.invalidScript ? { scripts: { postinstall: 'malicious' } } : {}),
    }
  }

  get tarball() {
    return archive({
      'package.json': JSON.stringify(this.manifest),
      'dist/runtime.js': 'export const runtime = true',
      ...(!this.missingEntry
        ? { 'dist/editor.js': 'export const editorPlugin = {}' }
        : {}),
    })
  }

  readonly network: Network = async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    this.fetches++
    if (this.absent)
      return new Response('{}', { status: 404 })
    if (url.endsWith('.tgz'))
      return new Response(new Uint8Array(this.tarball))
    if (!url.startsWith('https://registry.npmjs.org/'))
      throw new Error(`Unexpected upstream ${url}`)
    return Response.json({
      ...this.manifest,
      dist: {
        integrity: `sha512-${createHash('sha512').update(this.tarball).digest('base64')}`,
        tarball: `https://registry.npmjs.org/${this.name}/-/${this.version}.tgz`,
      },
    })
  }
}
export function database(): Database & { close: () => void } {
  const db = new DatabaseSync(':memory:')
  db.exec(
    readFileSync(
      new URL('../migrations/0001_registry.sql', import.meta.url),
      'utf8',
    ),
  )
  const prepare = (sql: string): Statement => {
    let bindings: (string | number | null)[] = []
    return {
      bind(...values) {
        bindings = values
        return this
      },
      async first<T>() {
        return (db.prepare(sql).get(...bindings) as T) ?? null
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...bindings) as T[] }
      },
      async run() {
        const result = db.prepare(sql).run(...bindings)
        return { meta: { changes: Number(result.changes) } }
      },
    }
  }
  return {
    prepare,
    async batch(statements) {
      db.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        db.exec('COMMIT')
        return results
      }
      catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => db.close(),
  }
}
export async function fixture() {
  const DB = database()
  const env: Env = {
    DB,
    PUBLIC_ORIGIN: 'https://registry.example.test',
    GITHUB_CLIENT_ID: 'fixture',
    GITHUB_CLIENT_SECRET: 'fixture-secret',
    ABUSE_SECRET: 'a'.repeat(64),
    ADMIN_GITHUB_IDS: '["1"]',
  }
  const owner = {
    id: '1',
    login: 'owner',
    created_at: now() - 86400 * 100,
    blocked: 0,
  }
  await DB.prepare(
    'INSERT INTO accounts(id, login, created_at) VALUES (?1, ?2, ?3)',
  )
    .bind(owner.id, owner.login, owner.created_at)
    .run()
  const access = token()
  await DB.prepare(
    'INSERT INTO sessions(hash, account_id, kind, expires_at) VALUES (?1, \'1\', \'editor\', ?2)',
  )
    .bind(await hash(access), now() + 3600)
    .run()
  const npm = new NpmFixture()
  const request = (path: string, body?: unknown, authenticated = true) =>
    new Request(`${env.PUBLIC_ORIGIN}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.10',
        ...(authenticated ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { env, DB, npm, request, owner, access }
}
