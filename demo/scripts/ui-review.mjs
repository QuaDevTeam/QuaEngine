/** Capture the reading skin at authored and fitted stage sizes. Uses real UI intents only. */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { openDemoPage } from './web-test-helpers.mjs'

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] })
const output = new URL('../.generated/qa/ui/', import.meta.url).pathname
await mkdir(output, { recursive: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }))
  window.setReviewButton = (id, pressed) => {
    buttons[id] = { pressed, value: pressed ? 1 : 0 }
  }
  Object.defineProperty(navigator, 'getGamepads', { value: () => [{ index: 0, id: 'Review controller', buttons }] })
})
async function pressGamepad(button, held = false) {
  await page.evaluate(button => window.setReviewButton(button, true), button)
  await page.waitForTimeout(held ? 350 : 150)
  await page.evaluate(button => window.setReviewButton(button, false), button)
  await page.waitForTimeout(120)
}
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error')
    errors.push(message.text())
})
const button = name => page.getByRole('button', { name, exact: true })
async function capture(name) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${output}${name}.png` })
}
async function contained(selector) {
  const bounds = await page.locator(selector).boundingBox()
  const stage = await page.locator('.qua-stage').first().boundingBox()
  assert(bounds && stage, `${selector} is visible`)
  assert(bounds.x >= stage.x - 1 && bounds.y >= stage.y - 1 && bounds.x + bounds.width <= stage.x + stage.width + 1 && bounds.y + bounds.height <= stage.y + stage.height + 1, `${selector} stays inside the fitted stage`)
}
try {
  await openDemoPage(page, process.env.QUA_STORY_URL || 'http://127.0.0.1:4178/')
  await button('从头开始').waitFor()
  await page.evaluate(() => document.fonts.ready)
  await capture('title-desktop')
  await page.bringToFront()
  await pressGamepad(13, true)
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.quiId), 'native-main-menu-start', 'held direction moves once')
  await pressGamepad(13)
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.quiId), 'native-main-menu-load', 'disabled continue is skipped')
  await pressGamepad(0, true)
  await page.locator('[data-qui-id="native-save-load-panel"]').waitFor()
  await pressGamepad(13)
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.quiId), 'native-save-load-close')
  await pressGamepad(0)
  await button('从头开始').waitFor()
  assert(await page.locator('[data-qui-id="native-title-background"]').evaluate(el => el.complete && el.naturalWidth > 0))
  await button('章节选择').click()
  await contained('[data-qui-id="native-story-tree-panel"]')
  assert.equal(await page.locator('[data-qui-id="native-story-tree-panel"] [role="button"]:not([aria-disabled="true"])').count(), 0)
  await capture('chapters-locked')
  await page.keyboard.press('Escape')
  await button('从头开始').waitFor()
  await button('设置').click()
  await contained('[data-qui-id="settings-panel"]')
  const panelBounds = await page.locator('[data-qui-id="settings-panel"]').boundingBox()
  for (const control of await page.locator('[data-qui-id="settings-panel"] input, [data-qui-id="settings-panel"] select, [data-qui-id="settings-panel"] [role="switch"]').all()) {
    const bounds = await control.boundingBox()
    assert(bounds && panelBounds && bounds.y + bounds.height <= panelBounds.y + panelBounds.height, 'all settings fit without scrolling')
  }
  assert(!(await page.locator('[data-qui-id="settings-panel"]').textContent())?.includes('Core visual novel'))
  await capture('settings-desktop')
  const skipMode = page.getByLabel('快进范围', { exact: true })
  await skipMode.hover()
  await capture('settings-select-hover')
  await skipMode.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  assert(await skipMode.evaluate(el => document.activeElement === el), 'select participates in keyboard focus order')
  await capture('settings-select-focus')
  const initialSkip = await skipMode.inputValue()
  await pressGamepad(initialSkip === '0' ? 15 : 14, true)
  assert.notEqual(await skipMode.inputValue(), initialSkip, 'D-pad changes the focused select through its declared option intent')
  await skipMode.selectOption('1')
  const speed = page.locator('input[type="range"]').first()
  await speed.focus()
  const initialSpeed = Number(await speed.inputValue())
  await pressGamepad(initialSpeed === 0 ? 15 : 14, true)
  assert.equal(Math.abs(Number(await speed.inputValue()) - initialSpeed), 1, 'held D-pad changes a slider by one step')
  await page.keyboard.press('ArrowRight')
  const value = await speed.inputValue()
  assert(Number(value) > 0, 'keyboard changes the declared range option')
  await button('关闭').click()
  await page.reload()
  await button('设置').click()
  assert.equal(await speed.inputValue(), value, 'keyboard slider adjustment persists across reload')
  assert.equal(await skipMode.inputValue(), '1', 'select adjustment persists across reload')
  await button('关闭').click()
  await button('从头开始').click()
  const line = page.locator('.qua-dialogue-text')
  await line.waitFor()
  await page.waitForTimeout(1800)
  await capture('narration-desktop')
  // Read real story until the first named dialogue.
  for (let i = 0; i < 35 && !(await page.locator('.qua-dialogue-speaker').count()); i++) {
    await line.click()
    await page.waitForTimeout(140)
  }
  await page.waitForTimeout(1800)
  await capture('dialogue-desktop')
  const sheet = await page.locator('.qua-dialogue-box').boundingBox()
  const toolbar = await page.locator('[data-qui-id="native-quick-menu"]').boundingBox()
  const text = await line.boundingBox()
  assert(sheet && toolbar && text)
  assert(toolbar.y >= text.y + text.height && toolbar.y + toolbar.height <= sheet.y + sheet.height, 'toolbar occupies its own margin below dialogue')
  // Read enough dialogue to overflow the backlog at this viewport. The first
  // named line can appear before the history fills the panel.
  for (let i = 0; i < 22; i++) {
    await line.click()
    await page.waitForTimeout(160)
  }
  await page.locator('[data-qui-id="native-game-hud-log"]').click()
  await contained('[data-qui-id="backlog-panel"]')
  const history = page.locator('[data-qui-id="backlog-scroll"]')
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-qui-id="backlog-scroll"]')
    return el && el.scrollTop > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 3
  })
  const latestScroll = await history.evaluate(el => el.scrollTop)
  await history.focus()
  await page.keyboard.press('PageUp')
  await page.waitForFunction(latest => document.querySelector('[data-qui-id="backlog-scroll"]').scrollTop < latest, latestScroll)
  await button('最近记录').click()
  await capture('backlog-desktop')
  await page.keyboard.press('Escape')
  await page.locator('[data-qui-id="backlog-panel"]').waitFor({ state: 'detached' })
  await line.waitFor({ state: 'visible' })
  await page.locator('[data-qui-id="native-game-hud-auto"]').click()
  assert.equal(await page.locator('[data-qui-id="native-game-hud-auto"]').getAttribute('aria-pressed'), 'true')
  await capture('auto-active')
  await page.locator('[data-qui-id="native-game-hud-auto"]').click()
  await page.locator('[data-qui-id="native-game-hud-menu"]').click()
  await capture('reading-menu')
  await button('保存进度').click()
  await page.locator('[data-qui-id="slot-1"]').click()
  await page.waitForFunction(() => /\d{2}:\d{2}/.test(document.querySelector('[data-qui-id="slot-1-meta"]')?.textContent || ''))
  await page.locator('[data-qui-id="slot-1"]').click()
  await pressGamepad(13)
  assert(await page.evaluate(() => !!document.activeElement?.closest('[data-qui-id="native-save-confirm-panel"]')), 'covered slot cards cannot receive gamepad focus')
  await button('覆盖保存').click()
  await page.locator('[data-qui-id="native-save-confirm-panel"]').waitFor({ state: 'detached' })
  await page.locator('[data-qui-id="native-save-load-close"]').click()
  await page.locator('[data-qui-id="native-game-hud-menu"]').click()
  await button('设置').click()
  await capture('settings-ingame')
  await button('关闭').click()
  const cdp = await page.context().newCDPSession(page)
  for (const [name, width, height] of [['tablet', 1024, 768], ['phone-landscape', 844, 390]]) {
    if (name === 'phone-landscape')
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 21, left: 54, right: 54 } })
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(200)
    await contained('.qua-dialogue-box')
    await contained('[data-qui-id="native-quick-menu"]')
    if (name === 'phone-landscape') {
      const card = await page.locator('.qua-dialogue-box').boundingBox()
      const hud = await page.locator('[data-qui-id="native-quick-menu"]').boundingBox()
      const shift = await page.locator('[data-qui-surface="demo-app-shell"]').evaluate(el => getComputedStyle(el).translate)
      assert(card && hud && Number.parseFloat(shift.split(' ')[1]) < -50, 'phone home indicator shifts the shared HUD in logical pixels')
      assert(hud.y >= card.y && hud.y + hud.height <= card.y + card.height, 'phone HUD remains inside the dialogue card')
    }
    await capture(`dialogue-${name}`)
    await page.locator('[data-qui-id="native-game-hud-menu"]').click()
    await button('设置').click()
    await contained('[data-qui-id="settings-panel"]')
    await capture(`settings-${name}`)
    await button('关闭').click()
    await page.locator('[data-qui-id="native-game-hud-log"]').click()
    await contained('[data-qui-id="backlog-panel"]')
    await capture(`backlog-${name}`)
    await button('返回阅读').click()
  }
  assert.deepEqual(errors, [])
  console.warn('PASS: themed panels, keyboard slider persistence, dialogue/HUD separation, active mode semantics, tablet and phone stage containment; no browser errors')
}
finally { await browser.close() }
