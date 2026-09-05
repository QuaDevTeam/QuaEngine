/** Real Web/native HUD and every panel reachable from it. Start native at title. */
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve('demo/dist/native/hud-parity')
const exec = promisify(execFile)
const native = async (...args) => (await exec(process.execPath, ['demo/scripts/native-control.mjs', ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout
const browser = await chromium.launch({ ...(process.env.QUA_PARITY_CHROMIUM
  ? { executablePath: process.env.QUA_PARITY_CHROMIUM }
  : { channel: process.env.QUA_PARITY_BROWSER || 'chrome' }) })
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })
const screens = {}
await mkdir(output, { recursive: true })
const click = id => native('clickCommand', `ui:native-app-shell:${id}`)
async function capture(name, selectors, hover) {
  if (hover) {
    await page.locator(hover.web).first().hover()
    const command = JSON.parse(await native('commands', '--json')).find(c => c.id === hover.native)
    assert(command, `Missing hover target ${hover.native}`)
    await native('move', String((command.bounds.x + command.bounds.width / 2) / 2), String((command.bounds.y + command.bounds.height / 2) / 2))
  } else {
    await page.mouse.move(5, 5)
    await native('move', '5', '5')
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800)
  await page.screenshot({ path: resolve(output, `web-${name}.png`) })
  await native('capture', resolve(output, `native-${name}.png`))
  const web = await page.evaluate(selectors => Object.fromEntries(selectors.map(selector => [selector,
    [...document.querySelectorAll(selector)].map(element => {
      const r = element.getBoundingClientRect(); const s = getComputedStyle(element)
      return { text: element.textContent, x: r.x, y: r.y, width: r.width, height: r.height, font: s.font, padding: s.padding, gap: s.gap }
    }),
  ])), selectors)
  screens[name] = { web, native: JSON.parse(await native('commands', '--json')) }
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(screens, null, 2))
  console.log(`Captured ${name}`)
}
async function menu() {
  await page.locator('.vn-quick-menu button').filter({ hasText: /^MENU$/ }).click()
  await click('native-game-hud-menu')
  await page.locator('.qua-menu-overlay').waitFor()
  await native('wait', 'ui:native-app-shell:native-game-menu-panel')
}
async function nativeReturnToGame() {
  await page.waitForTimeout(350)
  const commands = JSON.parse(await native('commands', '--json'))
  if (commands.some(c => c.id === 'ui:native-app-shell:native-game-menu-close')) await click('native-game-menu-close')
  await page.waitForTimeout(350)
}
try {
  await page.goto(process.env.QUA_PARITY_WEB_URL || 'http://127.0.0.1:5173')
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await click('native-main-menu-start')
  await page.locator('.qua-dialogue-text').waitFor()
  await native('wait', 'dialogue:text')
  await page.waitForTimeout(2000)
  await capture('toolbar', ['.vn-quick-menu', '.vn-quick-menu button', '.qua-dialogue-box'])
  await capture('toolbar-hover', ['.vn-quick-menu'], { web: '.vn-quick-menu button', native: 'ui:native-app-shell:native-game-hud-auto' })
  await page.locator('.vn-quick-menu button').filter({ hasText: /^LOG$/ }).click()
  await click('native-game-hud-log')
  await native('wait', 'ui:backlog:backlog-close')
  await capture('backlog', ['.qua-backlog-panel', '.qua-backlog-header', '.qua-backlog-entry'])
  await page.locator('.qua-backlog-close').click()
  await native('clickCommand', 'ui:backlog:backlog-close')
  await nativeReturnToGame()
  await menu()
  await capture('menu', ['.qua-menu-overlay', '.qua-ui-panel-header', '.qua-menu-action'])
  await capture('menu-hover', ['.qua-menu-overlay'], { web: '.qua-menu-action--save', native: 'ui:native-app-shell:native-game-menu-save' })
  await page.locator('.qua-menu-action--save').click()
  await click('native-game-menu-save')
  await capture('save', ['.qua-save-load-panel', '.qua-save-load-mode-tabs', '.qua-save-slot-grid', '.qua-save-slot-button'])
  await page.locator('.qua-save-load-panel .qua-ui-panel-close').click()
  await click('native-save-load-close')
  await nativeReturnToGame()
  await menu()
  await page.locator('.qua-menu-action--load').click()
  await click('native-game-menu-load')
  await capture('load', ['.qua-save-load-panel', '.qua-save-load-mode-tabs', '.qua-save-slot-grid', '.qua-save-slot-button'])
  await page.locator('.qua-save-load-panel .qua-ui-panel-close').click()
  await click('native-save-load-close')
  await nativeReturnToGame()
  await menu()
  await page.locator('.qua-menu-action--settings').click()
  await click('native-game-menu-settings')
  await native('wait', 'ui:settings:settings-close')
  await capture('settings', ['.qua-settings-panel', '.qua-settings-field'])
  await page.locator('.vn-settings-close').click()
  await native('clickCommand', 'ui:settings:settings-close')
  await nativeReturnToGame()
  await menu()
  await page.locator('.qua-menu-action--title').click()
  await click('native-game-menu-title-action')
  await capture('title-confirm', ['.qua-confirm-overlay', '.qua-confirm-description', '.qua-confirm-action'])
  await page.locator('.qua-confirm-action--cancel').click()
  await click('native-title-confirm-cancel')
  await nativeReturnToGame()
  const checks = []
  for (const [screen, selector, id] of [
    ['toolbar', '.vn-quick-menu', 'ui:native-app-shell:native-quick-menu'],
    ['menu', '.qua-menu-overlay', 'ui:native-app-shell:native-game-menu-panel'],
    ['save', '.qua-save-load-panel', 'ui:native-app-shell:native-save-load-panel'],
    ['load', '.qua-save-load-panel', 'ui:native-app-shell:native-save-load-panel'],
    ['settings', '.qua-settings-panel', 'ui:settings:settings-panel'],
    ['backlog', '.qua-backlog-panel', 'ui:backlog:backlog-panel'],
    ['title-confirm', '.qua-confirm-overlay', 'ui:native-app-shell:native-title-confirm-panel'],
  ]) {
    const web = screens[screen].web[selector][0]
    const command = screens[screen].native.find(command => command.id === id)
    assert(web && command, `Missing ${screen} panel`)
    const error = Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(web[key] * 2 - command.bounds[key])))
    checks.push({ screen, maxLogicalPixelError: error, passed: error <= 3 })
  }
  const expectedMenu = ['CONTINUE', 'SAVE', 'LOAD', 'SETTINGS', 'TITLE']
  assert.deepEqual(screens.menu.web['.qua-menu-action'].map(item => item.text.trim().toUpperCase()), expectedMenu)
  assert.deepEqual(screens.menu.native.filter(item => /^ui:native-app-shell:native-game-menu-(close|save|load|settings|title-action)$/.test(item.id)).map(item => item.text.trim().toUpperCase()), expectedMenu)
  for (const mode of ['save', 'load']) {
    assert.equal(screens[mode].web['.qua-save-slot-button'].length, 9)
    const cards = screens[mode].native.filter(item => /^ui:native-app-shell:slot-\d+$/.test(item.id))
    assert.equal(cards.length, 9)
    assert.equal(new Set(cards.map(card => card.bounds.x)).size, 3)
    assert.equal(new Set(cards.map(card => card.bounds.y)).size, 3)
    assert(screens[mode].native.some(item => item.id === 'ui:native-app-shell:native-save-mode-save'))
    assert(screens[mode].native.some(item => item.id === 'ui:native-app-shell:native-save-mode-load'))
  }
  await writeFile(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2))
  await writeFile(resolve(output, 'review.html'), `<!doctype html><meta charset="utf-8"><title>HUD Web / Native</title>
<style>body{background:#151820;color:white;font:16px sans-serif;margin:24px}section{margin:24px 0}.compare{position:relative;width:min(100%,1200px)}img{width:100%;display:block}.native{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}input{width:min(100%,1200px)}</style>
<h1>HUD 与工具栏面板：Native 左 / Web 右</h1>${Object.keys(screens).map(name => `<section><h2>${name}</h2><div class="compare"><img src="web-${name}.png"><img class="native" src="native-${name}.png"></div><input type="range" value="50" oninput="this.previousElementSibling.lastElementChild.style.clipPath='inset(0 '+(100-this.value)+'% 0 0)'"></section>`).join('')}`)
  assert(checks.every(check => check.passed), `HUD geometry mismatch: ${JSON.stringify(checks)}`)
  console.log('PASS: seven panel bounds, menu order and nine-slot grids; hover captures saved')
} finally { await browser.close() }
