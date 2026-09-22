import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { copyDemoFixture } from './demo-fixture.mjs'
import { captureNativeWindow } from './native-window-artifact.mjs'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(resolve(editorRoot, 'package.json'))
const temporary = await mkdtemp(resolve(tmpdir(), 'qua-preview-smoke-'))
const projectRoot = await copyDemoFixture(root, resolve(temporary, 'project'), { native: process.argv.includes('--native') })
const artifacts = resolve(root, '.codex-tmp/editor-smoke')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

await mkdir(artifacts, { recursive: true })
const application = await launchEditor({ executablePath: require('electron'), args: [editorRoot, '--project', projectRoot], env, timeout: 60000 })
const errors = []
const metrics = []
const previewPids = new Set()
application.process().stderr.on('data', data => process.stderr.write(data))
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#files[data-project-name^="Call Me Again Tomorrow"]').waitFor({ timeout: 60000 })
  await page.locator('#tab-console').click()
  await page.locator('.dock-separator[data-split-id="main"]').dblclick()
  await page.locator('#files').focus()
  await page.keyboard.press('ControlOrMeta+f')
  await page.locator('#file-search').fill('prologue-arrival.qs')
  await page.locator('#files .tree-label').getByText('prologue-arrival.qs', { exact: true }).click()
  await page.locator('#document-name').filter({ hasText: 'prologue-arrival.qs' }).waitFor()
  await page.locator('#dialogue-legend').filter({ hasText: 'Mara' }).waitFor({ timeout: 60000 })
  await page.locator('#check-indicator[data-phase="complete"]').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('#diagnostic-count').evaluate(element => element.classList.contains('has-errors')), false)
  await sampleMemory('editor')
  process.stdout.write('Editor: project and QuaScript document opened\n')
  await page.locator('#target').selectOption('web')
  await page.locator('#run').click()
  await waitForPreview(page, 'running', 'web', 90000)
  await page.locator('#logs .log-line').first().waitFor({ timeout: 30000 })
  assert.ok(await page.locator('#logs .log-line[data-target="web"]').count() > 0, 'Web logs carry a source marker')
  await page.screenshot({ path: resolve(artifacts, 'console-logs.png') })
  let webText = ''
  const webDeadline = Date.now() + 45000
  while (webText.length <= 10 && Date.now() < webDeadline) {
    webText = await application.evaluate(async ({ webContents }) => {
      const game = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:'))
      if (!game)
        throw new Error('No embedded Web game')
      return game.executeJavaScript('document.body.innerText')
    })
    if (webText.length <= 10)
      await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(webText.length > 10)
  await page.waitForTimeout(2500)
  const webPng = await application.evaluate(async ({ webContents }) => {
    const game = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:'))
    return (await game.capturePage()).toPNG().toString('base64')
  })
  await writeFile(resolve(artifacts, 'web-game.png'), Buffer.from(webPng, 'base64'))
  await capture(application, 'web')
  await sampleMemory('web')
  const gameWindow = await application.evaluateHandle(({ webContents }) => webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:')))
  const webSettingsPoint = await gameWindow.evaluate(game => game.executeJavaScript(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === '设置');
    const rect = button.getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  })()`))
  await gameWindow.evaluate((game, point) => {
    game.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
    game.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  }, webSettingsPoint)
  await page.waitForTimeout(1000)
  assert.ok((await gameWindow.evaluate(game => game.executeJavaScript('document.body.innerText'))).includes('文字显示速度'))
  await gameWindow.dispose()
  process.stdout.write('Web: embedded title displayed; pointer opened settings\n')
  await page.locator('#tab-assets').click()
  await page.locator('#asset-type').selectOption('image')
  await page.locator('.asset-card').first().click()
  await page.waitForFunction(() => document.querySelector('#asset-details img')?.naturalWidth > 0, undefined, { timeout: 30000 })
  await page.locator('.dock-separator[data-split-id="main"]').focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(400)
  const expectedBounds = await page.locator('#preview').boundingBox()
  const actualBounds = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds())
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(expectedBounds[key] - actualBounds[key]) <= 1, `Embedded Web ${key} follows panel resizing`)
  await capture(application, 'web-assets')
  await page.locator('#tab-console').click()
  process.stdout.write('Workbench: Demo media decoded; resized Assets Browser kept embedded Web bounds aligned\n')
  await verifyEditorControl(page, 'web')
  // Window.capturePage may omit child WebContentsViews on macOS. Capture the
  // actual game surface as well, and require rendered dialogue after stepping.
  const seekGame = await application.evaluateHandle(({ webContents }) => webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:')))
  let dialogue = ''
  for (let attempt = 0; attempt < 100; attempt++) {
    dialogue = await seekGame.evaluate(game => game.executeJavaScript('document.querySelector(".qua-dialogue-text")?.textContent || ""'))
    if (dialogue.length > 12)
      break
    await page.waitForTimeout(100)
  }
  assert.ok(dialogue.length > 12, 'Web preview must visibly project the stepped dialogue')
  const seekPng = await seekGame.evaluate(async game => (await game.capturePage()).toPNG().toString('base64'))
  await writeFile(resolve(artifacts, 'web-seek-game.png'), Buffer.from(seekPng, 'base64'))
  await seekGame.dispose()
  await capture(application, 'web-seek')
  await page.locator('#settings-button').click()
  await page.locator('#settings-dialog').waitFor()
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds().width), 0)
  await page.locator('#settings-dialog').getByRole('button', { name: '关闭设置', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+p')
  await page.locator('#quick-open[open]').waitFor()
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds().width), 0)
  await page.keyboard.press('Escape')
  await page.locator('#quick-open').waitFor({ state: 'hidden' })
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds().width > 0))
      break
    await page.waitForTimeout(100)
  }
  assert.ok(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds().width > 0))
  process.stdout.write('Quick Open: modal hid the embedded Web view and restored it on Escape\n')
  if (process.argv.includes('--native')) {
    await page.locator('#target').selectOption('native')
    await page.locator('#preview-progress').waitFor()
    await page.screenshot({ path: resolve(artifacts, 'native-build-progress.png') })
    await waitForPreview(page, 'running', 'native', 900000)
    await page.locator('#preview-progress').waitFor({ state: 'hidden' })
    await page.locator('#native-surface').waitFor({ state: 'visible', timeout: 45000 })
    await page.waitForTimeout(2000)
    await capture(application, 'native')
    const endpoint = (await page.locator('#logs').textContent()).match(/Native control: (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
    assert.ok(endpoint)
    const cdp = await connectNative(endpoint)
    try {
      const { commands } = await cdp.call('Qua.listCommands')
      const settings = commands.find(command => command.text?.includes('设置'))
      assert.ok(settings, 'Native title must expose settings')
      await clickNativeCommand(page, cdp, settings)
      await waitNativeCommand(page, cdp, command => command.text?.includes('文字显示速度'))
      await page.waitForTimeout(500)
      await capture(application, 'native-settings')
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 800))
      await page.waitForTimeout(500)
      await clickNativeCommand(page, cdp, await waitNativeCommand(page, cdp, command => command.text === '关闭'))
      await clickNativeCommand(page, cdp, await waitNativeCommand(page, cdp, command => command.text === '从头开始'))
      const firstDialogue = await waitNativeCommand(page, cdp, command => command.id === 'dialogue:text' && command.text?.length > 0)
      await page.waitForTimeout(2000)
      await clickNativeCommand(page, cdp, firstDialogue)
      await waitNativeCommand(page, cdp, command => command.id === 'dialogue:text' && command.text?.length > 0 && command.text !== firstDialogue.text)
      await page.waitForTimeout(1000)
      await capture(application, 'native-story')
      await sampleMemory('native')
      process.stdout.write('Native: GPU title/settings displayed; resized canvas clicks started and advanced story\n')
      await verifyEditorControl(page, 'native')
      const previewLine = await waitNativeCommand(page, cdp, command => command.id === 'dialogue:text' && command.text?.length > 0)
      assert.ok(previewLine.text.length > 3)
      await capture(application, 'native-seek')
      await assert.rejects(() => cdp.call('Qua.editorCommand', { command: { action: 'step' }, requestId: 'unauthorized' }), /not authorized/)
    }
    finally { cdp.close() }
    await page.locator('#target').selectOption('web')
    await waitForPreview(page, 'running', 'web', 90000)
    process.stdout.write('Native → Web: replacement completed\n')
  }
  await page.locator('#stop').click()
  await waitForPreview(page, 'idle', undefined, 10000)
  const views = await application.evaluate(({ webContents }) => webContents.getAllWebContents().filter(contents => contents.getURL().startsWith('http://127.0.0.1:')).length)
  assert.equal(views, 0)
  assert.deepEqual(errors, [])
  if (process.argv.includes('--native')) {
    await page.locator('#target').selectOption('native')
    await page.locator('#run').click()
    await waitForPreview(page, 'starting', 'native', 5000)
    await page.locator('#stop').click()
    await waitForPreview(page, 'idle', undefined, 10000)
    assert.equal(await page.locator('#status').evaluate(element => element.classList.contains('error')), false)
    process.stdout.write('Cancellation: native startup stopped without a stale error\n')
  }
  await page.waitForTimeout(1000)
  if (process.platform !== 'win32') {
    const processes = await processSnapshot()
    for (const pid of previewPids)
      assert.ok(!processes.some(item => item.pid === pid), `Preview process ${pid} survived stop`)
  }
  await sampleMemory('stopped')
  await writeFile(resolve(artifacts, 'metrics.json'), JSON.stringify(metrics, null, 2))
  process.stdout.write('Stop: preview process trees and Web content released; no editor page errors\n')
}
catch (error) {
  await capture(application, 'failure').catch(() => {})
  const page = await application.firstWindow()
  await writeFile(resolve(artifacts, 'failure.log'), await page.locator('#logs').textContent({ timeout: 1000 }).catch(() => 'Logs unavailable')).catch(() => {})
  throw error
}
finally {
  await application.close()
  await rm(temporary, { recursive: true, force: true })
}

async function capture(application, name) {
  const page = await application.firstWindow()
  const state = await page.evaluate(() => window.quaEditor.previewState())
  if (state.identity?.target === 'native' && state.phase === 'running') {
    await captureNativeWindow(application, page, resolve(artifacts, `${name}.png`))
    return
  }
  const png = await application.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].capturePage()
    return image.toPNG().toString('base64')
  })
  await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(png, 'base64'))
}

async function waitForPreview(page, phase, target, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.quaEditor.previewState())
    if (state.phase === phase && (!target || state.identity?.target === target))
      return
    if (state.phase === 'error')
      throw new Error(`${state.error}\n${await page.locator('#logs').textContent()}`)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Preview timeout: ${await page.locator('#logs').textContent()}`)
}

