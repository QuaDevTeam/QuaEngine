/** Actual browser + scene assets. Requires the demo Vite server. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const output = new URL('../../.codex-tmp/scene-screenshot/', import.meta.url).pathname
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Keep fixture state stable if another workspace build triggers Vite HMR.
await page.routeWebSocket('**', socket => socket.onMessage(() => {}))
page.setDefaultTimeout(30_000)
const errors = []
page.on('pageerror', error => errors.push(error.message))

// Expose the real runtime only in this intercepted test response. Production
// code has no global test hook, and all fixture edits use ordinary engine APIs.
await page.route(/\/src\/targets\/web\/main\.ts(?:\?.*)?$/, async (route) => {
  const response = await route.fetch()
  const source = await response.text()
  assert(source.includes('const app = await createQuaGameApp(runtime)'))
  await route.fulfill({ response, body: source.replace('const app = await createQuaGameApp(runtime)', 'globalThis.__sceneScreenshotRuntime = runtime; const app = await createQuaGameApp(runtime)') })
})

try {
  await page.goto(process.env.QUA_STORY_URL || 'http://127.0.0.1:4186/')
  await page.waitForFunction(() => globalThis.__sceneScreenshotRuntime)
  await page.getByRole('button', { name: '从头开始', exact: true }).click({ timeout: 60_000 })
  await page.locator('.qua-dialogue-text').waitFor()
  await page.mouse.click(720, 360)
  for (let i = 0; i < 90 && !(await page.locator('.qua-character[data-character-visible="true"]').count()); i++) {
    await page.keyboard.press('Space')
    await page.waitForTimeout(180)
  }
  await page.waitForTimeout(1600)
  const cast = await page.locator('.qua-character[data-character-visible="true"]').count()
  assert(cast > 0, 'a real story character is visible')
  await page.evaluate(async () => {
    const background = globalThis.__sceneScreenshotRuntime.engine.getPluginById('background')
    await background.addLayer({ id: 'photo', assetName: 'inserts/rain-paper-bag.webp', x: 100, y: 110, width: 420, height: 280, fit: 'contain', zIndex: 10 })
    await background.addLayer({ id: 'note', assetName: 'inserts/two-blue-umbrellas.webp', x: 1360, y: 200, width: 420, height: 280, fit: 'contain', zIndex: 20 })
  })
  await page.waitForFunction(() => [...document.querySelectorAll('.qua-background-layer-item')].length === 3
    && [...document.querySelectorAll('.qua-background-layer-item')].every(image => image.complete && image.naturalWidth > 0))
  const stage = await page.locator('.qua-stage').boundingBox()
  const photo = await page.locator('[data-background-layer-id="photo"]').boundingBox()
  const scale = stage.width / 1920
  assert(Math.abs(photo.x - stage.x - 100 * scale) < 1)
  assert(Math.abs(photo.y - stage.y - 110 * scale) < 1)
  assert(Math.abs(photo.width - 420 * scale) < 1)
  const before = await page.evaluate(() => globalThis.__sceneScreenshotRuntime.engine.getViewState())
  await page.screenshot({ path: `${output}demo-ui.png` })
  await page.getByRole('button', { name: '截图', exact: true }).click()
  await page.waitForTimeout(300)
  const assertHidden = async () => {
    for (const selector of ['.qua-stage-safe', '.qua-stage-overlay', '.qua-screen-plane'])
      assert.equal(await page.locator(selector).evaluate(element => element.childElementCount), 0)
    assert.equal(await page.locator('.qua-character[data-character-visible="true"]').count(), cast)
    assert.equal(await page.locator('.qua-background-layer-item').count(), 3)
  }
  await assertHidden()
  await page.screenshot({ path: `${output}demo-scene-only.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)
  const assertRestored = async () => {
    const after = await page.evaluate(() => globalThis.__sceneScreenshotRuntime.engine.getViewState())
    assert.equal(after.ui.visible, true)
    assert.deepEqual(after.dialogue, before.dialogue)
    assert.deepEqual(after.characters, before.characters)
    assert.deepEqual(after.background, before.background)
  }
  await assertRestored()
  await page.keyboard.press('h')
  await page.waitForTimeout(250)
  await assertHidden()
  await page.mouse.click(720, 360)
  await page.waitForTimeout(350)
  await assertRestored()

  // Sample a real placed image deterministically, then let the renderer clock
  // animate it while screenshot mode hides all chrome.
  const playbackId = await page.evaluate(async () => {
    const animation = globalThis.__sceneScreenshotRuntime.engine.getPluginById('animation')
    const playback = await animation.playTimeline({
      duration: 2000,
      tracks: Object.entries({ x: [100, 500], y: [110, 250], width: [420, 480], height: [280, 320], scale: [1, 0.8], rotation: [0, -12], opacity: [1, 0.6] })
        .map(([property, [from, to]]) => ({ target: 'backgroundLayer:photo', property, keyframes: [{ at: 0, value: from }, { at: 2000, value: to }] })),
    })
    await animation.pause(playback.id)
    await animation.seek(playback.id, 1000)
    return playback.id
  })
  const readMotion = () => page.locator('[data-background-layer-id="photo"]').evaluate((element) => {
    const style = getComputedStyle(element)
    const matrix = new DOMMatrixReadOnly(style.transform)
    return { x: matrix.m41, y: matrix.m42, width: Number.parseFloat(style.width), height: Number.parseFloat(style.height), scale: Math.hypot(matrix.m11, matrix.m12), rotation: Math.atan2(matrix.m12, matrix.m11) * 180 / Math.PI, opacity: Number(style.opacity) }
  })
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-background-layer-id="photo"]')
    return element && Number.parseFloat(getComputedStyle(element).width) === 450
  })
  const midpoint = await readMotion()
  for (const [key, value] of Object.entries({ x: 300, y: 180, width: 450, height: 300, scale: 0.9, rotation: -6, opacity: 0.8 }))
    assert(Math.abs(midpoint[key] - value) < 0.01, `image midpoint ${key}: ${midpoint[key]}`)
  const runningView = await page.evaluate(() => globalThis.__sceneScreenshotRuntime.engine.getViewState())
  assert.deepEqual(runningView.background, before.background, 'sampling leaves engine state intact until final commit')
  await page.screenshot({ path: `${output}animation-midpoint.png` })
  await page.keyboard.press('h')
  await assertHidden()
  assert.deepEqual(await readMotion(), midpoint, 'paused image survives screenshot toggle')
  await page.evaluate(async id => globalThis.__sceneScreenshotRuntime.engine.getPluginById('animation').resume(id), playbackId)
  await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-background-layer-id="photo"]')).transform).m41 > 320)
  await assertHidden()
  await page.evaluate(async id => globalThis.__sceneScreenshotRuntime.engine.getPluginById('animation').wait(id), playbackId)
  await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-background-layer-id="photo"]')).transform).m41 === 500)
  const animated = await page.evaluate(() => globalThis.__sceneScreenshotRuntime.engine.getViewState())
  const finalImage = animated.background.layers.find(layer => layer.id === 'photo')
  for (const [key, value] of Object.entries({ x: 500, y: 250, width: 480, height: 320, scale: 0.8, rotation: -12, opacity: 0.6 }))
    assert.equal(finalImage[key], value, `committed image ${key}`)
  assert.equal(animated.ui.visible, false)
  assert.equal(animated.background.assetName, before.background.assetName)
  assert.deepEqual(animated.background.layers.find(layer => layer.id === 'note'), before.background.layers.find(layer => layer.id === 'note'))
  assert.deepEqual(animated.dialogue, before.dialogue)
  await page.screenshot({ path: `${output}animated-scene-only.png` })
  await page.keyboard.press('h')
  await page.getByRole('button', { name: '截图', exact: true }).waitFor()
  await page.getByRole('button', { name: '菜单', exact: true }).click()
  await page.waitForTimeout(300)
  const menu = await page.locator('.qua-stage-overlay').textContent()
  await page.keyboard.press('h')
  await page.waitForTimeout(250)
  await assertHidden()
  await page.keyboard.press('h')
  await page.waitForTimeout(300)
  assert.equal(await page.locator('.qua-stage-overlay').textContent(), menu)
  await page.keyboard.press('Escape')

  await page.evaluate(async () => {
    await globalThis.__sceneScreenshotRuntime.engine.getPluginById('background').clearLayers()
  })
  await page.waitForFunction(() => document.querySelectorAll('.qua-background-layer-item').length === 1)
  assert.deepEqual(errors, [])
  await writeFile(`${output}demo-result.json`, JSON.stringify({ passed: true, cast, stage, photo, midpoint, finalImage, errors }, null, 2))
  process.stdout.write(`Scene images, animation and screenshot mode smoke passed: ${output}\n`)
}
catch (error) {
  await page.screenshot({ path: `${output}demo-failed.png` })
  console.error(errors)
  throw error
}
finally {
  await browser.close()
}
