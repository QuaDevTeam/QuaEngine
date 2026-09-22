import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyDemoFixture } from './demo-fixture.mjs'
import { captureNativeWindow } from './native-window-artifact.mjs'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(resolve(editorRoot, 'package.json'))
const temporary = await mkdtemp(resolve(tmpdir(), 'qua-preview-smoke-'))
const projectRoot = await copyDemoFixture(root, resolve(temporary, 'project'), { native: process.argv.includes('--native') })
const path = 'src/game/scenes/prologue-arrival.qs'
const file = resolve(projectRoot, path)
const original = await readFile(file, 'utf8')
let written = original
const backgroundFile = resolve(projectRoot, 'assets/images/backgrounds/town-bus-rain.webp')
const originalBackground = await readFile(backgroundFile)
let writtenBackground = originalBackground
const artifacts = resolve(root, '.codex-tmp/editor-preview-tools')
await mkdir(artifacts, { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let application
let page
try {
  application = await launchEditor({ executablePath: require('electron'), args: [editorRoot, '--project', projectRoot], env, timeout: 60000 })
  page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#files[data-project-name^="Call Me Again Tomorrow"]').waitFor({ timeout: 60000 })
  for (const target of process.argv.includes('--native') ? ['native'] : ['web']) {
    await page.locator('#target').selectOption(target)
    await page.locator('#preview-mute').click()
    assert.equal((await state()).muted, true)
    await page.locator('#run').click()
    await ready(900000)
    await assertMuted(target, true)
    await page.evaluate(async ({ path }) => {
      const state = await window.quaEditor.previewState()
      await window.quaEditor.previewCommand(state.identity.sessionId, { action: 'seek', path, stepIndex: 5 })
    }, { path })
    const tree = await page.evaluate(async () => {
      const state = await window.quaEditor.previewState()
      return window.quaEditor.inspectPreview(state.identity.sessionId)
    })
    const flattened = []
    function flatten(node, depth = 0) {
      flattened.push({ node, depth })
      for (const child of node.children) flatten(child, depth + 1)
    }
    flatten(tree.root)
    assert.ok(flattened.length > 10)
    assert.ok(flattened.some(item => item.depth > 3), 'real UI hierarchy, not a flat draw list')
    const selected = flattened.find(item => target === 'web' ? item.node.attributes.class?.includes('qua-dialogue') : item.node.attributes.id === 'dialogue:text')
    assert.ok(selected)
    const details = await page.evaluate(async (nodeId) => {
      const state = await window.quaEditor.previewState()
      return window.quaEditor.inspectPreviewNode(state.identity.sessionId, nodeId)
    }, selected.node.nodeId)
    assert.ok(details.box?.width > 0)
    assert.ok(details.styles.length > 0)
    await page.locator('#tab-inspector').click()
    await page.locator('#inspector-tree [role="treeitem"]').first().waitFor({ timeout: 15000 })
    await page.locator('#inspector-live').uncheck()
    await page.locator('#inspector-filter').fill(target === 'web' ? 'qua-dialogue-text' : 'dialogue:text')
    await page.locator('#inspector-tree').press('End')
    await page.waitForFunction(() => document.querySelector('#inspector-details').textContent.includes('位置'), undefined, { timeout: 15000 })
    await page.screenshot({ path: resolve(artifacts, `${target}-inspector.png`) })
    const identity = (await state()).identity.sessionId
    const popup = application.waitForEvent('window')
    await page.locator('#preview-window').click()
    const detached = await popup
    detached.on('pageerror', error => process.stderr.write(`POPOUT: ${error.message}\n`))
    await detached.locator('#dock').waitFor()
    await detached.waitForFunction(() => typeof window.quaEditor === 'object')
    assert.equal((await state()).identity.sessionId, identity)
    assert.equal((await state()).detached, true)
    assert.equal(await detached.locator('#mute').getAttribute('aria-pressed'), 'true')
    await detached.locator('#mute').click()
    await waitState(state => state.muted === false)
    await assertMuted(target, false)
    await page.locator('#preview-mute').click()
    await waitState(state => state.muted === true)
    await detached.waitForFunction(() => document.querySelector('#mute').getAttribute('aria-pressed') === 'true')
    if (target === 'web') {
      const count = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.contentView.children.length))
      assert.ok(count.includes(1))
    }
    else {
      await detached.locator('#native-surface').waitFor({ state: 'visible', timeout: 15000 })
    }
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('preview.html')).focus())
    await detached.locator('#fullscreen').click()
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isFullScreen() || window.isSimpleFullScreen())))
        break
      await page.waitForTimeout(100)
    }
    assert.ok(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isFullScreen() || window.isSimpleFullScreen())))
    await detached.keyboard.press('Escape')
    await page.waitForTimeout(900)
    await detached.locator('#dock').click()
    await waitState(state => !state.detached)
    assert.equal((await state()).identity.sessionId, identity)
    process.stdout.write(`${target}: CDP hierarchy, box/styles, popout/fullscreen/redock preserved session\n`)

    const lines = original.split('\n')
    const analysis = await page.evaluate(async ({ path, original }) => window.quaEditor.analyzeDocument(path, original), { path, original })
    const span = analysis.previewSteps.find(step => step.index === 5)
    assert.equal(span.line, span.endLine)
    assert.match(lines[span.line - 1], /邮件下面附了六张照片/)
    const marker = ' EDITOR_LIVE_RELOAD'
    lines[span.line - 1] += marker
    await save(lines.join('\n'))
    await reloaded()
    assert.equal((await previewStatus()).stepIndex, 5)
    let rendered = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const after = await page.evaluate(async () => {
        const state = await window.quaEditor.previewState()
        return window.quaEditor.inspectPreview(state.identity.sessionId)
      })
      rendered = JSON.stringify(after).includes('EDITOR_LIVE_RELOAD')
      if (rendered)
        break
      await page.waitForTimeout(150)
    }
    assert.ok(rendered, 'new QS text reached real renderer')
    process.stdout.write(`${target}: saved dialogue reloaded at the same step\n`)
    // Replace an already-visible asset at its existing path, exercising cache invalidation.
    const sharp = require('sharp')
    writtenBackground = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#bf1ea0' } }).webp({ lossless: true }).toBuffer()
    await writeFile(backgroundFile, writtenBackground)
    await reloaded()
    await waitForBackground(target, true)
    assert.equal((await previewStatus()).stepIndex, 5)
    await writeFile(backgroundFile, originalBackground)
    writtenBackground = originalBackground
    await reloaded()
    await waitForBackground(target, false)
    process.stdout.write(`${target}: live background replacement reached rendered pixels and restored successfully\n`)
    lines.splice(span.line - 1, 1)
    await save(lines.join('\n'))
    await reloaded()
    assert.equal((await previewStatus()).stepIndex, 0)
    assert.match((await state()).message, /起点/)
    process.stdout.write(`${target}: deleted active step restarted at the beginning\n`)
    await save(`${lines.join('\n')}\n@SetBackground(\n`)
    await page.locator('#preview-error-overlay').waitFor({ timeout: 45000 })
    assert.ok((await page.locator('#preview-error-message').textContent()).length > 8)
    await page.screenshot({ path: resolve(artifacts, `${target}-error.png`) })
    await save(original)
    await reloaded()
    assert.equal(await page.locator('#preview-error-overlay').isVisible(), false)
    const runtimeLines = original.split('\n')
    const first = analysis.previewSteps.find(step => step.index === 0)
    // eslint-disable-next-line no-template-curly-in-string -- Compiled as QuaScript in the game runtime.
    runtimeLines[first.line - 1] += ' ${(() => { throw new Error("EDITOR_RUNTIME_FAILURE") })()}'
    const runtimeSource = runtimeLines.join('\n')
    const runtimeAnalysis = await page.evaluate(async ({ path, source }) => window.quaEditor.analyzeDocument(path, source), { path, source: runtimeSource })
    assert.deepEqual(runtimeAnalysis.diagnostics.filter(diagnostic => diagnostic.severity === 'error'), [], 'runtime failure fixture must pass static compilation')
    await save(runtimeSource)
    await page.locator('#preview-error-overlay').waitFor({ timeout: 900000 })
    assert.match(await page.locator('#preview-error-message').textContent(), /EDITOR_RUNTIME_FAILURE/)
    await save(original)
    await reloaded()
    assert.equal(await page.locator('#preview-error-overlay').isVisible(), false)
    await page.locator('#preview-refresh').click()
    await reloaded()
    await assertMuted(target, true)
    process.stdout.write(`${target}: compile/runtime error overlays, save recovery, mute persistence and manual refresh passed\n`)
    const stoppingPopup = application.waitForEvent('window')
    await page.locator('#preview-window').click()
    const stopWindow = await stoppingPopup
    await stopWindow.locator('#dock').waitFor()
    await page.locator('#stop').click()
    await waitState(state => state.phase === 'idle')
    await page.evaluate(() => window.quaEditor.stopPreview())
    await stopWindow.locator('#dock').click()
    await waitState(state => !state.detached)
    if (target === 'web') {
      await page.locator('#run').click()
      await ready(900000)
      await page.evaluate(async () => {
        const reloading = window.quaEditor.reloadPreview()
        await window.quaEditor.stopPreview()
        await reloading
      })
      assert.equal((await state()).phase, 'idle')
      await page.locator('#run').click()
      await ready(900000)
      await application.evaluate(({ webContents }) => {
        webContents.getAllWebContents().find(contents => /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(contents.getURL())).close()
      })
      await page.evaluate(() => window.quaEditor.stopPreview())
      assert.equal((await state()).phase, 'idle')
    }
    process.stdout.write(`${target}: detached stop, repeated stop and reload teardown passed\n`)
  }
  assert.deepEqual(errors, [])
}
catch (error) {
  await page?.screenshot({ path: resolve(artifacts, 'failure.png') }).catch(() => {})
  if (page)
    await writeFile(resolve(artifacts, 'failure.json'), JSON.stringify({ error: String(error), state: await state(), details: await page.locator('#inspector-details').textContent(), logs: await page.locator('#logs').textContent() }, null, 2)).catch(() => {})
  throw error
}
finally {
  await application?.evaluate(({ dialog }) => {
    dialog.showErrorBox = (title, message) => process.stderr.write(`${title}: ${message}\n`)
  }).catch(() => {})
  if ((await readFile(backgroundFile)).equals(writtenBackground))
    await writeFile(backgroundFile, originalBackground)
  else process.stderr.write('Background changed outside this smoke; leaving it intact.\n')
  if (await readFile(file, 'utf8') === written)
    await writeFile(file, original)
  else process.stderr.write('Source changed outside this smoke; leaving it intact.\n')
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
async function state() {
  return page.evaluate(() => window.quaEditor.previewState())
}
async function previewStatus() {
  return page.evaluate(async () => {
    const state = await window.quaEditor.previewState()
    return window.quaEditor.previewCommand(state.identity.sessionId, { action: 'status' })
  })
}
async function ready(timeout = 120000) {
  await waitState(state => state.phase === 'running' && !state.reloading, timeout)
  const current = await state()
  assert.equal(current.renderError, undefined)
}
async function save(text) {
  await page.evaluate(async ({ path, text }) => {
    const doc = await window.quaEditor.readDocument(path)
    await window.quaEditor.saveDocument({ ...doc, text })
  }, { path, text })
  written = text
}
async function reloaded() {
  await waitState(state => state.reloading, 15000)
  await ready(900000)
}

async function waitState(predicate, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const current = await state()
    if (current.phase === 'error')
      throw new Error(`${current.error}\n${await page.locator('#logs').textContent()}`)
    if (predicate(current))
      return current
    await page.waitForTimeout(80)
  }
  throw new Error(`Preview wait timed out: ${JSON.stringify(await state())}`)
}