async function connectNative(endpoint) {
  const ws = new WebSocket(`${endpoint.replace('http:', 'ws:')}/devtools/page/qua-native`)
  let nextId = 0
  const pending = new Map()
  ws.addEventListener('message', ({ data }) => {
    const response = JSON.parse(data)
    const request = pending.get(response.id)
    if (!request)
      return
    pending.delete(response.id)
    clearTimeout(request.timer)
    if (response.error)
      request.reject(new Error(response.error.message))
    else request.resolve(response.result)
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  return {
    call: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, 10000)
      pending.set(id, { resolve, reject, timer })
      ws.send(JSON.stringify({ id, method, params }))
    }),
    close: () => ws.close(),
  }
}

async function clickNativeCommand(page, cdp, command) {
  const { nodeId } = await cdp.call('DOM.querySelector', { nodeId: 1, selector: `#${command.id}` })
  const { quads } = await cdp.call('DOM.getContentQuads', { nodeId })
  const { cssLayoutViewport } = await cdp.call('Page.getLayoutMetrics')
  const box = await page.locator('#native-surface').boundingBox()
  const [x1, y1, x2, , , y3] = quads[0]
  await page.locator('#native-surface').click({ position: {
    x: (x1 + x2) / 2 / cssLayoutViewport.clientWidth * box.width,
    y: (y1 + y3) / 2 / cssLayoutViewport.clientHeight * box.height,
  } })
}

