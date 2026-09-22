import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { copyDemoFixture } from './demo-fixture.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const profile = await mkdtemp(join(tmpdir(), 'qua-inspector-'))
const target = process.argv.includes('--native') ? 'native' : 'web'
const artifacts = resolve(root, '.codex-tmp/editor-inspector-smoke')
await mkdir(artifacts, { recursive: true })
const projectRoot = await copyDemoFixture(root, join(profile, 'project'), { native: target === 'native' })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', projectRoot, `--user-data-dir=${profile}`], env, timeout: 60000 })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.locator('#files[data-project-name^="Call Me Again Tomorrow"]').waitFor({ timeout: 30000 })
  await page.locator('#target').selectOption(target)
  await page.locator('#preview-mute').click()
  await page.locator('#run').click()
  await waitState(state => state.phase === 'running' && !state.reloading)
  await page.evaluate(async () => {
    const state = await window.quaEditor.previewState()
    await window.quaEditor.previewCommand(state.identity.sessionId, { action: 'seek', path: 'src/game/scenes/prologue-arrival.qs', stepIndex: 5 })
  })
  await page.locator('#tab-inspector').click()
  await page.locator('#inspector-tree [role="treeitem"]').first().waitFor({ timeout: 20000 })
  await page.screenshot({ path: join(artifacts, `${target}-elements.png`) })
  const filter = page.locator('#inspector-filter')
  await filter.fill(target === 'web' ? 'qua-dialogue-text' : 'dialogue:text')
  await page.locator('#inspector-tree').press('End')
  await page.waitForFunction(() => document.querySelector('#inspector-tree').textContent.includes('已经生锈'), undefined, { timeout: 15000 })
  await page.locator('#inspector-live').uncheck()
  await page.locator('#inspector-tree').press('End')
  await page.locator('#inspector-details .inspector-box').waitFor({ timeout: 10000 })
  assert.ok(await page.locator('#inspector-tree .inspector-tag').count() > 0)
  assert.ok(await page.locator('#inspector-tree .inspector-attribute').count() > 0)
  assert.ok(await page.locator('#inspector-tree .inspector-value').count() > 0)
  assert.ok(await page.locator('#inspector-breadcrumb button').count() >= 3)
  await page.screenshot({ path: join(artifacts, `${target}-selected.png`) })
  await page.locator('#panel-inspector').screenshot({ path: join(artifacts, `${target}-inspector.png`) })
  await page.locator('#inspector-attributes-tab').click()
  assert.ok(await page.locator('#inspector-details dt').count() > 0)
  await page.locator('#inspector-attributes-tab').press('ArrowLeft')
  await page.locator('#inspector-details .inspector-box').waitFor()
  const leaf = await page.locator('#inspector-tree').getAttribute('aria-activedescendant')
  await filter.press('Escape')
  assert.equal(await page.locator('#inspector-tree').getAttribute('aria-activedescendant'), leaf)
  await page.locator('#inspector-breadcrumb button').nth(1).click()
  assert.notEqual(await page.locator('#inspector-tree').getAttribute('aria-activedescendant'), leaf)
  process.stdout.write(`${target}: actual CDP tags, attributes, inline text, computed layout and ancestor navigation passed\n`)

  // Deliberately substitute only readonly inspection endpoints for stress/race tests.
  await app.evaluate(({ ipcMain }) => {
    const element = (nodeId, name, children = [], attributes = {}) => ({ nodeId, nodeType: 1, name, value: '', attributes, children })
    const text = (nodeId, value) => ({ nodeId, nodeType: 3, name: '#text', value, attributes: {}, children: [] })
    const branch = element(10, 'section', [element(11, 'span', [text(12, 'short <safe> text')], { id: 'label' }), element(13, 'img', [], { src: '" onerror="not-executable' }), element(14, 'pre', [text(15, 'line one\nline two')])], { id: 'branch' })
    globalThis.inspectorFixture = {
      root: { ...element(1, '#document', [element(2, 'main', [branch, ...Array.from({ length: 2500 }, (_, index) => element(100 + index, 'div', [], { id: `item-${index}` }))], { id: 'stage' })]), nodeType: 9 },
      polls: 0,
      detailInFlight: 0,
      maxDetailInFlight: 0,
    }
    ipcMain.removeHandler('editor:preview-inspect')
    ipcMain.handle('editor:preview-inspect', () => {
      globalThis.inspectorFixture.polls++
      return { root: globalThis.inspectorFixture.root, truncated: false }
    })
    ipcMain.removeHandler('editor:preview-inspect-node')
    ipcMain.handle('editor:preview-inspect-node', async (_event, _session, nodeId) => {
      const fixture = globalThis.inspectorFixture
      fixture.detailInFlight++
      fixture.maxDetailInFlight = Math.max(fixture.maxDetailInFlight, fixture.detailInFlight)
      await new Promise(resolve => setTimeout(resolve, 100))
      fixture.detailInFlight--
      return { box: { x: 0, y: 0, width: nodeId, height: 20 }, styles: [{ name: 'fixture-node', value: String(nodeId) }] }
    })
  })
  await page.locator('#inspector-refresh').click()
  await page.locator('#inspector-node-10').waitFor()
  assert.ok(await page.locator('.inspector-row').count() < 60, 'DOM must stay bounded for a 2500-element document')
  assert.equal(await page.locator('#inspector-node-11 .inspector-markup').textContent(), '<span id="label">short <safe> text</span>')
  assert.equal(await page.locator('#inspector-tree img').count(), 0, 'inspected HTML must never execute')
  assert.equal(await page.locator('#inspector-node-11').evaluate(node => node.getBoundingClientRect().height), 20)
  assert.ok(await page.locator('#inspector-node-15 .inspector-markup').evaluate(node => node.getBoundingClientRect().height <= 20))
  await page.locator('#inspector-node-10 .inspector-chevron').click()
  assert.equal(await page.locator('#inspector-node-10').getAttribute('aria-expanded'), 'false')
  assert.ok((await page.locator('#inspector-node-10').textContent()).includes('…</section>'))
  await page.locator('#inspector-node-10 .inspector-markup').click()
  await page.locator('#inspector-tree').press('ArrowRight')
  assert.equal(await page.locator('#inspector-tree').getAttribute('aria-activedescendant'), 'inspector-node-10')
  await page.locator('#inspector-tree').press('ArrowRight')
  assert.equal(await page.locator('#inspector-tree').getAttribute('aria-activedescendant'), 'inspector-node-11')
  await page.locator('#inspector-tree').press('ArrowLeft')
  assert.equal(await page.locator('#inspector-tree').getAttribute('aria-activedescendant'), 'inspector-node-10')
  await page.locator('#inspector-tree').press('ArrowLeft')
  await app.evaluate(() => {
    globalThis.inspectorFixture.root.children[0].children.unshift({ nodeId: 20, nodeType: 1, name: 'p', value: 'inserted', attributes: {}, children: [] })
  })
  await page.locator('#inspector-refresh').click()
  await page.locator('#inspector-node-20').waitFor()
  assert.equal(await page.locator('#inspector-node-10').getAttribute('aria-expanded'), 'false')
  assert.equal(await page.locator('#inspector-tree').getAttribute('aria-activedescendant'), 'inspector-node-10')
  await filter.fill('short <safe>')
  await page.locator('#inspector-node-11').click()
  await page.locator('#inspector-details dd').filter({ hasText: /^11$/ }).waitFor()
  await filter.press('Escape')
  await page.locator('#inspector-tree').press('End')
  assert.equal(await page.locator('#inspector-tree').getAttribute('aria-activedescendant'), 'inspector-node-2599')
  await page.locator('#inspector-details dd').filter({ hasText: /^2599$/ }).waitFor()
  assert.ok(await page.locator('.inspector-row').count() < 60)
  const maxRequests = await app.evaluate(() => globalThis.inspectorFixture.maxDetailInFlight)
  assert.equal(maxRequests, 1)
  await page.locator('#inspector-live').check()
  await page.locator('#tab-console').click()
  const polls = await app.evaluate(() => globalThis.inspectorFixture.polls)
  await page.waitForTimeout(1400)
  assert.equal(await app.evaluate(() => globalThis.inspectorFixture.polls), polls)
  await page.locator('#stop').click()
  await waitState(state => state.phase === 'idle')
  assert.equal(await page.locator('#inspector-tree .inspector-row').count(), 0)
  assert.deepEqual(errors, [])
  await rm(join(artifacts, `${target}-failure.png`), { force: true })
  await rm(join(artifacts, `${target}-failure.json`), { force: true })
  process.stdout.write(`${target}: compact virtual tree, safe markup, paired tags, correct arrow keys, stable CDP selection, bounded detail requests, hidden-panel polling and teardown passed\n`)
}
catch (error) {
  await writeFile(join(artifacts, `${target}-failure.json`), JSON.stringify({ error: String(error), state: await page.evaluate(() => window.quaEditor.previewState()), logs: await page.locator('#logs').textContent(), errors }, null, 2)).catch(() => {})
  await page.screenshot({ path: join(artifacts, `${target}-failure.png`) }).catch(() => {})
  throw error
}
finally {
  await app.close()
  await rm(profile, { recursive: true, force: true })
}

async function waitState(predicate) {
  const deadline = Date.now() + 300000
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.quaEditor.previewState())
    if (state.phase === 'error' || state.renderError)
      throw new Error(state.error || state.renderError)
    if (predicate(state))
      return
    await page.waitForTimeout(100)
  }
  throw new Error('Preview state timed out')
}
