import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

// Real local POSIX shell acceptance. Run ConPTY acceptance on Windows separately.
if (process.platform === 'win32')
  throw new Error('This fixture uses POSIX shell commands; Windows needs its own acceptance run.')
const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await mkdtemp(join(tmpdir(), 'qua-terminal-smoke-'))
const artifacts = join(root, '.codex-tmp/editor-terminal-smoke')
const first = join(temporary, 'first')
const second = join(temporary, 'second')
for (const [path, name] of [[first, 'Terminal fixture'], [second, 'Terminal replacement']]) {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name, bundleId: 'dev.qua.terminal.fixture', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(path, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { 'dev:web': 'vite' } }))
  await writeFile(join(path, 'scene.qs'), '@Scene("test")\nNarrator: hello terminal\n')
}
await mkdir(artifacts, { recursive: true })
const env = { ...process.env, SHELL: '/bin/sh' }
delete env.ELECTRON_RUN_AS_NODE
const application = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', first, `--user-data-dir=${join(temporary, 'profile')}`], env, timeout: 60000 })
const page = await application.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const samples = {}
try {
  await page.locator('#files[data-project-name="Terminal fixture"]').waitFor({ timeout: 30000 })
  const terminalProcesses = () => application.evaluate(({ app }) => app.getAppMetrics().filter(metric => metric.name === 'QuaEngine Terminal'))
  assert.equal((await terminalProcesses()).length, 0, 'no PTY utility process before opening terminal')
  assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => /terminal-panel.*\.js/u.test(entry.name))), false, 'xterm must load lazily')
  await page.evaluate(() => {
    window.terminalCapture = []
    window.quaEditor.onTerminalEvent((event) => {
      // Bound fixture capture too; stress output is intentionally larger.
      window.terminalCapture.push(event)
      if (window.terminalCapture.length > 300)
        window.terminalCapture.shift()
    })
  })
  await page.locator('#tab-terminal').click()
  await page.locator('.terminal-instance .xterm-helper-textarea').waitFor({ timeout: 15000 })
  assert.equal((await terminalProcesses()).length, 1)
  const firstId = await page.locator('#terminal-sessions').inputValue()
  await command('stty -echo; printf "\\033[32m你好 QuaEngine terminal\\033[0m\\n"; pwd; test -t 0 && printf "TTY_ACTIVE\\n"')
  await output('TTY_ACTIVE')
  assert.ok(await page.locator('.terminal-instance:not([hidden]) .xterm-rows').textContent().then(text => text.includes('你好 QuaEngine terminal')))
  await page.locator('#panel-terminal').screenshot({ path: join(artifacts, 'terminal.png') })
  await command('sleep 120')
  await page.keyboard.press('Control+c')
  await command('printf "INTERRUPTED_OK\\n"')
  await output('INTERRUPTED_OK')
  await application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'R', modifiers: ['control'] })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'R' })
  })
  assert.equal(await page.locator('#terminal-sessions').inputValue(), firstId, 'Ctrl+R must not reload the workbench')
  await page.keyboard.press('Control+c')
  await command('printf "AFTER_HISTORY\\n"')
  await output('AFTER_HISTORY')

  // Resize through the real splitter; stty observes the PTY dimensions.
  const splitter = await page.locator('.dock-separator[data-split-id="main"]').boundingBox()
  await page.mouse.move(splitter.x + 20, splitter.y + 2)
  await page.mouse.down()
  await page.mouse.move(splitter.x + 20, splitter.y - 100, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  await command('stty size > terminal-size.txt')
  await until(async () => Boolean(await readFile(join(first, 'terminal-size.txt'), 'utf8').catch(() => '')))
  const [rows, cols] = (await readFile(join(first, 'terminal-size.txt'), 'utf8')).trim().split(/\s+/u).map(Number)
  assert.ok(rows > 10 && cols > 80)

  await page.keyboard.press('Control+Shift+Backquote')
  await page.waitForFunction(() => document.querySelector('#terminal-sessions').options.length === 2)
  const sidebar = await page.locator('.terminal-tabs').boundingBox()
  const viewport = await page.locator('.terminal-viewport').boundingBox()
  const tabRects = await page.locator('.terminal-tab').evaluateAll(tabs => tabs.map(tab => tab.getBoundingClientRect().toJSON()))
  assert.ok(sidebar.x >= viewport.x + viewport.width, 'session list is on the right')
  assert.ok(tabRects[1].y > tabRects[0].y && tabRects[1].x === tabRects[0].x, 'sessions stack vertically')
  const secondId = await page.locator('#terminal-sessions').inputValue()
  await page.locator('.terminal-tab').nth(1).focus()
  await page.keyboard.press('ArrowUp')
  assert.equal(await page.locator('#terminal-sessions').inputValue(), firstId)
  await page.keyboard.press('ArrowDown')
  assert.equal(await page.locator('#terminal-sessions').inputValue(), secondId)
  await page.locator('#panel-terminal').screenshot({ path: join(artifacts, 'terminal-sessions-right.png') })
  assert.notEqual(firstId, secondId)
  await command('stty -echo; printf "SECOND_SESSION\\n"')
  await output('SECOND_SESSION')
  await page.locator('#terminal-sessions').selectOption(firstId)
  await command('printf "FIRST_RETAINED\\n"')
  await output('FIRST_RETAINED')

  await page.evaluate(() => {
    window.terminalFrames = []
    let previous = performance.now()
    window.measureFrames = true
    const tick = (now) => {
      window.terminalFrames.push(now - previous)
      previous = now
      if (window.measureFrames)
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const stressStarted = Date.now()
  await command('awk \'BEGIN { for(i=0;i<40000;i++) print "output load 0123456789 中文"; print "STRESS_COMPLETE" }\'')
  await page.locator('#tab-console').click()
  await page.waitForTimeout(80)
  await page.evaluate(() => {
    window.hiddenIntersections = []
    new IntersectionObserver(entries => window.hiddenIntersections.push(...entries.map(e => ({ intersecting: e.isIntersecting, rect: e.boundingClientRect.toJSON() })))).observe(document.querySelector('.terminal-instance:not([hidden]) .xterm-screen'))
    window.hiddenTerminalMutations = 0
    window.hiddenObserver = new MutationObserver((records) => {
      window.hiddenTerminalMutations += records.length
    })
    window.hiddenObserver.observe(document.querySelector('.terminal-instance:not([hidden]) .xterm-rows'), { childList: true, subtree: true, characterData: true })
  })
  await output('STRESS_COMPLETE', 20000)
  samples.hiddenDomMutations = await page.evaluate(() => {
    window.hiddenObserver.disconnect()
    return window.hiddenTerminalMutations
  })
  samples.hiddenIntersections = await page.evaluate(() => window.hiddenIntersections)
  process.stdout.write(`${JSON.stringify(samples)}\n`)
  assert.equal(samples.hiddenDomMutations, 0, 'hidden terminal must not redraw output')
  samples.hiddenOutputMs = Date.now() - stressStarted
  await page.evaluate(() => {
    window.measureFrames = false
  })
  samples.frameGaps = await page.evaluate(() => {
    const values = window.terminalFrames.slice(2).sort((a, b) => a - b)
    return { count: values.length, p95: values[Math.floor(values.length * 0.95)], max: Math.max(...values) }
  })
  samples.utility = await terminalProcesses()
  await page.locator('#tab-terminal').click()
  await page.waitForFunction(() => document.querySelector('.terminal-instance:not([hidden]) .xterm-rows')?.textContent.includes('STRESS_COMPLETE'))
  assert.ok(await page.locator('.terminal-instance .xterm-rows > div').count() < 250, 'terminal DOM bounded by viewport, not output size')
  await page.locator('#terminal-clear').click()
  await command('printf "READY_FOR_BUILD\\n"')
  await output('READY_FOR_BUILD')
  await page.screenshot({ path: join(artifacts, 'workbench-terminal.png') })

  await command('sleep 120 & echo $! > child.pid')
  await until(async () => Boolean(await readFile(join(first, 'child.pid'), 'utf8').catch(() => '')))
  const child = Number(await readFile(join(first, 'child.pid'), 'utf8'))
  await page.locator('#terminal-kill').click()
  await page.waitForFunction(() => document.querySelector('#terminal-sessions').options.length === 1)
  await gone(child)
  assert.equal(await page.locator('#terminal-sessions').inputValue(), secondId)
  await command('exit 9')
  await page.waitForFunction(() => document.querySelector('#terminal-sessions').textContent.includes('已退出，代码 9'))
  await page.locator('#terminal-kill').click()
  await page.locator('#terminal-new').click()
  await page.waitForFunction(() => document.querySelector('#terminal-sessions').options.length === 1)
  await command('sleep 120 & echo $! > switch.pid')
  await until(async () => Boolean(await readFile(join(first, 'switch.pid'), 'utf8').catch(() => '')))
  const switchChild = Number(await readFile(join(first, 'switch.pid'), 'utf8'))
  await application.evaluate(({ dialog }, next) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [next] })
  }, second)
  await application.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'O', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'O' })
  })
  await page.locator('#files[data-project-name="Terminal replacement"]').waitFor()
  await gone(switchChild)
  await page.waitForFunction(() => document.querySelector('#terminal-sessions').options.length === 1)
  await command('sleep 120 & echo $! > reload.pid')
  await until(async () => Boolean(await readFile(join(second, 'reload.pid'), 'utf8').catch(() => '')))
  const reloadChild = Number(await readFile(join(second, 'reload.pid'), 'utf8'))
  await page.reload()
  await gone(reloadChild)
  await page.locator('#files[data-project-name="Terminal replacement"]').waitFor()
  await page.waitForFunction(() => document.querySelector('#terminal-sessions')?.options.length === 1)
  assert.equal((await terminalProcesses()).length, 1, 'restored visible terminal starts a fresh shell')
  await page.locator('#tab-terminal').click()
  await page.waitForFunction(() => document.querySelector('#terminal-sessions')?.options.length === 1)
  await command('sleep 120 & echo $! > close.pid')
  await until(async () => Boolean(await readFile(join(second, 'close.pid'), 'utf8').catch(() => '')))
  const closeChild = Number(await readFile(join(second, 'close.pid'), 'utf8'))
  assert.deepEqual(errors, [])
  await writeFile(join(artifacts, 'samples.json'), JSON.stringify(samples, null, 2))
  await page.evaluate(() => window.quaEditor.windowAction('close')).catch(() => {})
  await gone(closeChild)
  process.stdout.write(`Terminal acceptance passed: ${JSON.stringify(samples)}\n`)
}
catch (error) {
  const failure = await page.evaluate(async () => ({ status: document.querySelector('#status')?.textContent, project: (await window.quaEditor.currentProject())?.root, terminal: document.querySelector('#terminal-sessions')?.textContent, captured: window.terminalCapture?.slice(-4).map(event => ({ ...event, data: event.data?.slice(-250) })) })).catch(() => ({}))
  process.stderr.write(`${JSON.stringify(failure)}\n`)
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await application.close().catch(() => {})
  await rm(temporary, { recursive: true, force: true })
}

async function command(text) {
  await page.locator('.terminal-instance:not([hidden]) .xterm-helper-textarea').focus()
  await page.keyboard.insertText(text)
  await page.keyboard.press('Enter')
}
async function output(text, timeout = 8000) {
  await page.waitForFunction(needle => window.terminalCapture.filter(event => event.type === 'data').map(event => event.data).join('').includes(needle), text, { timeout })
  await page.waitForTimeout(40)
}
async function until(check) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (await check())
      return
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  throw new Error('Terminal acceptance condition timed out')
}
async function gone(pid) {
  await until(() => {
    try {
      process.kill(pid, 0)
    }
    catch { return true }
    return false
  })
}
