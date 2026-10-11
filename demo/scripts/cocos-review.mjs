import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { assertBlackBars } from './cocos-capture-checks.mjs'
import { readCocosSnapshot } from './cocos-observations.mjs'
import { openDemoPage } from './web-test-helpers.mjs'

const workspace = resolve(process.env.QUA_COCOS_WORKSPACE || 'dist/cocos/workspace')
const artifact = resolve(workspace, 'build/web-desktop')
const output = resolve(process.env.QUA_COCOS_REVIEW || 'dist/cocos/review')
await mkdir(output, { recursive: true })
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.css': 'text/css', '.bin': 'application/octet-stream', '.otf': 'font/otf', '.ttf': 'font/ttf' }
const server = createServer(async (request, response) => {
  try {
    const path = resolve(artifact, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`, request.url === '/' ? 'index.html' : '')
    if (!path.startsWith(artifact + sep))
      throw new Error('Invalid asset path')
    response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream')
    response.end(await readFile(path))
  }
  catch {
    response.writeHead(404)
    response.end()
  }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })
const logs = []
page.on('console', message => logs.push({ type: message.type(), text: message.text() }))
page.on('pageerror', error => logs.push({ type: 'pageerror', text: error.stack }))
const report = { artifact, target: 'cocos-web-desktop', status: 'running', logs, screens: {} }
try {
  await openDemoPage(page, `http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => globalThis.__QUA_COCOS__, null, { timeout: 60000 })
  await page.waitForTimeout(2500)
  report.screens.title = await inspect(page)
  await page.screenshot({ path: resolve(output, 'cocos-title.png') })
  assert(!logs.some(log => log.type === 'pageerror' || log.text.includes('QUA_COCOS_START_FAILED')), 'Creator runtime errors')
  await clickId(page, 'native-main-menu-start')
  await page.waitForTimeout(2500)
  report.screens.story = await inspect(page)
  assert.equal(report.screens.story.diagnostics.screen, 'game', 'Start button must reach the story')
  await page.screenshot({ path: resolve(output, 'cocos-story.png') })
  await clickId(page, 'native-game-hud-menu')
  await page.waitForTimeout(800)
  report.screens.menu = await inspect(page)
  assert.equal(report.screens.menu.diagnostics.screen, 'game-menu')
  await page.screenshot({ path: resolve(output, 'cocos-menu.png') })
  await clickId(page, 'native-game-menu-save')
  await page.waitForTimeout(500)
  await clickId(page, 'slot-9')
  await page.waitForTimeout(1800)
  const saved = await inspect(page)
  assert.notEqual(saved.nodes.find(n => n.name === 'slot-9-name')?.text, '空存档')
  report.screens.save = saved
  await page.screenshot({ path: resolve(output, 'cocos-save.png') })
  await clickId(page, 'slot-9')
  await page.waitForTimeout(500)
  assert.equal((await inspect(page)).diagnostics.screen, 'save-confirm')
  await clickId(page, 'native-save-confirm-accept')
  await page.waitForTimeout(1800)
  await clickId(page, 'native-save-load-close')
  await page.waitForTimeout(300)
  const before = (await inspect(page)).view.dialogue.text
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  assert.notDeepEqual((await inspect(page)).view.dialogue.text, before, 'Keyboard input advances real dialogue')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => globalThis.__QUA_COCOS__, null, { timeout: 30000 })
  await page.waitForTimeout(1200)
  await clickId(page, 'native-main-menu-load')
  await page.waitForTimeout(500)
  await clickId(page, 'slot-9')
  await page.waitForTimeout(1500)
  assert.deepEqual((await inspect(page)).view.dialogue.text, before, 'Saved story restored after restart')
  report.screens.restored = await inspect(page)
  await clickId(page, 'native-game-hud-log')
  await page.waitForTimeout(700)
  report.screens.backlog = await inspect(page)
  assert(report.screens.backlog.nodes.some(n => n.name === 'backlog-panel'))
  await page.screenshot({ path: resolve(output, 'cocos-backlog.png') })
  await clickId(page, 'backlog-close')
  await page.waitForTimeout(300)
  await clickId(page, 'native-game-hud-screenshot')
  await page.waitForTimeout(200)
  assert.equal((await inspect(page)).view.ui.visible, false)
  await page.keyboard.press('KeyH')
  await page.waitForTimeout(200)
  assert.equal((await inspect(page)).view.ui.visible, true)
  await clickId(page, 'native-game-hud-menu')
  await page.waitForTimeout(300)
  await clickId(page, 'native-game-menu-settings')
  await page.waitForTimeout(1000)
  report.screens.settings = await inspect(page)
  await page.screenshot({ path: resolve(output, 'cocos-settings.png') })
  assert(report.screens.settings.nodes.some(n => n.name === 'settings-panel'))
  const preference = s => s.nodes.find(n => n.name === 'settings-field--quajs-plugin-settings-skipMode-select')?.metadata.quiControl.selectedIndex
  const initialPreference = preference(report.screens.settings)
  await clickId(page, 'settings-field--quajs-plugin-settings-skipMode-select')
  await page.waitForTimeout(600)
  const changedPreference = preference(await inspect(page))
  assert.notEqual(changedPreference, initialPreference, 'Preview settings control changes the preference')
  await page.reload()
  await page.waitForFunction(() => globalThis.__QUA_COCOS__?.diagnostics().screen === 'title')
  await clickId(page, 'native-main-menu-config')
  await page.waitForTimeout(700)
  report.screens.settingsRestarted = await inspect(page)
  assert.equal(preference(report.screens.settingsRestarted), changedPreference, 'Preview settings persist after reload')
  await clickId(page, 'settings-close')
  await clickId(page, 'native-main-menu-load')
  await clickId(page, 'slot-9')
  await page.waitForTimeout(1000)
  await page.setViewportSize({ width: 960, height: 720 })
  await page.waitForTimeout(700)
  const letterboxed = await inspect(page)
  const beforeBar = letterboxed.view.dialogue.text
  assert(letterboxed.layout.viewportY > 0, 'Tablet view must letterbox the authored stage')
  await page.mouse.click(480, 10)
  await page.waitForTimeout(250)
  assert.deepEqual((await inspect(page)).view.dialogue.text, beforeBar, 'Black bar must not advance story')
  await page.screenshot({ path: resolve(output, 'cocos-letterboxed.png') })
  report.blackBars = await assertBlackBars(resolve(output, 'cocos-letterboxed.png'), letterboxed.layout)
  await page.setViewportSize({ width: 844, height: 390 })
  await page.waitForTimeout(700)
  const wide = await inspect(page)
  assert(wide.layout.viewportX > 0, 'Wide view must letterbox horizontally')
  report.screens.resized = wide
  await page.screenshot({ path: resolve(output, 'cocos-wide.png') })
  report.wideBlackBars = await assertBlackBars(resolve(output, 'cocos-wide.png'), wide.layout)
  assert(!logs.some(log => log.type === 'pageerror' || log.type === 'error'), 'Creator runtime errors during interactions')
  report.status = 'interaction-passed'
  report.checks = ['Creator real fonts', 'title/start input', 'keyboard dialogue advance', 'menu', 'save', 'overwrite', 'reload/load', 'backlog', 'screenshot mode', 'settings change and persistence', 'tablet and wide resize', 'black bar input rejection', 'framebuffer black bar clipping']
  process.stdout.write(`Cocos title started; screenshots and runtime diagnostics saved to ${output}\n`)
}
catch (error) {
  report.status = 'failed'
  report.error = error.stack
  await page.screenshot({ path: resolve(output, 'cocos-failed.png') })
  throw error
}
finally {
  await writeFile(resolve(output, 'cocos-review.json'), JSON.stringify(report, null, 2))
  await browser.close()
  server.closeAllConnections()
  await new Promise(r => server.close(r))
}

async function inspect(page) {
  return page.evaluate(readCocosSnapshot)
}

async function clickId(page, id) {
  await page.waitForFunction((id) => {
    const host = globalThis.__QUA_COCOS__.host.nodes
    const find = node => node.name === id || host.getNodeChildren(node).some(find)
    return find(host.getRootNode())
  }, id, { timeout: 15000 })
  const snapshot = await inspect(page)
  const node = snapshot.nodes.find(n => n.name === id)
  assert(node?.actual, `Missing rendered ${id}`)
  const container = snapshot.nodes.find(n => n.kind === 'root').actual
  const canvas = await page.locator('#GameCanvas').boundingBox()
  const bounds = node.actual
  const x = canvas.x + (bounds.x + bounds.width / 2 - container.x) / snapshot.layout.containerWidth * canvas.width
  const y = canvas.y + (container.y + container.height - bounds.y - bounds.height / 2) / snapshot.layout.containerHeight * canvas.height
  await page.mouse.click(x, y)
}
