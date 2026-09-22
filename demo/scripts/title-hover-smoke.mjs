/**
 * Start Web and Native at title (Native viewport 960x540, DPR 2), then run:
 * QUA_PARITY_WEB_URL=http://127.0.0.1:5173 node demo/scripts/title-hover-smoke.mjs
 * Real WGPU readbacks complement the deterministic 8ms mesh regression; CDP
 * screenshots do not sample every presented frame or prove OS presentation.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { connectNativeCdp } from './native-control.mjs'
import { openDemoPage } from './web-test-helpers.mjs'

const output = resolve('demo/.generated/qa/title-hover')
const prefix = 'ui:demo-app-shell:'
const ids = ['start', 'continue', 'load', 'story-tree', 'config', 'quit'].map(id => `native-main-menu-${id}`)
const labels = ['从头开始', '继续阅读', '读取存档', '章节选择', '设置', '退出游戏']
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const browser = await chromium.launch({
  args: ['--no-proxy-server'],
  ...(process.env.QUA_PARITY_CHROMIUM
    ? { executablePath: process.env.QUA_PARITY_CHROMIUM }
    : { channel: process.env.QUA_PARITY_BROWSER || 'chrome' }),
})
let client
try {
  client = await connectNativeCdp()
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })
  await mkdir(output, { recursive: true })
  await openDemoPage(page, process.env.QUA_PARITY_WEB_URL || 'http://127.0.0.1:5173')
  await page.getByRole('button', { name: '从头开始', exact: true }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  const web = await page.locator('[data-qui-id="demo-title-actions"] button').evaluateAll(elements => elements.map(element => {
    const bounds = element.getBoundingClientRect()
    return { text: element.textContent.trim(), bounds: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, bounds[key] * 2])) }
  }))
  const { commands } = await client.call('Qua.listCommands')
  const buttons = ids.map(id => commands.find(command => command.id === `${prefix}${id}`))
  assert(buttons.every(Boolean), 'Native must be on the title screen')
  assert.deepEqual(web.map(button => button.text), labels)
  assert.deepEqual(buttons.map(button => button.text), labels)
  for (const [index, button] of buttons.entries()) {
    for (const key of ['x', 'y', 'width', 'height'])
      assert(Math.abs(button.bounds[key] - web[index].bounds[key]) <= 3, `${button.id}: Web/Native ${key} differs`)
    for (const key of ['x', 'width', 'height'])
      assert.equal(button.bounds[key], buttons[0].bounds[key], `Menu rows must share ${key}`)
    if (index > 1)
      assert.equal(button.bounds.y - buttons[index - 1].bounds.y, buttons[1].bounds.y - buttons[0].bounds.y, 'Menu spacing must be uniform')
  }
  const active = buttons.filter(button => button.interactive)
  const points = []
  for (const button of active) {
    const { nodeId } = await client.call('DOM.querySelector', { nodeId: 1, selector: `#${button.id}` })
    const { quads } = await client.call('DOM.getContentQuads', { nodeId })
    const [x1, y1, x2, , , y3] = quads[0]
    points.push({ x: (x1 + x2) / 2, y: (y1 + y3) / 2 })
  }
  const move = (x, y) => client.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  const frames = []
  let baseline
  async function capture(name) {
    const { data } = await client.call('Page.captureScreenshot', { format: 'png' })
    await writeFile(resolve(output, `${name}.png`), Buffer.from(data, 'base64'))
    // Title-theme-specific text regions: dark glyphs on a light base/hover
    // background. Exclude the border; count every enabled row, not only hover.
    const ink = await page.evaluate(async ({ data, buttons }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
      if (bitmap.width !== 1920 || bitmap.height !== 1080)
        throw new Error('Native capture must be 1920x1080 for this title smoke')
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      return buttons.map(({ bounds }) => {
        const pixels = context.getImageData(Math.round(bounds.x + 16), Math.round(bounds.y + bounds.height * 0.2), Math.round(bounds.width - 32), Math.round(bounds.height * 0.6)).data
        let count = 0
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 150)
            count++
        }
        return count
      })
    }, { data, buttons: active })
    baseline ||= ink
    const ratios = ink.map((count, index) => count / baseline[index])
    frames.push({ name, ink, ratios })
    await writeFile(resolve(output, 'checks.json'), JSON.stringify({ web, native: buttons, frames }, null, 2))
    assert(baseline.every(count => count > 40), 'Base capture must contain visible labels')
    assert(ratios.every(ratio => ratio >= 0.65), `Label disappeared in ${name}: ${JSON.stringify(ratios)}`)
  }
  await move(5, 5)
  await pause(400)
  await capture('base')
  await page.mouse.move(5, 5)
  await page.screenshot({ path: resolve(output, 'web-base.png') })
  for (const [index, point] of points.entries()) {
    await move(point.x, point.y)
    // No settle delay before the first capture: endpoint-only screenshots
    // missed the opaque-alpha parsing failure during the transition.
    for (let frame = 0; frame < 5; frame++) {
      await capture(`enter-${index}-${frame}`)
      await move(point.x + frame % 2, point.y)
    }
    await move(5, 5)
    for (let frame = 0; frame < 3; frame++)
      await capture(`leave-${index}-${frame}`)
  }
  for (let round = 0; round < 4; round++) {
    for (const point of round % 2 ? [...points].reverse() : points) {
      await move(point.x, point.y)
      await pause(16)
    }
    await capture(`sweep-${round}`)
  }
  await page.getByRole('button', { name: '从头开始', exact: true }).hover()
  await page.waitForTimeout(200)
  await page.screenshot({ path: resolve(output, 'web-hover.png') })
  await move(5, 5)
  console.log(`PASS: aligned Web/Native menu; ${frames.length} Native captures retain every enabled label`)
}
finally {
  client?.close()
  await browser.close()
}
