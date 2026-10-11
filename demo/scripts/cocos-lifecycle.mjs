import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertBlackBars } from './cocos-capture-checks.mjs'
import { captureNative, clickNativeId, connectCocosNative, inspectNative, pressNativeKey, scrollNativeId } from './cocos-native-review.mjs'

const output = resolve(process.env.QUA_COCOS_REVIEW || new URL('../dist/cocos/review', import.meta.url).pathname)
const app = process.env.QUA_COCOS_NATIVE_APP || JSON.parse(await readFile(resolve(output, 'mac-artifacts.json'), 'utf8'))[0]
const endpoint = process.env.QUA_COCOS_NATIVE_DEBUG_URL || 'http://127.0.0.1:6086/json'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const report = { status: 'running', app, evidence: 'Real application process and Creator native input bindings; OS input unverified', checks: [] }
let child, exited, client
await mkdir(output, { recursive: true })
async function launch() {
  assert(!await fetch(endpoint).then(r => r.ok).catch(() => false), 'Another application owns the native debug port')
  child = spawn(resolve(app, 'Contents/MacOS/CocosGame'), [], { stdio: ['ignore', 'pipe', 'pipe'] })
  exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  let log = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (bytes) => {
      log += bytes.toString()
    })
  }
  child.once('exit', () => {
    void writeFile(resolve(output, 'lifecycle-runtime.log'), log)
  })
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null)
      throw new Error(`Native application exited before boot: ${log}`)
    if (await fetch(endpoint).then(r => r.ok).catch(() => false))
      break
    await delay(100)
  }
  client = await connectCocosNative()
  await until(s => s.diagnostics.screen === 'title')
}
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (await client.evaluate('!!globalThis.__QUA_COCOS__')) {
      const state = await inspectNative(client)
      assert(!state.diagnostics.error, state.diagnostics.error)
      if (predicate(state))
        return state
    }
    await delay(100)
  }
  throw new Error('Native interaction did not settle')
}
async function title() {
  await clickNativeId(client, 'native-game-hud-menu')
  await clickNativeId(client, 'native-game-menu-title-action')
  await clickNativeId(client, 'native-title-confirm-confirm')
  await until(s => s.diagnostics.screen === 'title')
}
async function quit() {
  await clickNativeId(client, 'native-main-menu-quit')
  try {
    await clickNativeId(client, 'native-quit-confirm-confirm')
  }
  catch (error) {
    // Creator may destroy the debugger before acknowledging the quit input.
    // The process exit below remains the authority for successful shutdown.
    if (!/disconnected|not connected|context was destroyed/i.test(error.message))
      throw error
  }
  const result = await Promise.race([exited, delay(5000).then(() => {
    throw new Error('Quit left the macOS process alive')
  })])
  assert.equal(result.code, 0, 'Native quit must exit successfully')
  client.close()
  client = undefined
  report.checks.push({ action: 'quit', ...result })
}
try {
  await launch()
  await clickNativeId(client, 'native-main-menu-start')
  const opening = await until(s => s.diagnostics.screen === 'game' && !!s.view.dialogue.text)
  for (let line = 0; line < 30; line++) {
    const text = (await inspectNative(client)).view.dialogue.text
    for (let retry = 0; retry < 100; retry++) {
      await pressNativeKey(client, 32, 150)
      if (JSON.stringify((await inspectNative(client)).view.dialogue.text) !== JSON.stringify(text))
        break
      if (retry === 99)
        throw new Error('Native advance stalled')
    }
    await delay(500)
  }
  report.continuation = (await inspectNative(client)).view.dialogue.text
  await title()
  await quit()
  await launch()
  await clickNativeId(client, 'native-main-menu-continue')
  await until(s => s.diagnostics.screen === 'game' && JSON.stringify(s.view.dialogue.text) === JSON.stringify(report.continuation))
  report.checks.push({ action: 'continue-after-process-quit-and-restart', text: report.continuation })
  await clickNativeId(client, 'native-game-hud-log')
  await until(s => s.nodes.some(n => n.name === 'backlog-latest'))
  await clickNativeId(client, 'backlog-earliest')
  await delay(700)
  const first = await inspectNative(client)
  const firstY = first.nodes.find(n => n.name === 'backlog-entry-0').actual.y
  await captureNative(client, resolve(output, 'cocos-mac-backlog-earliest.png'))
  report.blackBars = await assertBlackBars(resolve(output, 'cocos-mac-backlog-earliest.png'), first.layout)
  await scrollNativeId(client, 'backlog-scroll')
  await delay(500)
  const wheelY = (await inspectNative(client)).nodes.find(n => n.name === 'backlog-entry-0').actual.y
  assert(Math.abs(wheelY - firstY) > 10, 'Native wheel input must scroll the actual backlog rows')
  report.checks.push({ action: 'native-backlog-wheel', firstY, wheelY })
  await clickNativeId(client, 'backlog-latest')
  await delay(700)
  const lastY = (await inspectNative(client)).nodes.find(n => n.name === 'backlog-entry-0').actual.y
  assert(Math.abs(lastY - firstY) > 100, 'Backlog edge controls must scroll the actual rows')
  await captureNative(client, resolve(output, 'cocos-mac-backlog-latest.png'))
  await clickNativeId(client, 'backlog-earliest')
  await delay(400)
  const row = (await inspectNative(client)).nodes.find(n => n.name === 'backlog-entry-0')
  if (row.metadata.quiIntent) {
    await clickNativeId(client, 'backlog-entry-0')
    await until(s => JSON.stringify(s.view.dialogue.text) === JSON.stringify(opening.view.dialogue.text))
  }
  report.checks.push({ action: 'backlog-edge-navigation', firstY, lastY, rewind: row.metadata.quiIntent ? 'passed' : 'disabled by demo policy' })
  if ((await inspectNative(client)).nodes.some(n => n.name === 'backlog-close'))
    await clickNativeId(client, 'backlog-close')
  await title()
  await clickNativeId(client, 'native-main-menu-story-tree')
  await until(s => s.nodes.some(n => n.name === 'prologue-arrival'))
  await captureNative(client, resolve(output, 'cocos-mac-chapters.png'))
  await clickNativeId(client, 'prologue-arrival')
  await until(s => s.diagnostics.screen === 'game' && JSON.stringify(s.view.dialogue.text) === JSON.stringify(opening.view.dialogue.text))
  report.checks.push({ action: 'chapter-jump-to-opening' })
  assert(!client.logs.some(log => log.type === 'error'), 'Native lifecycle runtime errors')
  await title()
  await quit()
  report.status = 'quit-restart-continue-backlog-chapter-passed'
}
catch (error) {
  report.status = 'failed'
  report.error = error.stack
  throw error
}
finally {
  client?.close()
  if (child?.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
  await writeFile(resolve(output, 'cocos-mac-lifecycle.json'), JSON.stringify(report, null, 2))
}
