/** Decoupled opening-scene and Web UI smoke regression; media/native E2E remains separate. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { openDemoPage } from './web-test-helpers.mjs'

const url = process.env.QUA_STORY_URL || 'http://localhost:4178/'
const output = process.env.QUA_STORY_OUTPUT
  ? resolve(process.env.QUA_STORY_OUTPUT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../.generated/qa/story')
const browser = await chromium.launch({
  ...(process.env.QUA_STORY_CHROMIUM
    ? { executablePath: process.env.QUA_STORY_CHROMIUM }
    : { channel: process.env.QUA_PROLOGUE_BROWSER || 'chrome' }),
  args: ['--no-proxy-server'],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
page.setDefaultTimeout(20_000)
const memoryAudit = process.env.QUA_MEMORY_AUDIT === '1'
const memorySamples = []
if (memoryAudit) {
  await page.addInitScript(() => {
    const urls = new Map()
    let created = 0
    let revoked = 0
    let peakUrls = 0
    let peakBytes = 0
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      urls.set(url, blob.size || 0)
      created += 1
      peakUrls = Math.max(peakUrls, urls.size)
      peakBytes = Math.max(peakBytes, [...urls.values()].reduce((a, b) => a + b, 0))
      return url
    }
    URL.revokeObjectURL = (url) => {
      urls.delete(url)
      revoked += 1
      revoke(url)
    }
    window.__quaMemorySample = () => ({
      activeUrls: urls.size,
      activeBlobBytes: [...urls.values()].reduce((a, b) => a + b, 0),
      created,
      revoked,
      peakUrls,
      peakBytes,
      estimatedDomImageBytes: [...document.images].reduce((sum, image) => sum + image.naturalWidth * image.naturalHeight * 4, 0),
    })
  })
}
const errors = []
const requests = []
const results = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error')
    errors.push(message.text())
})
page.on('request', request => requests.push(request.url()))
const button = name => page.getByRole('button', { name, exact: true })
const readyTitle = () => button('从头开始').waitFor({ timeout: 60_000 })
const line = page.locator('.qua-dialogue-text')
const waitLine = text => page.waitForFunction(text => document.querySelector('.qua-dialogue-text')?.textContent?.includes(text), text)
const menu = () => page.locator('[data-qui-id="native-game-hud-menu"]').click()

function stageCast() {
  return page.locator('.qua-character[data-character-visible="true"]:not([data-character-presence="exit"])').evaluateAll(elements => elements.map(el => ({
    id: el.dataset.characterId,
    expression: el.dataset.spriteExpression,
    x: el.dataset.characterX,
    y: el.dataset.characterY,
    scale: el.dataset.characterScale,
    opacity: Number(getComputedStyle(el).opacity),
  })).sort((a, b) => a.id.localeCompare(b.id)))
}

async function backgroundDigest() {
  await page.waitForFunction(() => {
    const image = document.querySelector('.qua-background')
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
  })
  return page.locator('.qua-background').evaluate(async (image) => {
    await image.decode()
    const bytes = await (await fetch(image.src)).arrayBuffer()
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
  })
}

function pass(message) {
  results.push(message)
  console.warn(`PASS: ${message}`)
}

async function snapshot(name) {
  await page.waitForTimeout(350)
  if (memoryAudit)
    memorySamples.push({ name, ...await page.evaluate(() => window.__quaMemorySample()) })
  await page.screenshot({ path: resolve(output, `${name}.png`) })
}

async function title() {
  await menu()
  await button('返回标题').click()
  await page.locator('[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]').getByRole('button', { name: '返回标题', exact: true }).click()
  await button('从头开始').waitFor()
}

async function advanceLine() {
  await page.locator('.qua-dialogue-box').click({ force: true })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

try {
  await mkdir(output, { recursive: true })
  await openDemoPage(page, url)
  await readyTitle()
  assert(await button('继续阅读').isDisabled(), 'continue button is initially disabled')
  await page.evaluate(() => document.fonts.ready)
  await snapshot('title')

  // 1. Chapter selection panel: spoiler-free locked state
  await button('章节选择').click()
  assert.equal(await page.locator('[data-qui-id="native-story-tree-panel"] [aria-disabled="true"]').count(), 9)
  assert(!(await page.locator('[data-qui-id="native-story-tree-panel"]').textContent()).includes('下一次约会'))
  await button('返回标题').click()

  // 2. Load panel: 9 empty initial slots
  await button('读取存档').click()
  await page.locator('[data-qui-id="slot-9"][aria-disabled="true"]').waitFor()
  assert.equal(await page.locator('[data-qui-id^="slot-"][aria-disabled="true"]').count(), 9)
  assert.equal(await button('保存').count(), 0)
  await page.getByRole('button', { name: '关闭', exact: true }).click()

  // 3. Settings panel: skip scope and display configuration
  await button('设置').click()
  const skipMode = page.locator('select[aria-label="快进范围"]')
  assert.equal(await skipMode.inputValue(), '0')
  await skipMode.selectOption('1')
  await snapshot('settings')
  await page.locator('[data-qui-id="settings-close"]').click()
  pass('fresh title, locked spoiler-free chapters, empty load slots, readable settings with read-only skip default')

  // 4. Start opening scene from title
  await button('从头开始').click()
  await waitLine('2019 年')
  const firstLineText = await line.textContent()
  await page.keyboard.press('Escape')
  await snapshot('menu')
  await button('继续阅读').click()
  await advanceLine()
  assert.notEqual(await line.textContent(), firstLineText)
  pass('closing the reading menu resumes live dialogue')

  // 5. Advance through opening scene until Mara appears
  let maraEntered = false
  for (let i = 0; i < 60; i++) {
    const cast = await stageCast()
    if (cast.some(c => c.id === 'mara')) {
      maraEntered = true
      break
    }
    await advanceLine()
  }
  assert(maraEntered, 'heroine Mara enters the stage in opening scene')
  await page.waitForTimeout(600)
  const cast = await stageCast()
  const mara = cast.find(c => c.id === 'mara')
  assert(mara && mara.opacity >= 0.99, 'Mara is visible and painted with high opacity')
  const sprite = page.locator('.qua-character[data-character-id="mara"] .qua-sprite-layer--expression')
  await page.waitForFunction(() => {
    const image = document.querySelector('.qua-character[data-character-id="mara"] .qua-sprite-layer--expression')
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
  })
  await sprite.first().evaluate(el => el.decode())
  assert(await sprite.first().evaluate(el => el.naturalWidth > 0), 'actual expression image loads and decodes')
  pass('character entrance and sprite layer decoding verified in opening scene')

  // 6. Advance until insert image appears (warm paper bag CG)
  const bagBytes = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../assets/images/inserts/rain-paper-bag.webp'))
  const bagDigest = createHash('sha256').update(bagBytes).digest('hex')

  let insertFound = false
  for (let i = 0; i < 40; i++) {
    const cast = await stageCast()
    if (cast.length === 0) {
      await page.waitForTimeout(450)
      if (await backgroundDigest() === bagDigest) {
        insertFound = true
        break
      }
    }
    await advanceLine()
  }
  assert(insertFound, 'insert rain-paper-bag.webp appears during bread delivery')
  assert.equal(await backgroundDigest(), bagDigest, 'correct authored insert image decoded from QPK')
  assert.equal((await stageCast()).length, 0, 'characters are hidden during insert presentation')

  // 7. Manual save, overwrite confirmation, and fresh-page load restoration
  const insertLineText = await line.textContent()
  await menu()
  await button('保存进度').click()
  await page.locator('[data-qui-id="slot-1"]').click()
  await page.waitForFunction(id => /\d{2}:\d{2}/.test(document.querySelector(`[data-qui-id="${id}"]`)?.textContent || ''), 'slot-1-meta')
  await snapshot('save')
  await page.locator('[data-qui-id="slot-1"]').click()
  await snapshot('overwrite-confirm')
  await button('取消').click()
  await page.locator('[data-qui-id="slot-1"]').click()
  await button('覆盖保存').click()
  await page.locator('[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]').waitFor({ state: 'detached' })
  await page.locator('[data-qui-id="native-save-load-close"]').click()
  await page.locator('[data-qui-id="native-game-hud-menu"]').waitFor()

  // Fresh reload and load from slot-1
  await openDemoPage(page, page.url())
  await readyTitle()
  await button('读取存档').click()
  await page.locator('[data-qui-id="slot-1"]').click()
  await waitLine(insertLineText)
  assert.equal(await backgroundDigest(), bagDigest, 'fresh-page load retains insert image')
  assert.equal((await stageCast()).length, 0, 'fresh-page load does not reintroduce hidden characters during insert')
  pass('manual save, overwrite confirmation and fresh-page load preserve game state')

  // 8. Advance past insert, verify character re-entrance, and test Title continuation point
  await advanceLine()
  for (let i = 0; i < 20; i++) {
    if ((await stageCast()).length > 0)
      break
    await advanceLine()
  }
  const continuedLineText = await line.textContent()
  const savedCast = await stageCast()
  assert(savedCast.some(c => c.id === 'mara'), 'Mara re-enters after insert')

  // Return to title and test resume
  await title()
  await openDemoPage(page, page.url())
  await readyTitle()
  assert(await button('继续阅读').isEnabled(), 'continue button is enabled after returning to title')
  await button('继续阅读').click()
  await waitLine(continuedLineText)
  assert.deepEqual(await stageCast(), savedCast, 'continuation restores character staging and dialogue line')
  pass('returning to title saves a continuation point that survives refresh')

  // 9. Backlog verification
  await page.mouse.move(640, 360)
  await page.mouse.wheel(0, -120)
  await page.locator('[data-qui-id="backlog-panel"]').waitFor()
  const backlogText = await page.locator('[data-qui-id="backlog-panel"]').textContent() || ''
  assert(backlogText.includes('2019 年'), 'backlog contains the opening lines')
  const history = page.locator('[data-qui-id="backlog-scroll"]')
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-qui-id="backlog-scroll"]')
    return el && el.scrollHeight - el.scrollTop - el.clientHeight < 3
  })
  await button('最早记录').click()
  assert.equal(await history.evaluate(el => el.scrollTop), 0, 'earliest record scrolls to top')
  await button('最近记录').click()
  assert(await history.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 3), 'latest record scrolls to bottom')
  await snapshot('backlog')
  await page.locator('[data-qui-id="backlog-close"]').click()
  pass('backlog scroll, earliest/latest navigation and historical entries verified')

  // 10. Responsive viewports
  await title()
  await page.setViewportSize({ width: 960, height: 720 })
  await snapshot('title-tablet')
  await page.setViewportSize({ width: 844, height: 390 })
  await snapshot('title-phone-landscape')
  const bounds = await button('设置').boundingBox()
  assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 844 && bounds.y + bounds.height <= 390)
  pass('title controls remain inside the fitted stage on tablet and phone landscape')

  // 11. Memory audit & error verification
  if (memoryAudit) {
    const finalMemory = await page.evaluate(() => window.__quaMemorySample())
    assert(finalMemory.revoked > 0, 'unused image object URLs are actually revoked during reading')
    assert(finalMemory.activeUrls <= 16, 'returning to title does not leak image URLs')
    memorySamples.push({ name: 'final-title', ...finalMemory })
  }
  assert.deepEqual(errors, [])
  assert(requests.some(request => /\.qpk$/.test(request)))
  assert(!requests.some(request => request.includes('/@qua-assets/')))
  pass('production QPK loads without browser errors or development VFS requests')

  await writeFile(resolve(output, 'results.json'), JSON.stringify({ url, results, errors, memorySamples }, null, 2))
  await rm(resolve(output, 'failure.json'), { force: true })
  await rm(resolve(output, 'failure.png'), { force: true })
}
catch (error) {
  await snapshot('failure').catch(() => {})
  const text = await page.locator('body').textContent().catch(() => '<page unavailable>')
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, results, errors, text }, null, 2))
  throw error
}
finally {
  await browser.close()
}
