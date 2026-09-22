import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
/** Real Web/native HUD and every panel reachable from it. Start native at title. */
import { chromium } from 'playwright'
import { openDemoPage } from './web-test-helpers.mjs'

const output = resolve('demo/dist/native/hud-parity')
const exec = promisify(execFile)
const native = async (...args) => (await exec(process.execPath, ['demo/scripts/native-control.mjs', ...args], { maxBuffer: 16 * 1024 * 1024, timeout: 35000, killSignal: 'SIGKILL' })).stdout
const browser = await chromium.launch({ args: ['--no-proxy-server'], ...(process.env.QUA_PARITY_CHROMIUM
  ? { executablePath: process.env.QUA_PARITY_CHROMIUM }
  : { channel: process.env.QUA_PARITY_BROWSER || 'chrome' }) })
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })
const screens = {}
await mkdir(output, { recursive: true })
const click = id => native('clickCommand', `ui:demo-app-shell:${id}`)
async function capture(name, selectors, hover) {
  if (hover) {
    await page.locator(hover.web).first().hover()
    const command = JSON.parse(await native('commands', '--json')).find(c => c.id === hover.native)
    assert(command, `Missing hover target ${hover.native}`)
    await native('move', String((command.bounds.x + command.bounds.width / 2) / 2), String((command.bounds.y + command.bounds.height / 2) / 2))
  }
  else {
    await page.mouse.move(5, 5)
    await native('move', '5', '5')
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: resolve(output, `web-${name}.png`) })
  await native('capture', resolve(output, `native-${name}.png`))
  const web = await page.evaluate(selectors => Object.fromEntries(selectors.map(selector => [selector, [...document.querySelectorAll(selector)].map((element) => {
    const r = element.getBoundingClientRect()
    const s = getComputedStyle(element)
    return { text: element.textContent, x: r.x, y: r.y, width: r.width, height: r.height, font: s.font, padding: s.padding, gap: s.gap }
  })])), selectors)
  screens[name] = { web, native: JSON.parse(await native('commands', '--json')) }
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(screens, null, 2))
  console.warn(`Captured ${name}`)
}
async function menu() {
  await page.locator('[data-qui-id="native-quick-menu"] button').filter({ hasText: /^菜单$/ }).click()
  await click('native-game-hud-menu')
  await page.locator('[data-qui-id="native-game-menu-panel"]').waitFor()
  await native('wait', 'ui:demo-app-shell:native-game-menu-panel')
}
async function nativeReturnToGame() {
  await page.waitForTimeout(900)
  const commands = JSON.parse(await native('commands', '--json'))
  if (commands.some(c => c.id === 'ui:demo-app-shell:native-game-menu-close'))
    await click('native-game-menu-close')
  await page.waitForTimeout(900)
}
async function verifyToolbar() {
  const frame = screens.toolbar
  const bar = frame.native.find(item => item.id === 'ui:demo-app-shell:native-quick-menu')?.bounds
  const dialogue = frame.native.find(item => item.id === 'dialogue:panel')?.bounds
  const webBar = frame.web['[data-qui-id="native-quick-menu"]'][0]
  const webDialogue = frame.web['.qua-dialogue-box'][0]
  assert(bar && dialogue && webBar && webDialogue, 'Missing toolbar/dialogue geometry')
  const right = rect => rect.x + rect.width
  const alignment = {
    nativeRightEdgeError: Math.abs(right(bar) + 42 - right(dialogue)),
    webRightEdgeError: Math.abs((right(webBar) - right(webDialogue)) * 2 + 42),
    targetBoundsError: Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(bar[key] - webBar[key] * 2))),
    nativeToolbar: bar,
    nativeDialogue: dialogue,
  }
  await writeFile(resolve(output, 'toolbar-checks.json'), JSON.stringify(alignment, null, 2))
  assert(alignment.nativeRightEdgeError < 0.01 && alignment.webRightEdgeError < 1, `Toolbar must align with dialogue, not the stage edge: ${JSON.stringify(alignment)}`)
  assert(alignment.targetBoundsError <= 3, `Toolbar differs between targets: ${JSON.stringify(alignment)}`)
  for (const state of ['toolbar', 'toolbar-hover']) {
    const stateBar = screens[state].native.find(item => item.id === 'ui:demo-app-shell:native-quick-menu')?.bounds
    assert.deepEqual(stateBar, bar, `Toolbar anchor must remain stable during ${state}`)
    const controls = screens[state].native.filter(item => /^ui:demo-app-shell:native-game-hud-(?:auto|skip|log|menu)$/.test(item.id))
    assert.equal(controls.length, 4)
    assert(controls.every(({ bounds }) => bounds.x >= bar.x && right(bounds) <= right(bar)
      && bounds.y >= bar.y && bounds.y + bounds.height <= bar.y + bar.height), `Toolbar controls must stay inside the aligned panel during ${state}`)
  }
  console.warn(`PASS: toolbar right-edge alignment and control containment: ${JSON.stringify(alignment)}`)
}
async function run() {
  await openDemoPage(page, process.env.QUA_PARITY_WEB_URL || 'http://127.0.0.1:5173')
  await page.getByRole('button', { name: '从头开始', exact: true }).waitFor()
  await capture('title', ['[data-qui-id="native-main-menu-title"]', '[data-qui-id="demo-title-menu"] button'])
  await page.getByRole('button', { name: '章节选择', exact: true }).click()
  await click('native-main-menu-story-tree')
  await native('wait', 'ui:demo-app-shell:native-story-tree-close')
  await capture('chapters', ['[data-qui-id="native-story-tree-panel"]', '[data-qui-id="native-story-tree-panel"] [role="button"]', '[data-qui-id="native-story-tree-panel"] [data-qui-id^="chapter-"][data-qui-kind="Text"]', '[data-qui-id^="chapter-name-"]'])
  await page.locator('[data-qui-id="native-story-tree-close"]').click()
  await click('native-story-tree-close')
  await native('wait', 'ui:demo-app-shell:native-main-menu-start')
  await page.getByRole('button', { name: '从头开始', exact: true }).click()
  await click('native-main-menu-start')
  await page.locator('.qua-dialogue-text').waitFor()
  await native('wait', 'dialogue:text')
  await page.waitForTimeout(2000)
  await capture('toolbar', ['[data-qui-id="native-quick-menu"]', '[data-qui-id="native-quick-menu"] button', '.qua-dialogue-box'])
  await capture('toolbar-hover', ['[data-qui-id="native-quick-menu"]'], { web: '[data-qui-id="native-quick-menu"] button', native: 'ui:demo-app-shell:native-game-hud-auto' })
  await verifyToolbar()
  if (process.argv.includes('--toolbar-only'))
    return
  await page.locator('[data-qui-id="native-quick-menu"] button').filter({ hasText: /^记录$/ }).click()
  await click('native-game-hud-log')
  await native('wait', 'ui:backlog:backlog-close')
  await capture('backlog', ['[data-qui-id="backlog-panel"]', '[data-qui-id="backlog-title"]', '[data-qui-id^="backlog-entry-"][data-qui-kind="Panel"]', '[data-qui-id^="backlog-entry-"][data-qui-id$="-body"]', '[data-qui-id="backlog-scroll"]', '[data-qui-id="backlog-earliest"]'])
  await page.locator('[data-qui-id="backlog-close"]').click()
  await native('clickCommand', 'ui:backlog:backlog-close')
  await nativeReturnToGame()
  await menu()
  await capture('menu', ['[data-qui-id="native-game-menu-panel"]', '[data-qui-id="native-game-menu-title"]', '[data-qui-id="native-game-menu-actions"] button'])
  await capture('menu-hover', ['[data-qui-id="native-game-menu-panel"]'], { web: '[data-qui-id="native-game-menu-save"]', native: 'ui:demo-app-shell:native-game-menu-save' })
  await page.locator('[data-qui-id="native-game-menu-save"]').click()
  await click('native-game-menu-save')
  await capture('save', ['[data-qui-id="native-save-load-panel"]', '[data-qui-id^="slot-"][data-qui-kind="Panel"][role="button"]'])
  await page.locator('[data-qui-id="native-save-load-close"]').click()
  await click('native-save-load-close')
  await nativeReturnToGame()
  await menu()
  await page.locator('[data-qui-id="native-game-menu-load"]').click()
  await click('native-game-menu-load')
  await capture('load', ['[data-qui-id="native-save-load-panel"]', '[data-qui-id^="slot-"][data-qui-kind="Panel"][role="button"]'])
  await page.locator('[data-qui-id="native-save-load-close"]').click()
  await click('native-save-load-close')
  await nativeReturnToGame()
  await menu()
  await page.locator('[data-qui-id="native-game-menu-settings"]').click()
  await click('native-game-menu-settings')
  await native('wait', 'ui:settings:settings-close')
  await capture('settings', ['[data-qui-id="settings-panel"]', 'input,select,[role="switch"]'])
  await page.locator('[data-qui-id="settings-close"]').click()
  await native('clickCommand', 'ui:settings:settings-close')
  await nativeReturnToGame()
  await menu()
  await page.locator('[data-qui-id="native-game-menu-title-action"]').click()
  await click('native-game-menu-title-action')
  await capture('title-confirm', ['[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]', '[data-qui-id="native-title-confirm-panel"] button'])
  await page.locator('[data-qui-id="native-title-confirm-cancel"]').click()
  await click('native-title-confirm-cancel')
  await nativeReturnToGame()
  const checks = []
  for (const [screen, selector, id] of [
    ['chapters', '[data-qui-id="native-story-tree-panel"]', 'ui:demo-app-shell:native-story-tree-panel'],
    ['toolbar', '[data-qui-id="native-quick-menu"]', 'ui:demo-app-shell:native-quick-menu'],
    ['menu', '[data-qui-id="native-game-menu-panel"]', 'ui:demo-app-shell:native-game-menu-panel'],
    ['save', '[data-qui-id="native-save-load-panel"]', 'ui:demo-app-shell:native-save-load-panel'],
    ['load', '[data-qui-id="native-save-load-panel"]', 'ui:demo-app-shell:native-save-load-panel'],
    ['settings', '[data-qui-id="settings-panel"]', 'ui:settings:settings-panel'],
    ['backlog', '[data-qui-id="backlog-panel"]', 'ui:backlog:backlog-panel'],
    ['title-confirm', '[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]', 'ui:demo-app-shell:native-title-confirm-panel'],
  ]) {
    const web = screens[screen].web[selector][0]
    const command = screens[screen].native.find(command => command.id === id)
    assert(web && command, `Missing ${screen} panel`)
    const error = Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(web[key] * 2 - command.bounds[key])))
    checks.push({ screen, maxLogicalPixelError: error, passed: error <= 3 })
  }
  const expectedMenu = ['继续阅读', '保存进度', '读取存档', '设置', '返回标题']
  assert.deepEqual(screens.menu.web['[data-qui-id="native-game-menu-actions"] button'].map(item => item.text.trim().toUpperCase()), expectedMenu)
  assert.deepEqual(screens.menu.native.filter(item => /^ui:demo-app-shell:native-game-menu-(?:close|save|load|settings|title-action)$/.test(item.id)).map(item => item.text.trim().toUpperCase()), expectedMenu)
  for (const mode of ['save', 'load']) {
    assert.equal(screens[mode].web['[data-qui-id^="slot-"][data-qui-kind="Panel"][role="button"]'].length, 9)
    const cards = screens[mode].native.filter(item => /^ui:demo-app-shell:slot-\d+$/.test(item.id))
    assert.equal(cards.length, 9)
    assert.equal(new Set(cards.map(card => card.bounds.x)).size, 3)
    assert.equal(new Set(cards.map(card => card.bounds.y)).size, 3)
    assert(!screens[mode].native.some(item => item.id.startsWith('ui:demo-app-shell:native-save-mode-')))
  }
  await writeFile(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2))
  await writeFile(resolve(output, 'review.html'), `<!doctype html><meta charset="utf-8"><title>HUD Web / Native</title>
<style>body{background:#151820;color:white;font:16px sans-serif;margin:24px}section{margin:24px 0}.compare{position:relative;width:min(100%,1200px)}img{width:100%;display:block}.native{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}input{width:min(100%,1200px)}</style>
<h1>HUD 与工具栏面板：Native 左 / Web 右</h1>${Object.keys(screens).map(name => `<section><h2>${name}</h2><div class="compare"><img src="web-${name}.png"><img class="native" src="native-${name}.png"></div><input type="range" value="50" oninput="this.previousElementSibling.lastElementChild.style.clipPath='inset(0 '+(100-this.value)+'% 0 0)'"></section>`).join('')}`)
  assert(checks.every(check => check.passed), `HUD geometry mismatch: ${JSON.stringify(checks)}`)
  console.warn('PASS: Web/native panel geometry, chapter layout, menu order and nine-slot grids; hover captures saved')
}
try {
  await run()
}
finally {
  await browser.close()
}
