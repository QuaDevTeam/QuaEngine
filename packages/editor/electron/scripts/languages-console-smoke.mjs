import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const project = await realpath(await mkdtemp(join(tmpdir(), 'qua-source-languages-')))
const artifacts = resolve(root, '.codex-tmp/editor-languages-console-smoke')
await mkdir(artifacts, { recursive: true })
const files = {
  'qua.project.json': JSON.stringify({ schemaVersion: 1, name: 'Source languages', bundleId: 'dev.qua.source.languages', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }),
  'package.json': JSON.stringify({ scripts: { 'dev:web': 'vite' } }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, types: [] }, include: ['*.ts'] }),
  'app.ts': 'export const title: string = "Rain"\n',
  'app.js': 'export const title = "Rain"\n',
  'data.json': '{"rain":true,"items":[1,2]}',
  'data.yaml': 'rain: true\nitems: [1, 2]\n',
  'notes.md': '# Rain\n\n[return](#rain)\n\nA **bold** line.\n',
}
for (const [name, text] of Object.entries(files)) await writeFile(join(project, name), text)
// Ensure a nontrivial background program runs while interactive reads proceed.
for (let i = 0; i < 180; i++) await writeFile(join(project, `check-${i}.ts`), `export const n${i}: number = ${i}\n`)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const application = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, `--user-data-dir=${join(project, '.editor-profile')}`, '--project', project], env, timeout: 60000 })
const page = await application.firstWindow()
const errors = []
page.on('pageerror', (error) => {
  errors.push(error.message)
  process.stderr.write(`${error.stack}\n`)
})
const samples = []
try {
  await page.locator('#files[data-project-name="Source languages"]').waitFor()
  await page.evaluate(() => {
    window.readSamples = []
  })
  // Measure the same production IPC path used by opening tabs during actual background checks.
  await page.evaluate(async (root) => {
    await new Promise((resolve, reject) => {
      let timer
      const stop = window.quaEditor.onProjectCheck((check) => {
        if (check.root === root && check.phase === 'checking') {
          clearTimeout(timer)
          stop()
          resolve()
        }
      })
      timer = setTimeout(() => {
        stop()
        reject(new Error('Background check did not start'))
      }, 30000)
      void window.quaEditor.checkProject(root).catch(reject)
    })
    for (const name of ['notes.md', 'app.ts', 'app.js', 'data.yaml', 'data.json']) {
      const start = performance.now()
      await window.quaEditor.readDocument(name)
      window.readSamples.push({ file: name, readMs: performance.now() - start })
    }
  }, project)
  samples.push(...await page.evaluate(() => window.readSamples))
  for (const name of ['notes.md', 'app.ts', 'app.js', 'data.yaml', 'data.json']) {
    // Quick Open handles virtualized files without depending on row scroll position.
    await page.keyboard.press('ControlOrMeta+p')
    await page.locator('#quick-open-input').fill(name)
    await page.locator(`#quick-open-results [data-path="${name}"]`).waitFor()
    const start = Date.now()
    await page.keyboard.press('Enter')
    await page.locator('#document-name').filter({ hasText: name }).waitFor()
    samples.find(item => item.file === name).openMs = Date.now() - start
    const colored = await page.waitForFunction((text) => {
      const content = document.querySelector('#editor .view-lines')?.textContent.replace(/\s/gu, '') || ''
      if (!content.includes(text.split('\n')[0].replace(/\s/gu, '')))
        return false
      const colors = [...new Set([...document.querySelectorAll('#editor .view-lines span[class^="mtk"]')].map(span => getComputedStyle(span).color))]
      return colors.length > 1 ? colors : false
    }, files[name])
    assert.ok((await colored.jsonValue()).length > 1, `${name} is syntax colored`)
    assert.equal(await page.locator('#format').isEnabled(), true)
  }
  await writeFile(join(artifacts, 'measurements.json'), JSON.stringify({ samples }, null, 2))
  // Exercise actual Monaco provider wiring, not only raw language IPC.
  await page.locator('.document-tab[data-path="app.ts"] [role="tab"]').click()
  await page.locator('#document-name').filter({ hasText: 'app.ts' }).waitFor()
  await page.locator('#editor').click({ position: { x: 120, y: 25 } })
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.insertText('title.toU')
  await page.keyboard.press('Control+Space')
  await page.locator('.suggest-widget.visible').waitFor({ timeout: 30000 })
  await page.locator('.suggest-widget .monaco-list-row').filter({ hasText: 'toUpperCase' }).first().waitFor()
  await page.screenshot({ path: join(artifacts, 'typescript-completion.png') })
  await page.keyboard.press('Escape')
  await page.locator('.document-tab[data-path="data.json"] [role="tab"]').click()
  await page.locator('#format').click()
  await page.waitForFunction(() => document.querySelectorAll('#editor .view-line').length > 1)
  await page.keyboard.press('ControlOrMeta+z')
  await page.locator('#tab-console').click()
  const payload = JSON.stringify({ nested: { count: 42, safe: '<img src=x onerror=alert(1)>' }, rows: Array.from({ length: 3500 }, (_, i) => ({ i, value: `Row ${i}` })) }, null, 2)
  assert.ok(payload.length > 64000, 'large JSON exceeds the previous raw-log limit')
  const identity = { target: 'native', sessionId: 'console-fixture', buildRevision: 'fixture' }
  await application.evaluate(({ BrowserWindow }, { identity, payload }) => {
    const view = BrowserWindow.getAllWindows()[0].webContents
    for (let i = 0; i < payload.length; i += 16384) view.send('editor:log', { identity, message: payload.slice(i, i + 16384) })
    view.send('editor:log', { identity, message: '\n' })
  }, { identity, payload })
  const tree = page.locator('#logs .console-json > details')
  await tree.waitFor()
  assert.equal(await tree.getAttribute('open'), null)
  assert.equal(await page.locator('#logs details').count(), 1, 'children are lazy')
  await tree.locator(':scope > summary').click()
  const nested = tree.locator(':scope > .console-json-children > details').filter({ has: page.locator('summary', { hasText: 'nested:' }) }).first()
  await nested.locator(':scope > summary').click()
  await page.locator('#logs .console-json-string').filter({ hasText: '<img' }).waitFor()
  assert.equal(await page.locator('#logs img').count(), 0)
  const array = tree.locator(':scope > .console-json-children > details').filter({ has: page.locator('summary', { hasText: 'rows:' }) }).first()
  await array.locator(':scope > summary').click()
  await array.locator('.console-json-more').waitFor()
  assert.equal(await array.locator(':scope > .console-json-children > details').count(), 100)
  await array.locator('.console-json-more').click()
  assert.equal(await array.locator(':scope > .console-json-children > details').count(), 200)
  await application.evaluate(({ BrowserWindow }, identity) => BrowserWindow.getAllWindows()[0].webContents.send('editor:log', { identity, message: 'next ordinary line\n' }), identity)
  assert.equal(await tree.getAttribute('open'), '')
  assert.equal(await nested.getAttribute('open'), '')
  await array.locator(':scope > summary').click()
  await page.screenshot({ path: join(artifacts, 'json-tree.png') })
  // UI lifecycle fixture: transport is injected, actual build-stage parser is unit tested.
  await application.evaluate(({ BrowserWindow }, identity) => BrowserWindow.getAllWindows()[0].webContents.send('editor:preview-changed', { phase: 'starting', identity, progress: { stage: 'assets', label: '打包资源与 QPK', detail: 'quack workspace:bundle --all' } }), identity)
  await page.locator('#preview-progress').waitFor()
  assert.equal(await page.locator('#preview-progress progress').getAttribute('value'), null)
  await page.screenshot({ path: join(artifacts, 'native-progress.png') })
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('editor:preview-changed', { phase: 'idle' }))
  await page.locator('#preview-progress').waitFor({ state: 'hidden' })
  await page.locator('#clear-log').click()
  assert.equal(await page.locator('#logs details').count(), 0)
  assert.equal(await page.locator('#logs').textContent(), '')
  assert.deepEqual(errors, [])
  await writeFile(join(artifacts, 'measurements.json'), JSON.stringify({ samples, scope: 'Local Electron fixture: reads during actual background checking; tab-open timings include Playwright interaction.' }, null, 2))
  process.stdout.write(`Source languages, JSON tree and progress UI passed. ${JSON.stringify(samples)}\n`)
}
catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }).catch(() => {})
  await application.close()
  await rm(project, { recursive: true, force: true })
}
