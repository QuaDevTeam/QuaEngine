/** Run against Web, or --native with a dev window at the title screen. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { clickCommandCenter, connectNativeCdp } from './native-control.mjs'
import { openDemoPage } from './web-test-helpers.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isNative = process.argv.includes('--native')
const target = isNative ? 'native' : 'web'
const output = resolve(root, '.generated/qa/navigation')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const results = {}
const errors = []
let browser
let page
let client

async function state() {
  if (isNative) {
    const { commands } = await client.call('Qua.listCommands')
    return {
      ids: commands.map(command => command.id.replace('ui:demo-app-shell:', '')),
      text: commands.find(command => command.id === 'dialogue:text')?.text,
      background: commands.some(command => command.id === 'background:main'),
      filledSlots: commands.filter(command => /:slot-\d+-name$/.test(command.id) && command.text !== '空存档').map(command => command.id.split(':').at(-1).replace('-name', '')),
    }
  }
  return page.evaluate(() => ({
    ids: [...document.querySelectorAll('[data-qui-id]')].map(element => element.getAttribute('data-qui-id')),
    text: document.querySelector('.qua-dialogue-text')?.textContent,
    background: !!document.querySelector('.qua-background'),
    filledSlots: [...document.querySelectorAll('[data-qui-id^="slot-"][data-qui-id$="-name"]')].filter(element => element.textContent !== '空存档').map(element => element.getAttribute('data-qui-id').replace('-name', '')),
  }))
}

async function until(predicate, timeout = 2000) {
  const start = Date.now()
  let current
  do {
    current = await state()
    if (predicate(current))
      return current
    await sleep(50)
  } while (Date.now() - start < timeout)
  assert.fail(`${target} navigation did not settle within ${timeout}ms: ${JSON.stringify(current)}`)
}

async function click(id) {
  await until(current => current.ids.includes(id))
  if (isNative)
    await clickCommandCenter(client, `ui:demo-app-shell:${id}`)
  else await page.locator(`[data-qui-id="${id}"]`).click()
}

async function capture(name) {
  // The command tree can lead the completed WGPU frame while textures/fonts
  // prepare. Let the GPU settle without injecting any additional input.
  if (isNative)
    await sleep(500)
  const path = resolve(output, `${target}-${name}.png`)
  if (isNative) {
    const { data } = await client.call('Page.captureScreenshot', { format: 'png' })
    await writeFile(path, Buffer.from(data, 'base64'))
  }
  else await page.screenshot({ path })
}

async function returnToTitle(name) {
  await click('native-game-hud-menu')
  await click('native-game-menu-title-action')
  const start = Date.now()
  await click('native-title-confirm-confirm')
  await until(current => current.ids.includes('native-main-menu-continue') && !current.ids.includes('native-game-hud-menu'))
  results[name] = Date.now() - start
  assert(results[name] < 2000, `${name} waited for capture timeout`)
}

async function enterStory(id, text, name) {
  const start = Date.now()
  await click(id)
  // Deliberately no stage click/key/move here: first render must happen itself.
  await until(current => current.background && current.text === text && current.ids.includes('native-game-hud-menu'))
  results[name] = Date.now() - start
  assert(results[name] < 2000, `${name} waited for capture timeout or extra input`)
  await capture(name)
}

try {
  await mkdir(output, { recursive: true })
  if (isNative) {
    client = await connectNativeCdp()
  }
  else {
    browser = await chromium.launch({ channel: process.env.QUA_PROLOGUE_BROWSER || 'chrome', args: ['--no-proxy-server'] })
    page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })
    page.on('pageerror', error => errors.push(error.message))
    await openDemoPage(page, process.env.QUA_STORY_URL || 'http://localhost:4178/')
    await page.locator('[data-qui-id="native-main-menu-start"]').waitFor({ timeout: 60000 })
  }
  const first = '2019 年 6 月 10 日，青叶市。'
  const second = '巴士开走以后，神代凛才发现雨棚漏了一处水。'
  await enterStory('native-main-menu-start', first, 'first-line')
  if (isNative) {
    await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 450, y: 250, button: 'left', clickCount: 1 })
    await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 450, y: 250, button: 'left', clickCount: 1 })
  }
  else await page.mouse.click(450, 250)
  await until(current => current.text === second)
  await click('native-game-hud-menu')
  await click('native-game-menu-save')
  await click('slot-9')
  // Re-running against an existing native session may overwrite this slot.
  const saved = await until(current => current.filledSlots.includes('slot-9') || current.ids.includes('native-save-confirm-accept'))
  if (saved.ids.includes('native-save-confirm-accept'))
    await click('native-save-confirm-accept')
  await until(current => current.filledSlots.includes('slot-9') && !current.ids.includes('native-save-confirm-accept'))
  await click('native-save-load-close')
  await returnToTitle('return-title')
  await capture('title')
  await enterStory('native-main-menu-continue', second, 'resume')
  await returnToTitle('return-title-again')
  await enterStory('native-main-menu-start', first, 'restart')
  await click('native-game-hud-menu')
  await click('native-game-menu-load')
  const load = await until(current => current.ids.includes('native-save-load-panel'))
  assert(!load.ids.some(id => id.startsWith('native-save-mode-')), 'Load panel should contain cards, without mode buttons')
  await capture('load-cards')
  const loadStart = Date.now()
  await click('slot-9')
  await until(current => current.text === second && current.ids.includes('native-game-hud-menu') && !current.ids.includes('native-save-load-panel'))
  results['load-card'] = Date.now() - loadStart
  await returnToTitle('final-title')
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, `${target}.json`), `${JSON.stringify({ target, elapsedMs: results, errors }, null, 2)}\n`)
  console.log(`${target} navigation passed: ${JSON.stringify(results)}`)
}
finally {
  client?.close()
  await browser?.close()
}
