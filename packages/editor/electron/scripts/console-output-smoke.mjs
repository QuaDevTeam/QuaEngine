import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editor = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editor, 'package.json'))
const project = await realpath(await mkdtemp(join(tmpdir(), 'qua-console-output-')))
const artifacts = resolve(root, '.codex-tmp/editor-console-output')
await mkdir(artifacts, { recursive: true })
await writeFile(join(project, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Console output', bundleId: 'dev.qua.console', targets: { web: { enabled: true } } }))
await writeFile(join(project, 'package.json'), JSON.stringify({ scripts: { 'dev:web': 'node output.mjs' } }))
await copyFile(new URL('../test/fixtures/process-output.mjs', import.meta.url), join(project, 'output.mjs'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
let page
const errors = []
try {
  app = await _electron.launch({ executablePath: require('electron'), args: [editor, '--project', project, `--user-data-dir=${join(project, '.profile')}`], env, timeout: 60000 })
  page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#run:not([disabled])').waitFor({ timeout: 60000 })
  await page.locator('#tab-console').click()
  await page.evaluate(() => {
    window.consoleOutput = ''
    window.quaEditor.onLog(({ message }) => {
      window.consoleOutput += message
    })
  })
  await page.locator('#run').click()
  await page.waitForFunction(() => window.consoleOutput.includes('OUTPUT_COMPLETE'))
  const output = await page.evaluate(() => window.consoleOutput)
  assert.ok(output.includes('WARN stderr survives\n\ntransforming (12) 中文模块\nbuilt in 375ms\nproject link\n'))
  assert.ok(output.includes('literal [2K and \\u001B[31m stay text\n'))
  assert.equal(output.includes('\u001B'), false)
  assert.doesNotMatch(output, /\r|hidden window title|https:\/\/example.test/u)
  const tree = page.locator('#logs .console-json > details')
  await tree.waitFor()
  assert.equal(await tree.getAttribute('open'), null)
  await tree.locator(':scope > summary').click()
  const nested = tree.locator(':scope > .console-json-children > details').filter({ has: page.locator('summary', { hasText: 'nested:' }) }).first()
  await nested.locator(':scope > summary').click()
  await page.locator('#logs .console-json-string').filter({ hasText: '<img src=x>' }).waitFor()
  assert.equal(await page.locator('#logs img').count(), 0)
  assert.match(await page.locator('#logs').textContent(), /transforming \(12\) 中文模块/u)
  assert.doesNotMatch(await page.locator('#logs').textContent(), /\[2K(?:transforming|built)|hidden window title/u)
  await page.waitForFunction(async () => (await window.quaEditor.previewState()).phase === 'running')
  await app.evaluate(async ({ BrowserWindow, webContents }) => {
    const editors = new Set(BrowserWindow.getAllWindows().map(window => window.webContents.id))
    const preview = webContents.getAllWebContents().find(contents => !editors.has(contents.id) && contents.getURL().startsWith('http://127.0.0.1:'))
    if (!preview)
      throw new Error('Missing real Web preview')
    await fetch(new URL('/more', preview.getURL()))
  })
  await page.waitForFunction(() => window.consoleOutput.includes('additional output'))
  assert.equal(await tree.getAttribute('open'), '')
  assert.equal(await nested.getAttribute('open'), '')
  await page.screenshot({ path: join(artifacts, 'console.png') })
  await page.locator('#stop').click()
  await page.waitForFunction(async () => (await window.quaEditor.previewState()).phase === 'idle')
  await page.locator('#clear-log').click()
  assert.equal(await page.locator('#logs').textContent(), '')
  assert.deepEqual(errors, [])
  const report = { platform: process.platform, source: 'real preview child stdout/stderr', splitControls: true, literalTextPreserved: true, structuredJson: true, retainedExpansion: true, clear: true, errors }
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
catch (error) {
  await page?.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await app?.close()
  await rm(project, { recursive: true, force: true })
}
