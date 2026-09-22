import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { copyDemoFixture } from './demo-fixture.mjs'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(resolve(editorRoot, 'package.json'))
const temporary = await mkdtemp(resolve(tmpdir(), 'qua-preview-smoke-'))
const projectRoot = await copyDemoFixture(root, resolve(temporary, 'project'), { native: process.argv.includes('--native') })
const target = process.argv.includes('--native') ? 'native' : 'web'
const artifacts = resolve(root, '.codex-tmp/editor-performance-smoke')
await mkdir(artifacts, { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let application
let page
const errors = []
async function poll(predicate, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate())
      return
    await delay(100)
  }
  throw new Error('Performance smoke condition timed out')
}
const state = async () => page?.evaluate(() => window.quaEditor.previewState())
async function capture(name) {
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive())
  const bytes = await Promise.race([
    application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64')),
    delay(5000).then(() => { throw new Error('Performance capture timed out') }),
  ])
  await writeFile(resolve(artifacts, name), Buffer.from(bytes, 'base64'))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
}

try {
  application = await launchEditor({ executablePath: require('electron'), args: [editorRoot, '--project', projectRoot], env, timeout: 60000 })
  page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#run:not([disabled])').waitFor({ timeout: 60000 })
  await application.evaluate(({ ipcMain, BrowserWindow }) => {
    // Isolate acceptance from concurrent desktop input. Keep Chromium's task
    // scheduling active; Native still uses its real offscreen GPU renderer.
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.setBackgroundThrottling(false)
    window.hide()
    const handler = ipcMain._invokeHandlers.get('editor:preview-performance')
    globalThis.performanceSmoke = { reads: 0, releases: 0, pending: 0, peakPending: 0, samples: [] }
    ipcMain.removeHandler('editor:preview-performance')
    ipcMain.handle('editor:preview-performance', async (...args) => {
      const stats = globalThis.performanceSmoke
      if (args[2]) {
        stats.reads++
        stats.pending++
        stats.peakPending = Math.max(stats.peakPending, stats.pending)
      }
      else {
        stats.releases++
      }
      try {
        const sample = await handler(...args)
        if (sample && stats.samples.length < 1000)
          stats.samples.push(sample)
        return sample
      }
      finally {
        if (args[2])
          stats.pending--
      }
    })
  })
  await page.evaluate(() => {
    globalThis.performanceClicks = []
    document.addEventListener('click', event => globalThis.performanceClicks.push({ at: Date.now(), id: event.target.closest('button')?.id, classes: event.target.closest('button')?.className, trusted: event.isTrusted }), true)
  })
  await page.locator('#tab-performance').click()
  assert.equal(await page.locator('#panel-performance').isVisible(), true)
  assert.equal(await page.locator('#check-status, #check-project, #workspace-mode, #toggle-panel').count(), 0)
  assert.equal(await page.locator('qua-workbench-shell > footer > :last-child').getAttribute('id'), 'check-indicator')
  await page.locator('#check-indicator').click()
  assert.equal(await page.locator('#panel-problems').isVisible(), true)
  await page.locator('#tab-performance').click()
  await page.locator('#target').selectOption(target)
  await page.locator('#preview-mute').click()
  await page.locator('#run').click()
  await poll(async () => {
    const current = await state()
    if (current.phase === 'error')
      throw new Error(current.error)
    return current.phase === 'running'
  }, 900000)
  const id = (await state()).identity.sessionId
  await page.evaluate(async id => window.quaEditor.previewCommand(id, { action: 'seek', path: 'src/game/scenes/prologue-arrival.qs', stepIndex: 5 }), id)
  await poll(async () => application.evaluate(() => globalThis.performanceSmoke.samples.filter(sample => sample.fps > 0 && sample.memoryBytes > 0 && sample.cpuPercent !== null).length >= 10))
  const samples = await application.evaluate(() => globalThis.performanceSmoke.samples)
  const measured = samples.filter(sample => sample.fps > 0 && sample.cpuPercent !== null)
  assert.ok(measured.length >= 10)
  assert.ok(measured.every(sample => Number.isFinite(sample.cpuPercent) && sample.cpuPercent >= 0 && sample.memoryBytes > 0))
  if (target === 'native') {
    assert.ok(measured.some(sample => sample.drawCalls > 0))
    assert.ok(measured.some(sample => sample.renderPasses > 0))
    if (process.platform === 'darwin') {
      assert.ok(measured.some(sample => sample.gpuMemoryBytes > 0), 'Metal allocation must be measured')
      assert.ok(measured.some(sample => sample.gpuPercent !== null && sample.gpuPercent >= 0 && sample.gpuPercent <= 100), 'IOAccelerator utilization must be measured')
    }
  }
  else {
    assert.ok(measured.every(sample => sample.jsHeapBytes > 0))
    assert.match(measured.at(-1).fpsSource, /动画帧回调/)
  }
  await capture(`${target}.png`)
  const visibleCharts = await page.locator('.performance-metric:visible').count()
  assert.equal(visibleCharts, target === 'native' ? 6 : 3)
  const graphInk = await page.locator('.performance-metric:visible canvas').evaluateAll(canvases => canvases.every((canvas) => {
    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let painted = 0
    for (let i = 3; i < bytes.length; i += 4) {
      if (bytes[i])
        painted++
    }
    return painted > 100
  }))
  assert.ok(graphInk)
  await page.locator('#tab-console').click()
  await delay(600)
  const reads = await application.evaluate(() => globalThis.performanceSmoke.reads)
  await delay(1200)
  assert.equal(await application.evaluate(() => globalThis.performanceSmoke.reads), reads, 'hidden panel must stop IPC sampling')
  if (target === 'web') {
    assert.equal(await application.evaluate(async ({ webContents }) => {
      const preview = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:'))
      return preview.executeJavaScript('Boolean(globalThis.__QUA_EDITOR_PERFORMANCE__)')
    }), false, 'hidden panel releases rAF probe')
  }
  await page.locator('#tab-performance').click()
  await poll(async () => (await application.evaluate(() => globalThis.performanceSmoke.reads)) >= reads + 5)
  await page.locator('.performance-pause').click()
  process.stdout.write(`${target}: hidden/resume verified; pausing\n`)
  await delay(400)
  const paused = await application.evaluate(() => globalThis.performanceSmoke.reads)
  await delay(700)
  assert.equal(await application.evaluate(() => globalThis.performanceSmoke.reads), paused)
  await page.locator('.performance-pause').click()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1050, 650))
  await delay(300)
  assert.equal(await page.locator('#panel-tabs').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  await capture(`${target}-compact.png`)
  await page.locator('#preview-refresh').click()
  await poll(async () => {
    const current = await state()
    if (current.phase === 'error')
      throw new Error(current.error)
    return current.phase === 'running' && !current.reloading
  }, 900000)
  await poll(async () => (await application.evaluate(() => globalThis.performanceSmoke.reads)) >= paused + 8)
  assert.equal(await page.locator('.performance-message').evaluate(element => element.textContent.includes('暂不可用')), false)
  await page.locator('#stop').click()
  await poll(async () => (await state()).phase === 'idle')
  await delay(600)
  const stopped = await application.evaluate(() => globalThis.performanceSmoke.reads)
  await delay(800)
  assert.equal(await application.evaluate(() => globalThis.performanceSmoke.reads), stopped)
  assert.equal(await page.evaluate(id => window.quaEditor.previewPerformance(id, true), id), undefined)
  assert.deepEqual(errors, [])
  const stats = await application.evaluate(() => globalThis.performanceSmoke)
  assert.ok(stats.peakPending <= 1, `overlapping samples: ${stats.peakPending}`)
  await writeFile(resolve(artifacts, `${target}.json`), JSON.stringify(stats, null, 2))
  process.stdout.write(`${target}: actual preview metrics, canvas charts, compact layout, status icon, hidden/pause release, refresh, stale-session rejection and stop passed; ${stats.samples.length} samples; peak pending ${stats.peakPending}\n`)
}
catch (error) {
  process.stderr.write(`${JSON.stringify(await state().catch(() => undefined))}\n`)
  process.stderr.write(`${JSON.stringify(await page?.evaluate(() => globalThis.performanceClicks).catch(() => undefined))}\n`)
  await capture(`${target}-failure.png`).catch(() => {})
  const stats = await application?.evaluate(() => globalThis.performanceSmoke).catch(() => undefined)
  await writeFile(resolve(artifacts, `${target}-failure.json`), JSON.stringify(stats ?? {}, null, 2))
  throw error
}
finally {
  await page?.evaluate(() => window.quaEditor.stopPreview()).catch(() => {})
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
