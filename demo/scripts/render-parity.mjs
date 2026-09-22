/**
 * Real manuscript/input path: unlit sprite → rain lighting → long transcript
 * → save/overwrite/load → restored lighting. Run HUD parity first or start at title.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { openDemoPage } from './web-test-helpers.mjs'

const output = resolve('demo/dist/native/story-parity')
await mkdir(output, { recursive: true })
const ws = new WebSocket(`ws://${process.env.QUA_NATIVE_RENDERER_CONTROL || '127.0.0.1:4789'}/devtools/page/qua-native`)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
let seq = 0
const pending = new Map()
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  const p = pending.get(m.id)
  if (p) {
    pending.delete(m.id)
    clearTimeout(p.timer)
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
  }
})
function native(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${method} timed out`))
    }, 30000)
    pending.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ id, method, params, sessionId: 'qua-native-session' }))
  })
}
const commands = async () => (await native('Qua.listCommands')).commands
async function click(x, y) {
  await native('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  await new Promise(r => setTimeout(r, 60))
  await native('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await new Promise(r => setTimeout(r, 60))
  await native('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
async function clickId(id) {
  const c = (await commands()).find(c => c.id === id)
  assert(c, `Missing ${id}`)
  await click((c.bounds.x + c.bounds.width / 2) / 2, (c.bounds.y + c.bounds.height / 2) / 2)
}
// The graph can contain a panel before its enter transition is hit-testable.
async function wait(id) {
  await native('Qua.waitForCommand', { id, timeoutMs: 25000 })
  await new Promise(r => setTimeout(r, 400))
}
const shell = id => `ui:demo-app-shell:native-${id}`
const browser = await chromium.launch({ args: ['--no-proxy-server'], ...(process.env.QUA_PARITY_CHROMIUM ? { executablePath: process.env.QUA_PARITY_CHROMIUM } : { channel: 'chrome' }) })
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })
const report = { screens: {}, reached: [] }
async function capture(name) {
  await page.mouse.move(5, 5)
  await native('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: resolve(output, `web-${name}.png`) })
  const { data } = await native('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(output, `native-${name}.png`), Buffer.from(data, 'base64'))
  const web = await page.evaluate(() => [...document.querySelectorAll('.qua-dialogue-text,.qua-character,[data-qui-id^="backlog-entry-"][data-qui-id$="-body"],[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"],[data-qui-id^="slot-"][data-qui-kind="Panel"][role="button"]')].map((e) => {
    const r = e.getBoundingClientRect()
    return { class: e.className, text: e.textContent, bounds: { x: r.x * 2, y: r.y * 2, width: r.width * 2, height: r.height * 2 } }
  }))
  report.screens[name] = { web, native: await commands() }
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(report, null, 2))
  console.warn(`Captured ${name}`)
}
async function reach(text) {
  const step = async (target) => {
    const trace = []
    const read = async () => target === 'web' ? await page.locator('.qua-dialogue-text').textContent() : (await commands()).find(c => c.id === 'dialogue:text')?.text || ''
    for (let i = 0; i < 240; i++) {
      let current = await read()
      if (trace.at(-1) !== current)
        trace.push(current)
      for (let poll = 0; current && text.startsWith(current) && poll < 100; poll++) {
        if (current === text)
          return
        await page.waitForTimeout(100)
        current = await read()
      }
      if (target === 'web')
        await page.keyboard.press('Space')
      else
        await click(100, 200)
      await page.waitForTimeout(350)
    }
    await writeFile(resolve(output, `${target}-trace.json`), JSON.stringify(trace, null, 2))
    throw new Error(`${target} failed to reach ${text}`)
  }
  await Promise.all([step('web'), step('native')])
  await page.waitForTimeout(2500)
  const nativeText = (await commands()).find(c => c.id === 'dialogue:text')?.text
  assert.equal(nativeText, text)
  assert.equal(await page.locator('.qua-dialogue-text').textContent(), text)
  report.reached.push(text)
}
async function menu() {
  await page.waitForTimeout(700)
  await page.locator('[data-qui-id="native-quick-menu"] button').filter({ hasText: /^菜单$/ }).click()
  await clickId(shell('game-hud-menu'))
  await wait(shell('game-menu-save'))
}
try {
  await openDemoPage(page, process.env.QUA_PARITY_WEB_URL || 'http://127.0.0.1:5173')
  await page.getByRole('button', { name: '从头开始', exact: true }).click()
  if ((await commands()).some(c => c.id === shell('main-menu-start')))
    await clickId(shell('main-menu-start'))
  await wait('dialogue:text')
  await page.locator('.qua-dialogue-text').waitFor()
  await reach('神代小姐？')
  await capture('unlit-character')
  const street = '商店街的遮雨棚把雨声压低了。烤鱼的味道从一家小店的门帘后面飘出来。'
  await reach(street)
  await capture('rain-lighting')
  await page.locator('[data-qui-id="native-quick-menu"] button').filter({ hasText: /^记录$/ }).click()
  await clickId(shell('game-hud-log'))
  await wait('ui:backlog:backlog-close')
  await capture('backlog-latest')
  await page.getByRole('button', { name: '最早记录', exact: true }).click()
  await clickId('ui:backlog:backlog-earliest')
  await capture('backlog-earliest')
  assert((report.screens['backlog-earliest'].native.find(c => c.id === 'ui:backlog:backlog-entry-0-body')?.bounds.y || 9999) < 300, 'Earliest transcript navigation failed')
  await page.getByRole('button', { name: '最近记录', exact: true }).click()
  await clickId('ui:backlog:backlog-latest')
  await capture('backlog-latest-again')
  await page.locator('[data-qui-id="backlog-close"]').click()
  await clickId('ui:backlog:backlog-close')
  await wait(shell('game-hud-menu'))
  await menu()
  await page.locator('[data-qui-id="native-game-menu-save"]').click()
  await clickId(shell('game-menu-save'))
  await wait('ui:demo-app-shell:slot-9')
  await page.locator('[data-qui-id="slot-9"]').click()
  await clickId('ui:demo-app-shell:slot-9')
  await page.waitForTimeout(1800)
  assert.notEqual((await commands()).find(c => c.id === 'ui:demo-app-shell:slot-9-name')?.text, '空存档', 'Save must complete before testing overwrite')
  await capture('saved-rain-lighting')
  await page.locator('[data-qui-id="slot-9"]').click()
  await clickId('ui:demo-app-shell:slot-9')
  await wait(shell('save-confirm-accept'))
  await capture('overwrite-confirm')
  await page.locator('[data-qui-id="native-save-confirm-cancel"]').click()
  await clickId(shell('save-confirm-cancel'))
  await page.waitForTimeout(600)
  await page.locator('[data-qui-id="native-save-load-close"]').click()
  await clickId(shell('save-load-close'))
  await wait(shell('game-hud-menu'))
  await page.keyboard.press('Space')
  await click(100, 200)
  await page.waitForTimeout(500)
  await menu()
  await page.locator('[data-qui-id="native-game-menu-load"]').click()
  await clickId(shell('game-menu-load'))
  await wait('ui:demo-app-shell:slot-9')
  await page.locator('[data-qui-id="slot-9"]').click()
  await clickId('ui:demo-app-shell:slot-9')
  await wait('dialogue:text')
  await page.waitForTimeout(2500)
  await capture('loaded-rain-lighting')
  assert.equal((await commands()).find(c => c.id === 'dialogue:text')?.text, street)
  assert.equal(await page.locator('.qua-dialogue-text').textContent(), street)
  await writeFile(resolve(output, 'review.html'), `<!doctype html><meta charset="utf-8"><title>Story Web / Native</title><style>body{background:#152420;color:white;font:16px sans-serif;margin:24px}.pair{position:relative;max-width:1200px}img{width:100%;display:block}.native{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}input{width:min(100%,1200px)}</style><h1>Native 左 / Web 右</h1>${Object.keys(report.screens).map(name => `<h2>${name}</h2><div class="pair"><img src="web-${name}.png"><img class="native" src="native-${name}.png"></div><input type="range" value="50" oninput="this.previousElementSibling.lastElementChild.style.clipPath='inset(0 '+(100-this.value)+'% 0 0)'"></input>`).join('')}`)
  console.warn('PASS: real story lighting, transcript navigation, save/overwrite/load; screenshots require visual review')
}
finally {
  await browser.close()
  ws.close()
  setTimeout(() => process.exit(process.exitCode || 0), 500).unref()
}
