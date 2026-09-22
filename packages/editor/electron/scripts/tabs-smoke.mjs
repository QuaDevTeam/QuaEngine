import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const project = await mkdtemp(join(tmpdir(), 'qua-tabs-'))
const artifacts = resolve(root, '.codex-tmp/editor-tabs-smoke')
await mkdir(artifacts, { recursive: true })
await writeFile(join(project, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Tabs fixture', bundleId: 'dev.qua.tabs', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(project, 'package.json'), '{"name":"tabs","scripts":{"dev:web":"vite"}}')
await writeFile(join(project, 'one.qs'), 'Mara: first\n')
await writeFile(join(project, 'two.qs'), 'Yumi: second\n')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const application = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, `--user-data-dir=${join(project, '.editor-profile')}`, '--project', project], env })
const page = await application.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const end = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'
const tab = name => page.locator(`.document-tab[data-path="${name}"]`)
async function open(name) {
  await page.locator(`#files [data-path="${name}"]`).click()
  await page.locator('#document-name').filter({ hasText: name }).waitFor()
}
try {
  await page.locator('#files[data-project-name="Tabs fixture"]').waitFor()
  await page.locator('.dock-separator[data-split-id="main"]').dblclick()
  await page.locator('#tab-console').click()
  await open('one.qs')
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor .view-lines')).fontSize === '13px')
  await page.locator('#editor .minimap canvas').first().waitFor({ state: 'visible' })
  const initialBounds = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const bounds = window.getBounds()
    window.setSize(1000, 800)
    return bounds
  })
  const separator = await page.locator('.dock-separator[data-split-id="editors"]').boundingBox()
  const preview = await page.locator('.preview-pane').boundingBox()
  await page.mouse.move(separator.x + separator.width / 2, separator.y + separator.height / 2)
  await page.mouse.down()
  await page.mouse.move(preview.x + preview.width - 242, separator.y + separator.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction(() => Math.abs(document.querySelector('.preview-pane').getBoundingClientRect().width - 240) < 2)
  const toolbar = await page.locator('.preview-pane .panel-toolbar').evaluate((bar) => {
    const controls = [...bar.querySelectorAll('button, select')]
    const bounds = bar.getBoundingClientRect()
    return controls.every((control, index) => {
      const rect = control.getBoundingClientRect()
      const previous = controls[index - 1]?.getBoundingClientRect()
      return rect.x >= bounds.x && rect.right <= bounds.right && rect.bottom <= bounds.bottom && (!previous || previous.right <= rect.x)
        && (control.tagName === 'SELECT' || (control.querySelector('svg') && control.getAttribute('aria-label') && !control.textContent.trim()))
    }) && controls.at(-1).id === 'target'
  })
  assert.ok(toolbar, 'Icon controls and rightmost mode switch fit without wrapping or overlap at 240px')
  await page.screenshot({ path: join(artifacts, 'compact-toolbar.png') })
  await application.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), initialBounds)
  await page.locator('.dock-separator[data-split-id="editors"]').dblclick()
  await page.locator('#editor .view-lines').click()
  await page.keyboard.press(end)
  await page.keyboard.insertText('Mara: first draft\n')
  await tab('one.qs').locator('.tab-close').filter({ hasText: '●' }).waitFor()
  await open('two.qs')
  assert.equal(await tab('one.qs').locator('.tab-close').textContent(), '●')
  await page.keyboard.press(end)
  await page.keyboard.insertText('Yumi: second draft\n')
  await tab('two.qs').locator('.tab-close').filter({ hasText: '●' }).waitFor()
  await page.keyboard.press('Control+Tab')
  await page.locator('#document-name').filter({ hasText: 'one.qs' }).waitFor()
  assert.ok((await page.locator('#editor .view-lines').textContent()).includes('first'))
  let undoCount = 0
  while (await tab('one.qs').locator('.tab-close').textContent() === '●' && undoCount < 5) {
    await key('Z')
    await page.waitForTimeout(100)
    undoCount++
  }
  await tab('one.qs').locator('.tab-close').filter({ hasText: '×' }).waitFor()
  for (let i = 0; i < undoCount; i++) {
    await key('Z', true)
    await page.waitForTimeout(100)
  }
  await tab('one.qs').locator('.tab-close').filter({ hasText: '●' }).waitFor()
  await key('S', true)
  await page.waitForFunction(() => [...document.querySelectorAll('.tab-close')].every(button => button.textContent === '×'))
  assert.match(await readFile(join(project, 'one.qs'), 'utf8'), /first draft/)
  assert.match(await readFile(join(project, 'two.qs'), 'utf8'), /second draft/)
  assert.equal(await page.locator('#editor .monaco-editor').count(), 1)
  assert.equal(await page.locator('#breadcrumbs').count(), 0)
  await writeFile(join(project, 'two.qs'), 'Yumi: external update\n')
  await open('two.qs')
  await page.locator('#editor .view-lines').filter({ hasText: 'external' }).waitFor()
  await key(',')
  await page.locator('#settings-dialog').waitFor()
  assert.equal(await page.locator('#setting-minimap').isChecked(), true)
  await page.locator('#setting-minimap').uncheck()
  await page.locator('#setting-fontSize').fill('18')
  await page.locator('#setting-fontSize').press('Tab')
  await page.locator('#setting-tabSize').selectOption('4')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.screenshot({ path: join(artifacts, 'settings.png') })
  await page.keyboard.press('Escape')
  await page.locator('#editor .minimap canvas').first().waitFor({ state: 'hidden' })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor .view-lines')).fontSize === '18px')
  await page.keyboard.press(end)
  await page.keyboard.press('Tab')
  await page.keyboard.insertText('indent')
  await key('S')
  await poll(async () => (await readFile(join(project, 'two.qs'), 'utf8')).includes('    indent'))
  await page.keyboard.press('ControlOrMeta+f')
  await page.locator('.find-widget.visible').waitFor()
  await page.keyboard.press('Escape')
  await page.keyboard.press(end)
  await page.keyboard.insertText('unsaved')
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
  })
  await key('W')
  await page.waitForTimeout(200)
  assert.equal(await tab('two.qs').count(), 1)
  await page.screenshot({ path: join(artifacts, 'tabs.png') })
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  })
  await key('W')
  await tab('two.qs').waitFor({ state: 'detached' })
  await page.reload()
  await open('one.qs')
  await key(',')
  assert.equal(await page.locator('#setting-fontSize').inputValue(), '18')
  assert.equal(await page.locator('#setting-tabSize').inputValue(), '4')
  assert.equal(await page.locator('#setting-minimap').isChecked(), false)
  await page.locator('#editor .minimap canvas').first().waitFor({ state: 'hidden' })
  await page.locator('#settings-reset').click()
  assert.equal(await page.locator('#setting-fontSize').inputValue(), '13')
  assert.equal(await page.locator('#setting-minimap').isChecked(), true)
  await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  await page.locator('#editor .minimap canvas').first().waitFor({ state: 'visible' })
  await page.screenshot({ path: join(artifacts, 'minimap.png') })
  assert.deepEqual(errors, [])
  process.stdout.write('Tabs/settings: drafts, undo/redo across tabs, save-all, inactive disk reload, font/indentation and minimap persistence/reset, native close protection, find and one shared Monaco passed\n')
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
async function poll(predicate) {
  for (let i = 0; i < 100; i++) {
    if (await predicate())
      return
    await page.waitForTimeout(100)
  }
  throw new Error('Timed out waiting for saved file')
}

async function key(keyCode, shift = false) {
  // CDP Input.dispatchKeyEvent does not dispatch macOS menu key equivalents.
  await application.evaluate(({ BrowserWindow }, { keyCode, shift }) => {
    const modifiers = [process.platform === 'darwin' ? 'meta' : 'control', ...(shift ? ['shift'] : [])]
    const contents = BrowserWindow.getAllWindows()[0].webContents
    contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  }, { keyCode, shift })
}
