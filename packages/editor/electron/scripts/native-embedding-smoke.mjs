import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { copyDemoFixture } from './demo-fixture.mjs'
import { captureNativeWindow } from './native-window-artifact.mjs'
import { closeTestEditor, editorTestApp, firstTestWindow } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editor = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editor, 'package.json'))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'qua-native-embedding-')))
const fixture = join(temporary, 'demo')
const artifacts = resolve(root, '.codex-tmp/editor-native-embedding')
const path = 'src/game/scenes/prologue-arrival.qs'
await mkdir(artifacts, { recursive: true })
const beforeShader = '正在准备转场。'
const afterShader = '转场已完成。'
const shader = {
  glsl: 'vec4 transition(vec2 uv) { if (progress == 0.0) return sampleFrom(uv); if (progress == 1.0) return sampleTo(uv); return vec4(1.0, progress * 0.2, 1.0, 1.0); }',
  wgsl: 'fn transition(uv: vec2<f32>) -> vec4<f32> { if (progress == 0.0) { return sampleFrom(uv); } if (progress == 1.0) { return sampleTo(uv); } return vec4(1.0, progress * 0.2, 1.0, 1.0); }',
}
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
let page
const report = { platform: process.platform, transport: 'ca-context', errors: [] }
try {
  await copyDemoFixture(root, fixture, { native: true })
  const source = await readFile(join(fixture, path), 'utf8')
  const background = /^@SetBackground\([^\n]+$/mu.exec(source)
  assert.ok(background, 'fixture needs an initial background before the shader transition')
  const transition = `@SetBackground('backgrounds/town-street-rain-anime-v3.webp', ${JSON.stringify({ transition: { type: 'shader', duration: 4000, shader } })})`
  const probe = [background[0], beforeShader, transition, afterShader].join('\n')
  const probeSource = source.slice(0, background.index) + probe + source.slice(background.index + background[0].length)
  await writeFile(join(fixture, path), probeSource)
  process.stdout.write('Native embedding: opening the editor with an isolated Demo project\n')
  app = await _electron.launch({ executablePath: require('electron'), args: [editorTestApp, '--project', fixture, `--user-data-dir=${join(temporary, 'profile')}`], env, timeout: 60000 })
  page = await firstTestWindow(app, { timeout: 60000 })
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

  const [startStep, endStep] = await page.evaluate(async ({ path, markers }) => {
    const file = await window.quaEditor.readDocument(path)
    const { previewSteps } = await window.quaEditor.analyzeDocument(path, file.text)
    const lines = file.text.split('\n')
    return markers.map(marker => previewSteps.find(step => step.endLine === lines.indexOf(marker) + 1)?.index)
  }, { path, markers: [beforeShader, afterShader] })
  assert.ok(Number.isInteger(startStep) && endStep > startStep, 'both fixture dialogue steps must resolve through the editor language service')
  assert.equal((await command({ action: 'seek', path, stepIndex: startStep })).stepIndex, startStep)
  await waitSurface(page)
  const stepping = command({ action: 'step' })
  const [step, capturedShader] = await Promise.all([stepping, captureShader(page)])
  assert.equal(step.stepIndex, endStep)
  report.shader = { completedStep: (await command({ action: 'status' })).stepIndex, ...capturedShader }
  assert.equal(report.shader.completedStep, endStep)
  assert.ok(report.shader.magentaFraction > 0.01, `the injected transition must be visible in the actual macOS window capture: ${JSON.stringify(report.shader)}`)
  process.stdout.write(`Native embedding: shader step completed, ${JSON.stringify(report.shader)}\n`)
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
  await closeTestEditor(app)
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
async function captureShader(window) {
  // These macOS window captures include the AppKit sibling that Chromium omits.
  const deadline = Date.now() + 10000
  const name = 'native-embedded-shader.png'
  let magentaFraction = 0
  let samples = 0
  while (Date.now() < deadline && magentaFraction <= 0.01) {
    await capture(window, name)
    const pixels = await require('sharp')(join(artifacts, name)).resize({ width: 240 }).removeAlpha().raw().toBuffer()
    let magenta = 0
    for (let offset = 0; offset < pixels.length; offset += 3) {
      if (pixels[offset] > 225 && pixels[offset + 1] < 100 && pixels[offset + 2] > 225)
        magenta++
    }
    samples++
    magentaFraction = Math.max(magentaFraction, magenta / (pixels.length / 3))
  }
  return { samples, magentaFraction }
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
  return window.evaluate(async (window, appRoot) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const binding = createRequire(`${appRoot}/package.json`)('./dist/native-layer.node')
    return JSON.parse(binding.inspect(window.getNativeWindowHandle()))
  }, editorTestApp)
}