async function assertMuted(target, muted) {
  assert.equal((await state()).muted, muted)
  if (target === 'web') {
    assert.equal(await application.evaluate(({ webContents }) => webContents.getAllWebContents().find(contents => /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(contents.getURL())).isAudioMuted()), muted)
  }
}

async function waitForBackground(target, replacement) {
  let color
  if (target === 'native') {
    // Reload/seek waits for native resource preparation. Inspect one compositor
    // artifact after settling; never add a screenshot or readback polling loop.
    await page.waitForTimeout(1500)
    const path = resolve(artifacts, `native-background-${replacement ? 'replaced' : 'restored'}.png`)
    await captureNativeWindow(application, page, path)
    const box = await page.locator('#native-surface').boundingBox()
    const viewport = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    const sharp = require('sharp')
    const metadata = await sharp(path).metadata()
    const scale = metadata.width / viewport.width
    const pixel = await sharp(path).extract({ left: Math.floor((box.x + box.width / 2) * scale), top: Math.floor((box.y + box.height / 3) * scale), width: 1, height: 1 }).removeAlpha().raw().toBuffer()
    color = [...pixel]
    const matches = color.every((value, index) => Math.abs(value - [191, 30, 160][index]) <= 5)
    assert.equal(matches, replacement, `Native OS surface background: ${color}`)
    assert.ok(color.some(value => value > 10))
    return
  }
  for (let attempt = 0; attempt < 80; attempt++) {
    color = await application.evaluate(async ({ webContents }) => {
      const contents = webContents.getAllWebContents().find(contents => /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(contents.getURL()))
      const screenshot = await contents.capturePage()
      const size = screenshot.getSize()
      const pixel = screenshot.crop({ x: Math.floor(size.width / 2), y: Math.floor(size.height / 3), width: 1, height: 1 }).toBitmap()
      return [pixel[2], pixel[1], pixel[0]]
    })
    const matches = color.every((value, index) => Math.abs(value - [191, 30, 160][index]) <= 5)
    if (matches === replacement && color.some(value => value > 10))
      return
    await page.waitForTimeout(150)
  }
  assert.fail(`Background replacement=${replacement} did not reach pixels: ${color}`)
}
