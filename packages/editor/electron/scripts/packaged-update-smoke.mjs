import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron } from 'playwright'
import { electronSigningOptions, macSigningConfiguration, verifyMacApplication } from '../../release/macos-signing.mjs'
import { networkFixture } from './network-fixture.mjs'

const archive = resolve(process.argv[2])
const metadata = JSON.parse(await readFile(join(dirname(archive), 'artifact-metadata.json'), 'utf8'))
const scratch = await mkdtemp(join(tmpdir(), 'qua packaged update '))
const profile = join(scratch, 'original profile')
await mkdir(profile)
await writeFile(join(profile, 'settings-sentinel.txt'), 'preserve original profile')
const releaseRequire = createRequire(resolve('packages/editor/release/package.json'))
const packagerRequire = createRequire(releaseRequire.resolve('@electron/packager'))
const { extractAll, createPackageWithOptions } = packagerRequire('@electron/asar')
let application
let fixture
let restartedPid
try {
  const installed = join(scratch, 'installation')
  await mkdir(installed)
  await promisify(execFile)('tar', ['-xzf', archive, '-C', installed])
  const [name] = await readdir(installed)
  const root = join(installed, name)
  const resources = join(root, process.platform === 'darwin' ? 'Contents/Resources' : 'resources')
  const signing = macSigningConfiguration(process.env, process.platform)
  if (signing)
    await verifyMacApplication(root, signing, metadata.channel)
  const executablePath = process.platform === 'darwin'
    ? join(root, 'Contents/MacOS', name.replace(/\.app$/u, ''))
    : join(root, `quaengine-editor${metadata.channel === 'beta' ? '-beta' : ''}${process.platform === 'win32' ? '.exe' : ''}`)
  // A disposable older-version fixture uses the actual Editor and installer code.
  // Only its version metadata changes; the downloaded replacement is the original archive.
  const expanded = join(scratch, 'baseline-source')
  const asar = join(resources, 'app.asar')
  extractAll(asar, expanded)
  for (const path of [join(expanded, 'package.json'), join(expanded, 'dist/release-channel.json')]) {
    const value = JSON.parse(await readFile(path, 'utf8'))
    await writeFile(path, JSON.stringify({ ...value, version: '0.0.0' }))
  }
  await rm(asar)
  await rm(`${asar}.unpacked`, { recursive: true, force: true })
  await createPackageWithOptions(expanded, asar, { unpack: '**/*.node', unpackDir: 'node_modules/{node-pty,@vscode/ripgrep,@img/*,lzma-native}' })
  await rm(expanded, { recursive: true, force: true })
  if (signing) {
    // Editing the disposable baseline invalidates its seal; sign only that fixture.
    // The downloaded production archive remains byte-for-byte unchanged.
    const { sign } = packagerRequire('@electron/osx-sign')
    await sign({ app: root, platform: 'darwin', ...electronSigningOptions(signing) })
  }
  fixture = await networkFixture(scratch, (request, response) => {
    if (request.url.endsWith('.tar.gz')) {
      response.writeHead(200, { 'Content-Length': metadata.size })
      createReadStream(archive).pipe(response)
    }
    else if (request.url.includes('manifest.json')) {
      response.end(JSON.stringify({ schemaVersion: 1, product: 'quaengine-editor', channel: metadata.channel, version: metadata.version, publishedAt: new Date().toISOString(), artifacts: [{ platform: metadata.platform, arch: metadata.arch, format: 'tar.gz', url: 'https://updates.invalid/editor.tar.gz', sha256: metadata.sha256, size: metadata.size }] }))
    }
    else {
      response.end(JSON.stringify({ schemaVersion: 1, product: 'quaengine-editor-components', channel: metadata.channel, component: request.url.includes('boilerplate') ? 'boilerplate' : 'runtime', releases: [] }))
    }
  })
  const env = { ...process.env, QUA_EDITOR_DISABLE_AUTO_UPDATE: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, `--ignore-certificate-errors-spki-list=${fixture.pin}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], env })
  const page = await application.firstWindow()
  await page.locator('#editor-update').waitFor()
  assert.equal((await page.evaluate(() => window.quaEditor.editorUpdateState())).app.currentVersion, '0.0.0')
  await application.evaluate(async ({ Menu, session }, proxy) => {
    await session.defaultSession.setProxy({ mode: 'fixed_servers', proxyRules: proxy })
    await session.defaultSession.closeAllConnections()
    Menu.getApplicationMenu().getMenuItemById('check-updates').click()
  }, fixture.proxy)
  await page.locator('#editor-update[data-phase="available"]').waitFor({ timeout: 30000 })
  await page.locator('#editor-update').click()
  await page.locator('#editor-update[data-phase="ready"]').waitFor({ timeout: 180000 })
  const output = resolve('.codex-tmp/editor-packaged-update')
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: join(output, 'verified-download.png') })
  await page.evaluate(() => window.quaEditor.installEditorUpdate())
  const statusDirectory = join(profile, 'editor-updates', metadata.channel)
  let status
  for (let attempt = 0; attempt < 180; attempt++) {
    status = await readFile(join(statusDirectory, 'install-status.txt'), 'utf8').catch(() => '')
    if (status.startsWith('installed') || status.startsWith('error:'))
      break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert.equal(status.trim(), 'installed')
  const [token, version, pid] = (await readFile(join(statusDirectory, 'startup-ready.txt'), 'utf8')).trim().split(' ')
  assert.match(token, /^[a-f0-9]{64}$/u)
  assert.equal(version, metadata.version)
  restartedPid = Number(pid)
  assert.ok(Number.isSafeInteger(restartedPid) && restartedPid > 0)
  process.kill(restartedPid, 0)
  assert.equal(await readFile(join(profile, 'settings-sentinel.txt'), 'utf8'), 'preserve original profile')
  assert.ok((await readdir(installed)).some(name => name.includes('.previous-')))
  assert.ok(fixture.tunnels.includes('updates.invalid:443'))
  if (signing)
    await verifyMacApplication(root, signing, metadata.channel)
  process.stdout.write(`Packaged update passed: proxy-only HTTPS manifest and ${metadata.size} byte archive, checksum, staging, process handoff, replacement, ${version} startup acknowledgement, retained profile and rollback backup.\n`)
}
finally {
  if (restartedPid) {
    try {
      process.kill(restartedPid, 'SIGTERM')
    }
    catch {}
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        process.kill(restartedPid, 0)
      }
      catch { break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  await application?.close().catch(() => {})
  fixture?.close()
  await rm(scratch, { recursive: true, force: true })
}
