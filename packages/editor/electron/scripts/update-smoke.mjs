import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkFixture } from './network-fixture.mjs'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editor = join(root, 'packages/editor/electron')
const require = createRequire(join(editor, 'package.json'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.QUA_EDITOR_ENABLE_UPDATES
const bytes = 'editor update fixture'
const scratch = await mkdtemp(join(tmpdir(), 'qua-update-network-'))
const fixture = await networkFixture(scratch, (request, response) => {
  let body
  if (request.url.includes('manifest.json')) {
    body = JSON.stringify({ schemaVersion: 1, product: 'quaengine-editor', channel: 'stable', version: '0.1.1', publishedAt: '2026-09-22T00:00:00Z', artifacts: [{ platform: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux', arch: process.arch, format: 'tar.gz', url: 'https://updates.invalid/editor.tar.gz', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }] })
  }
  else if (request.url.endsWith('.tar.gz')) {
    body = bytes
  }
  else {
    body = JSON.stringify({ schemaVersion: 1, product: 'quaengine-editor-components', channel: 'stable', component: request.url.includes('boilerplate') ? 'boilerplate' : 'runtime', releases: [] })
  }
  response.end(body)
})
const app = await launchEditor({ executablePath: require('electron'), args: [editor, `--ignore-certificate-errors-spki-list=${fixture.pin}`], env })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.locator('#editor-update').waitFor()
  assert.match(await page.locator('#editor-update').getAttribute('aria-label'), /检查更新/u)
  await app.evaluate(async ({ Menu, session }, proxy) => {
    await session.defaultSession.setProxy({ mode: 'fixed_servers', proxyRules: proxy })
    await session.defaultSession.closeAllConnections()
    Menu.getApplicationMenu().getMenuItemById('check-updates').click()
  }, fixture.proxy)
  await page.locator('#editor-update[data-phase="available"]').waitFor()
  await page.locator('#editor-update').click()
  await page.locator('#editor-update[data-phase="ready"]').waitFor()
  assert.equal(await page.locator('#editor-update').isDisabled(), true, 'development builds cannot replace Electron')
  const snapshot = await page.evaluate(() => window.quaEditor.editorUpdateState())
  assert.equal(snapshot.app.availableVersion, '0.1.1')
  await assert.rejects(page.evaluate(() => window.quaEditor.installEditorUpdate()), /does not provide an update installer/u)
  const output = join(root, '.codex-tmp/editor-update-smoke')
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: join(output, 'download-ready.png') })
  assert.deepEqual(errors, [])
  assert.ok(fixture.tunnels.includes('updates.invalid:443'))
  process.stdout.write('Electron update smoke passed: menu check, manifest selection, streamed verified download, IPC/UI state and development install guard.\n')
}
finally {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
  await app.close()
  fixture.close()
  await rm(scratch, { recursive: true, force: true })
}
