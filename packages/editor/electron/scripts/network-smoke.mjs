import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { _electron } from 'playwright'
import { build } from 'vite'
import { networkFixture } from './network-fixture.mjs'

const directory = await mkdtemp(join(tmpdir(), 'qua-network-smoke-'))
const editor = resolve('packages/editor/electron')
const require = createRequire(join(editor, 'package.json'))
const fixture = await networkFixture(directory, (request, response) => {
  if (request.url === '/post') {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const body = gzipSync(Buffer.concat(chunks))
      response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': body.length }).end(body)
    })
  }
  else if (request.url === '/empty') {
    response.writeHead(204).end()
  }
  else if (request.url === '/redirect') {
    response.writeHead(302, { location: 'https://updates.invalid/ok' }).end()
  }
  else if (request.url === '/insecure') {
    response.writeHead(302, { location: 'http://updates.invalid/forbidden' }).end()
  }
  else if (request.url?.includes('probe')) {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ 'name': 'probe', 'dist-tags': { latest: '1.2.3' }, 'versions': { '1.2.3': { name: 'probe', version: '1.2.3' } } }))
  }
  else {
    response.writeHead(200).end('proxy-ok')
  }
})
const direct = createServer((_request, response) => response.end('direct-ok'))
await new Promise(resolve => direct.listen(0, '127.0.0.1', resolve))
let app
try {
  const entry = join(directory, 'entry.mjs')
  await writeFile(entry, `import { app } from 'electron';
import { initializeEditorNetwork, editorNetworkEnvironment } from ${JSON.stringify(join(editor, 'src/network/index.ts'))};
import { editorFetch, fetchHttps } from ${JSON.stringify(join(editor, 'src/network/fetch.ts'))};
void (async () => { await app.whenReady(); await initializeEditorNetwork();
globalThis.networkSmoke = { editorFetch, fetchHttps, environment: editorNetworkEnvironment() }; })();
`)
  await build({ configFile: false, logLevel: 'error', build: { ssr: true, target: 'node22', outDir: join(directory, 'build'), rollupOptions: { input: entry, external: id => id === 'electron' || id.startsWith('node:'), output: { entryFileNames: 'entry.mjs' } } } })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({ executablePath: require('electron'), args: [join(directory, 'build/entry.mjs'), `--user-data-dir=${join(directory, 'profile')}`, `--ignore-certificate-errors-spki-list=${fixture.pin}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], env })
  await app.evaluate(async () => {
    while (!globalThis.networkSmoke)
      await new Promise(resolve => setTimeout(resolve, 10))
  })
  // Exercise Chromium's real PAC evaluator, without changing OS proxy preferences.
  await app.evaluate(async ({ session }, proxy) => {
    const pac = `function FindProxyForURL(url, host) { if (host === "127.0.0.1") return "DIRECT"; return "PROXY ${proxy}"; }`
    await session.defaultSession.setProxy({ mode: 'pac_script', pacScript: `data:application/x-ns-proxy-autoconfig,${encodeURIComponent(pac)}` })
    await session.defaultSession.closeAllConnections()
  }, fixture.proxy)
  assert.equal(await app.evaluate(async () => (await globalThis.networkSmoke.fetchHttps('https://updates.invalid/redirect', AbortSignal.timeout(10000))).text()), 'proxy-ok')
  assert.equal(await app.evaluate(async () => (await globalThis.networkSmoke.fetchHttps('https://updates.invalid/empty', AbortSignal.timeout(10000))).status), 204)
  await assert.rejects(app.evaluate(() => globalThis.networkSmoke.fetchHttps('https://updates.invalid/insecure', AbortSignal.timeout(10000))), /requires HTTPS/u)
  assert.equal(await app.evaluate(async (_electron, port) => (await globalThis.networkSmoke.editorFetch(`http://127.0.0.1:${port}`)).text(), direct.address().port), 'direct-ok')
  const childEnv = await app.evaluate(() => globalThis.networkSmoke.environment)
  const relay = new URL(childEnv.HTTP_PROXY)
  const forwarded = await new Promise((resolve, reject) => {
    const req = request({ hostname: relay.hostname, port: relay.port, method: 'POST', path: 'http://tools.invalid/post', headers: { 'Proxy-Authorization': `Basic ${Buffer.from(`${relay.username}:${relay.password}`).toString('base64')}` } }, (response) => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.once('end', () => resolve({ status: response.statusCode, encoding: response.headers['content-encoding'], body: Buffer.concat(chunks).toString() }))
    })
    req.once('error', reject)
    req.end('streamed request body')
  })
  assert.deepEqual(forwarded, { status: 200, encoding: undefined, body: 'streamed request body' })
  // The real npm CLI must tunnel through the editor relay and then the PAC proxy.
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = await promisify(execFile)(npm, ['view', 'probe', 'version', '--registry=https://tools.invalid', '--fetch-retries=0'], { env: { ...process.env, ...childEnv, NODE_EXTRA_CA_CERTS: fixture.cert }, timeout: 30000, shell: process.platform === 'win32' })
  assert.equal(result.stdout.trim(), '1.2.3')
  const workerPath = join(directory, 'utility.mjs')
  await writeFile(workerPath, `try { process.parentPort.postMessage({ text: await (await fetch('https://updates.invalid/ok')).text() }); }
catch (error) { process.parentPort.postMessage({ error: String(error) }); }
`)
  const utility = await app.evaluate(({ utilityProcess }, { path, env }) => new Promise((resolve, reject) => {
    const worker = utilityProcess.fork(path, [], { stdio: 'ignore', env: { ...process.env, ...env } })
    const timeout = setTimeout(() => {
      worker.kill()
      reject(new Error('Utility transport timed out'))
    }, 15000)
    worker.once('message', (message) => {
      clearTimeout(timeout)
      worker.kill()
      resolve(message)
    })
  }), { path: workerPath, env: { ...childEnv, NODE_EXTRA_CA_CERTS: fixture.cert } })
  assert.deepEqual(utility, { text: 'proxy-ok' })
  assert.ok(fixture.tunnels.includes('updates.invalid:443') && fixture.tunnels.includes('tools.invalid:443'))
  assert.ok(!fixture.requests.some(request => request.url === '/forbidden'))
  // An unavailable mandatory proxy must fail, never retry DIRECT.
  await app.evaluate(async ({ session }) => {
    await session.defaultSession.setProxy({ mode: 'fixed_servers', proxyRules: 'http=127.0.0.1:1;https=127.0.0.1:1', proxyBypassRules: '<-loopback>' })
    await session.defaultSession.closeAllConnections()
  })
  await assert.rejects(app.evaluate(async (_electron, port) => (await globalThis.networkSmoke.editorFetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(5000) })).text(), direct.address().port))
  await assert.rejects(promisify(execFile)(npm, ['view', 'probe', 'version', '--registry=https://tools.invalid', '--fetch-retries=0', '--fetch-timeout=5000'], { env: { ...process.env, ...childEnv, NODE_EXTRA_CA_CERTS: fixture.cert }, timeout: 15000, shell: process.platform === 'win32' }))
  process.stdout.write('System proxy smoke passed: Chromium PAC, HTTPS redirect guard, loopback bypass, npm via child relay, utility-process transport, and mandatory-proxy failure without direct fallback.\n')
}
finally {
  await app?.close().catch(() => {})
  fixture.close()
  direct.closeAllConnections()
  direct.close()
  await rm(directory, { recursive: true, force: true })
}
