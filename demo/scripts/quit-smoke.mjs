/** Exercise real browser close policy and title-menu confirmation through UI. */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { openDemoPage } from './web-test-helpers.mjs'

const url = process.env.QUA_STORY_URL || 'http://127.0.0.1:4178/'
const output = new URL('../.generated/qa/quit/', import.meta.url).pathname
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] })
const errors = []
const track = page => page.on('pageerror', error => errors.push(error.message))
const button = (page, name) => page.getByRole('button', { name, exact: true })
async function ready(page) {
  track(page)
  await button(page, '从头开始').waitFor()
  await page.evaluate(() => document.fonts.ready)
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await openDemoPage(page, url)
  await ready(page)
  assert.deepEqual(await page.locator('[data-qui-id="demo-title-menu"] button').allTextContents(), ['从头开始', '继续阅读', '读取存档', '章节选择', '设置', '退出游戏'])
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['portrait', { width: 900, height: 1440 }]]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${output}title-${name}.png` })
    const menu = await page.locator('[data-qui-id="demo-title-menu"]').boundingBox()
    const stage = await page.locator('.qua-stage').first().boundingBox()
    assert(menu && stage && menu.y >= stage.y && menu.y + menu.height <= stage.y + stage.height, 'title and all six actions fit the stage')
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await button(page, '退出游戏').click()
  await page.getByText('退出游戏？', { exact: true }).waitFor()
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${output}confirm-web.png` })
  await button(page, '取消').click()
  await button(page, '从头开始').waitFor()
  await button(page, '退出游戏').click()
  await page.keyboard.press('Escape')
  await button(page, '从头开始').waitFor()
  await button(page, '退出游戏').click()
  await page.locator('[data-qui-id="native-quit-confirm-backdrop"]').click({ position: { x: 10, y: 10 } })
  await button(page, '从头开始').waitFor()

  // A normal tab with navigation history cannot be closed by window.close().
  await page.evaluate(() => history.pushState({}, '', '#quit-policy'))
  await button(page, '退出游戏').click()
  await button(page, '退出游戏').click()
  await page.getByText('浏览器未允许自动关闭，请手动关闭此标签页。', { exact: true }).waitFor()
  assert.equal(page.isClosed(), false)
  await button(page, '取消').click()
  await button(page, '从头开始').waitFor()
  await context.close()

  // Script-opened windows really close, with and without confirmation enabled.
  for (const confirm of [true, false]) {
    const popupContext = await browser.newContext()
    const opener = await popupContext.newPage()
    const opened = popupContext.waitForEvent('page')
    await opener.evaluate(target => window.open(target), url)
    const popup = await opened
    await ready(popup)
    if (!confirm) {
      await button(popup, '设置').click()
      const setting = popup.getByRole('switch', { name: '退出前确认', exact: true })
      assert.equal(await setting.getAttribute('aria-checked'), 'true')
      await setting.click()
      assert.equal(await setting.getAttribute('aria-checked'), 'false')
      await button(popup, '关闭').click()
    }
    const closed = popup.waitForEvent('close')
    await button(popup, '退出游戏').click()
    if (confirm)
      await button(popup, '退出游戏').click()
    await closed
    await popupContext.close()
  }
  assert.deepEqual(errors, [])
  console.warn('Quit smoke passed: six-row layout, cancel/Esc/backdrop, blocked tab guidance, popup close, and confirmation preference.')
}
finally {
  await browser.close()
}