async function waitNativeCommand(page, cdp, predicate) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const { commands } = await cdp.call('Qua.listCommands')
    const found = commands.find(predicate)
    if (found)
      return found
    await page.waitForTimeout(250)
  }
  throw new Error('Expected native command did not appear')
}

async function processSnapshot() {
  const { stdout } = await promisify(execFile)('ps', ['-axo', 'pid=,ppid=,rss=,comm='])
  return stdout.trim().split('\n').map((line) => {
    const [, pid, parent, rss, command] = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S.*)$/)
    return { pid: Number(pid), parent: Number(parent), rssKiB: Number(rss), command }
  })
}

async function sampleMemory(phase) {
  if (process.platform === 'win32')
    return
  const processes = await processSnapshot()
  const owned = new Set([application.process().pid])
  let count = 0
  while (count !== owned.size) {
    count = owned.size
    for (const item of processes) {
      if (owned.has(item.parent))
        owned.add(item.pid)
    }
  }
  const tree = processes.filter(item => owned.has(item.pid))
  const basePids = new Set(metrics[0]?.processes.map(item => item.pid) ?? [])
  for (const item of tree) {
    if (phase !== 'editor' && !basePids.has(item.pid) && !item.command.includes('Electron'))
      previewPids.add(item.pid)
  }
  const rssMiB = Math.round(tree.reduce((total, item) => total + item.rssKiB, 0) / 1024)
  metrics.push({ phase, rssMiB, processes: tree })
  process.stdout.write(`${phase}: process-tree RSS ${rssMiB} MiB (shared pages may be counted more than once)\n`)
}

