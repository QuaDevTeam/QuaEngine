import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { captureNativeWindow } from './native-window-artifact.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editor = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editor, 'package.json'))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'qua-native-embedding-')))
const fixture = join(temporary, 'demo')
const artifacts = resolve(root, '.codex-tmp/editor-native-embedding')
const path = 'src/game/scenes/prologue-arrival.qs'
await mkdir(fixture)
await mkdir(artifacts, { recursive: true })
// A standalone npm fixture reuses installed workspace builds. No installation,
// policy override, live Demo source edit or alternate renderer is involved.
for (const entry of ['src', 'assets', 'public', 'scripts', 'tsconfig.json', 'qua.project.yaml', 'quack.workspace.ts', 'vite.native-jsc.config.ts'])
  await cp(join(root, 'demo', entry), join(fixture, entry), { recursive: true })
await symlink(join(root, 'demo/node_modules'), join(fixture, 'node_modules'), 'dir')
await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir')
await symlink(join(root, 'packages'), join(temporary, 'packages'), 'dir')
const manifest = JSON.parse(await readFile(join(root, 'demo/package.json'), 'utf8'))
manifest.scripts['dev:native'] = 'node native-embedding.mjs'
await writeFile(join(fixture, 'package.json'), JSON.stringify(manifest))
await writeFile(join(fixture, 'native-embedding.mjs'), 'process.env.QUA_NATIVE_EDITOR_FAST_REBUILD = "1"; await import("./scripts/native-dev.mjs");\n')
const source = await readFile(join(fixture, path), 'utf8')
const marker = '月底，海岸台要搬去市民中心。'
assert.ok(source.includes(marker))
const shader = {
  glsl: 'vec4 transition(vec2 uv) { if (progress == 0.0) return sampleFrom(uv); if (progress == 1.0) return sampleTo(uv); return vec4(1.0, progress * 0.2, 1.0, 1.0); }',
  wgsl: 'fn transition(uv: vec2<f32>) -> vec4<f32> { if (progress == 0.0) { return sampleFrom(uv); } if (progress == 1.0) { return sampleTo(uv); } return vec4(1.0, progress * 0.2, 1.0, 1.0); }',
}
await writeFile(join(fixture, path), source.replace(marker, `@SetBackground('backgrounds/town-street-rain-anime-v3.webp', ${JSON.stringify({ transition: { type: 'shader', duration: 4000, shader } })})\n${marker}`))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
let page
const report = { platform: process.platform, transport: 'ca-context', errors: [] }
try {
  app = await _electron.launch({ executablePath: require('electron'), args: [editor, '--project', fixture, `--user-data-dir=${join(temporary, 'profile')}`], env, timeout: 60000 })
  page = await app.firstWindow()
  page.on('pageerror', error => report.errors.push(error.message))
  await page.locator('#run:not([disabled])').waitFor({ timeout: 60000 })
  await page.evaluate(() => {
    window.nativeEmbeddingLog = ''
    window.quaEditor.onLog((entry) => {
      window.nativeEmbeddingLog = (window.nativeEmbeddingLog + entry.message).slice(-262144)
    })
  })
  await page.locator('#target').selectOption('native')
  await page.locator('#preview-mute').click()
  await page.locator('#run').click()
  process.stdout.write('Native embedding: building isolated JSC/QPK fixture\n')
  await until(async () => {
    const current = await state()
    if (current.phase === 'error')
      throw new Error(current.error)
    return current.phase === 'running'
  }, 900000)
  const identity = (await state()).identity.sessionId
  await page.locator('#activity-explorer').click()
  await waitSurface(page)
  await page.waitForTimeout(1200)
  process.stdout.write('Native embedding: rendered title inside IDE\n')
  await capture(page, 'native-embedded-title.png')
  report.surface = await nativeView(page)
  assert.equal(report.surface.length, 1)
  assert.ok(report.surface[0].contextId > 0)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 800))
  await page.waitForTimeout(300)
  const titleTree = await tree()
  await writeFile(join(artifacts, 'title-tree.json'), JSON.stringify(titleTree, null, 2))
  const settings = titleTree.find(node => node.attributes.id?.endsWith('native-main-menu-config'))
  assert.ok(settings)
  const details = await page.evaluate(async (nodeId) => {
    const state = await window.quaEditor.previewState()
    return window.quaEditor.inspectPreviewNode(state.identity.sessionId, nodeId)
  }, settings.nodeId)
  const box = await page.locator('#native-surface').boundingBox()
  const viewport = (await state()).nativeViewport
  await page.locator('#native-surface').click({ position: { x: (details.box.x + details.box.width / 2) / viewport.width * box.width, y: (details.box.y + details.box.height / 2) / viewport.height * box.height } })
  await until(async () => JSON.stringify(await tree()).includes('文字显示速度'))
  report.scaledPointer = true
  await capture(page, 'native-embedded-settings.png')
  await page.locator('#settings-button').click()
  await until(async () => (await nativeView(page))[0]?.hidden)
  await capture(page, 'native-modal-hidden.png')
  await page.keyboard.press('Escape')
  await until(async () => !(await nativeView(page))[0]?.hidden)
  assert.equal((await nativeView(page))[0].contextId, report.surface[0].contextId)
  report.modalOcclusion = true

  await command({ action: 'seek', path, stepIndex: 5 })
  await waitSurface(page)
  const stepping = command({ action: 'step' })
  void stepping.catch(() => {})
  // A few OS-window acceptance artifacts only, never a preview transport.
  // Chromium page.screenshot cannot capture an AppKit sibling view.
  await page.waitForTimeout(1800)
  await capture(page, 'native-embedded-shader.png')
  await stepping
  process.stdout.write('Native embedding: shader step completed\n')
  report.shader = { completedStep: (await command({ action: 'status' })).stepIndex }
  assert.equal(report.shader.completedStep, 6)
  assert.equal(await page.locator('canvas#native-surface').count(), 0)
  assert.equal(await page.evaluate(() => 'readNativeFrame' in window.quaEditor), false)
  const popup = app.waitForEvent('window', { timeout: 15000 })
  void popup.catch(() => {})
  await page.locator('#preview-window').click()
  process.stdout.write('Native embedding: popout requested\n')
  const detached = await popup
  await detached.locator('#dock').waitFor()
  await waitSurface(detached)
  assert.equal((await state()).identity.sessionId, identity)
  assert.deepEqual(await nativeView(page), [])
  assert.equal((await nativeView(detached))[0].contextId, report.surface[0].contextId)
  await capture(detached, 'native-popout.png')
  await detached.locator('#fullscreen').click()
  await until(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isSimpleFullScreen())))
  assert.equal((await nativeView(detached))[0].contextId, report.surface[0].contextId)
  await detached.keyboard.press('Escape')
  await until(() => app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().some(window => window.isSimpleFullScreen())))
  report.fullscreen = true
  await detached.locator('#dock').click()
  await until(async () => !(await state()).detached)
  await waitSurface(page)
  assert.equal((await state()).identity.sessionId, identity)
  assert.equal((await nativeView(page))[0].contextId, report.surface[0].contextId)
  report.redockedSameSession = true
  await capture(page, 'native-redocked.png')
  await page.locator('#preview-refresh').click()
  await until(async () => {
    const current = await state()
    if (current.phase === 'error' || current.renderError)
      throw new Error(current.error || current.renderError)
    return current.phase === 'running' && !current.reloading && current.identity.sessionId !== identity
  }, 900000)
  const replaced = await nativeView(page)
  assert.equal(replaced.length, 1)
  assert.notEqual(replaced[0].contextId, report.surface[0].contextId)
  report.reloadedContext = replaced[0].contextId
  await page.locator('#stop').click()
  await until(async () => (await state()).phase === 'idle')
  assert.equal(await page.locator('#native-surface').evaluate(surface => surface.hidden), true)
  assert.deepEqual(await nativeView(page), [])
  report.stopped = true
  assert.deepEqual(report.errors, [])
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
catch (error) {
  if (page) {
    await capture(page, 'failure.png').catch(() => {})
    await writeFile(join(artifacts, 'failure.json'), JSON.stringify({ error: String(error), state: await state(), logs: await page.evaluate(() => window.nativeEmbeddingLog), ...report }, null, 2)).catch(() => {})
  }
  throw error
}
finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
async function state() {
  return page.evaluate(() => window.quaEditor.previewState())
}
async function command(command) {
  return page.evaluate(async (command) => {
    const current = await window.quaEditor.previewState()
    return window.quaEditor.previewCommand(current.identity.sessionId, command)
  }, command)
}
async function until(predicate, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate())
      return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Native embedding condition timed out')
}
async function waitSurface(window) {
  await window.locator('#native-surface').waitFor({ state: 'visible', timeout: 45000 })
}
async function capture(window, name) {
  await captureNativeWindow(app, window, join(artifacts, name))
}
async function tree() {
  const result = await page.evaluate(async () => {
    const state = await window.quaEditor.previewState()
    return window.quaEditor.inspectPreview(state.identity.sessionId)
  })
  const nodes = []
  function visit(node) {
    nodes.push(node)
    node.children.forEach(visit)
  }
  visit(result.root)
  return nodes
}
async function nativeView(page) {
  const window = await app.browserWindow(page)
  return window.evaluate(async (window, editor) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const binding = createRequire(`${editor}/package.json`)('./dist/native-layer.node')
    return JSON.parse(binding.inspect(window.getNativeWindowHandle()))
  }, editor)
}