async function verifyEditorControl(page, target) {
  const location = await page.evaluate(async () => {
    const project = await window.quaEditor.currentProject()
    const path = 'src/game/scenes/prologue-arrival.qs'
    const file = await window.quaEditor.readDocument(path)
    const analysis = await window.quaEditor.analyzeDocument(file.path, file.text)
    const target = analysis.previewSteps.find(step => step.endLine >= analysis.previewSteps[3].line) || analysis.previewSteps.at(-1)
    return { path, root: project.root, ...target }
  })
  await page.locator('#editor').click({ position: { x: 120, y: 25 } })
  await page.keyboard.press('Control+g')
  await page.locator('.quick-input-widget input').fill(`:${location.line}`)
  await page.keyboard.press('Enter')
  await page.locator('#cursor-position').filter({ hasText: `行 ${location.line}，` }).waitFor()
  await page.locator('#preview-seek').click()
  await page.locator('#status').filter({ hasText: '已定位到目标步骤' }).waitFor({ timeout: 120000 })
  const current = await page.evaluate(async () => {
    const state = await window.quaEditor.previewState()
    return window.quaEditor.previewCommand(state.identity.sessionId, { action: 'status' })
  })
  assert.equal(current.path, location.path)
  assert.equal(current.stepIndex, location.index)
  await page.locator('#editor').click({ position: { x: 120, y: 25 } })
  await page.keyboard.press('F10')
  await page.locator('#status').filter({ hasText: '已前进一个对话步骤' }).waitFor({ timeout: 15000 })
  const next = await page.evaluate(async () => {
    const state = await window.quaEditor.previewState()
    return window.quaEditor.previewCommand(state.identity.sessionId, { action: 'status' })
  })
  assert.ok(next.stepIndex > current.stepIndex)
  process.stdout.write(`${target}: engine checkpoint seek to AST step ${current.stepIndex} and F10 to ${next.stepIndex} passed\n`)
}
