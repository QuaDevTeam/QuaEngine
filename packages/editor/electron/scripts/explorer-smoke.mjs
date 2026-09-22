import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'qua-explorer-smoke-')))
const artifacts = resolve(root, '.codex-tmp/editor-explorer-smoke')
await mkdir(artifacts, { recursive: true })
await mkdir(join(temporary, 'archive'))
await writeFile(join(temporary, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Explorer fixture', bundleId: 'dev.qua.explorer', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(temporary, 'package.json'), JSON.stringify({ name: 'explorer-fixture', scripts: { 'dev:web': 'vite' } }))
await writeFile(join(temporary, 'a.qs'), 'Rin: 第一行。\nRin: 第二行。\n')
await writeFile(join(temporary, 'b.qs'), 'Mara: 另一个文件。\n')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let application
let page
try {
  application = await launchEditor({ executablePath: require('electron'), args: [editorRoot, '--project', temporary], env, timeout: 60000 })
  page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#files[data-project-name="Explorer fixture"]').waitFor()
  assert.equal(await page.locator('#file-search').isVisible(), false, 'Explorer filter is hidden initially')
  await page.locator('#files').focus()
  await page.keyboard.press('Control+f')
  await page.locator('#file-search').fill('b.qs')
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#file-search').isVisible(), false)
  assert.equal(await page.locator('#files').evaluate(element => element === document.activeElement), true)
  await page.locator('#files [data-path="a.qs"]').waitFor()
  await page.keyboard.press('ControlOrMeta+f')
  await page.locator('#file-search').fill('b.qs')
  await page.locator('#file-filter-close').click()
  assert.equal(await page.locator('#file-search').isVisible(), false)
  await page.keyboard.press('ControlOrMeta+f')
  assert.equal(await page.locator('#file-search').evaluate(element => element === document.activeElement), true)
  await page.locator('#file-search').fill('b.qs')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#file-search').isVisible(), false, 'Escape from the filtered tree closes and clears find')
  await page.keyboard.press('ControlOrMeta+f')
  assert.equal(await page.locator('#file-search').inputValue(), '')
  await page.locator('#file-search').fill('b.qs')
  await page.locator('#files [data-path="b.qs"]').waitFor()
  await page.keyboard.press('ControlOrMeta+p')
  await page.locator('#quick-open[open]').waitFor()
  assert.equal(await page.locator('#quick-open-input').evaluate(input => getComputedStyle(input).outlineStyle), 'none', 'Quick Open uses its own single focus border')
  assert.equal(await page.locator('#file-search').inputValue(), 'b.qs')
  await page.locator('#quick-open-input').fill('a.qs:2:3')
  await page.locator('#quick-open-results [data-path="a.qs"]').waitFor()
  await page.waitForFunction(() => document.querySelectorAll('#quick-open-results [data-path]').length === 1)
  await page.screenshot({ path: join(artifacts, 'quick-open.png') })
  await page.keyboard.press('Enter')
  await page.locator('#document-name').filter({ hasText: 'a.qs' }).waitFor()
  await page.locator('#cursor-position').filter({ hasText: '行 2，列 3' }).waitFor()
  await page.keyboard.press('ControlOrMeta+f')
  await page.locator('#editor .find-widget.visible').waitFor()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+p')
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#quick-open').isVisible(), false)
  // Exercise the actual native menu construction and selection callbacks, without OS input automation.
  await application.evaluate(({ Menu }) => {
    Menu.prototype.popup = function (options) {
      globalThis.lastFileMenu = this.items.map(item => ({ id: item.id, enabled: item.enabled }))
      const selected = this.getMenuItemById(globalThis.fileMenuChoice)
      if (selected?.enabled)
        selected.click()
      options.callback?.()
    }
  })
  const context = async (locator, action) => {
    await application.evaluate((_, action) => {
      globalThis.fileMenuChoice = `file-${action}`
    }, action)
    await locator.click({ button: 'right' })
  }
  const submit = async (name) => {
    await page.locator('#file-operation-name').fill(name)
    await page.locator('#file-operation-submit').click()
    await page.locator('#file-operation-dialog').waitFor({ state: 'hidden' })
  }
  await context(page.locator('#files'), 'new-folder')
  await submit('drafts')
  await page.locator('#files [data-path="drafts"]').waitFor()
  await page.locator('#new-file').click()
  await submit('scene.qs')
  await page.locator('#document-name').filter({ hasText: 'scene.qs' }).waitFor()
  await page.keyboard.insertText('Rin: 未保存的台词。\n')
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '●' }).waitFor()
  await page.locator('#files').focus()
  await application.evaluate(() => {
    globalThis.fileMenuChoice = 'file-rename'
  })
  await page.keyboard.press('Shift+F10')
  await submit('chapter.qs')
  await page.locator('#document-name').filter({ hasText: 'chapter.qs' }).waitFor()
  assert.equal(await page.locator('.document-tab.active .tab-close').textContent(), '●')
  await page.locator('#editor .view-lines').click()
  // IME text insertion and its final newline can be separate Monaco undo groups.
  let undos = 0
  while (undos < 4 && (await page.locator('.document-tab.active .tab-close').textContent()) === '●') {
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(80)
    undos++
  }
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '×' }).waitFor()
  for (let index = 0; index < undos; index++) await page.keyboard.press('ControlOrMeta+Shift+z')
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '●' }).waitFor()
  await page.keyboard.press('Shift+Alt+f')
  await page.keyboard.press('ControlOrMeta+s')
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '×' }).waitFor()
  assert.match(await readFile(join(temporary, 'drafts/chapter.qs'), 'utf8'), /未保存的台词/)
  await assert.rejects(stat(join(temporary, 'drafts/scene.qs')), { code: 'ENOENT' })
  await page.locator('#files').focus()
  await page.keyboard.press('ControlOrMeta+c')
  await page.locator('#status').filter({ hasText: '已复制 drafts/chapter.qs' }).waitFor()
  await context(page.locator('#files [data-path="drafts"]'), 'paste')
  await page.locator('#files [data-path="drafts/chapter copy.qs"]').waitFor()
  assert.equal(await readFile(join(temporary, 'drafts/chapter copy.qs'), 'utf8'), await readFile(join(temporary, 'drafts/chapter.qs'), 'utf8'))
  await context(page.locator('#files [data-path="drafts/chapter copy.qs"]'), 'cut')
  await context(page.locator('#files [data-path="archive"]'), 'paste')
  await page.locator('#files [data-path="archive/chapter copy.qs"]').waitFor()
  await assert.rejects(stat(join(temporary, 'drafts/chapter copy.qs')), { code: 'ENOENT' })
  await page.locator('#files [data-path="a.qs"]').dragTo(page.locator('#files [data-path="archive"]'))
  await page.locator('#files [data-path="archive/a.qs"]').waitFor()
  assert.equal(await readFile(join(temporary, 'archive/a.qs'), 'utf8'), 'Rin: 第一行。\nRin: 第二行。\n')
  await context(page.locator('#files [data-path="drafts"]'), 'rename')
  await submit('chapters')
  await page.locator('#files [data-path="chapters"]').waitFor()
  await page.locator('#document-name').filter({ hasText: 'chapter.qs' }).waitFor()
  // The current document follows a parent-folder rename and can still save to its new path.
  await page.locator('#editor .view-lines').click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.insertText('Rin: 文件夹已改名。\n')
  await page.keyboard.press('ControlOrMeta+s')
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '×' }).waitFor()
  assert.match(await readFile(join(temporary, 'chapters/chapter.qs'), 'utf8'), /文件夹已改名/)
  await page.locator('#files [data-path="chapters"]').click()
  await page.locator('#files [data-path="chapters/chapter.qs"]').waitFor()
  await context(page.locator('#files [data-path="chapters/chapter.qs"]'), 'rename')
  await page.locator('#file-operation-name').fill('../escape.qs')
  await page.locator('#file-operation-submit').click()
  await page.locator('#file-operation-error').filter({ hasText: '路径分隔符' }).waitFor()
  await page.locator('#file-operation-cancel').click()
  await page.locator('#files').focus()
  await page.keyboard.press('F2')
  await page.locator('#file-operation-dialog[open]').waitFor()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: join(artifacts, 'file-tree.png') })
  await page.locator('#editor .view-lines').click()
  await page.keyboard.insertText('Rin: 删除后保留的草稿。\n')
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '●' }).waitFor()
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
  })
  await context(page.locator('#files [data-path="chapters/chapter.qs"]'), 'delete')
  assert.ok((await stat(join(temporary, 'chapters/chapter.qs'))).isFile())
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  })
  await context(page.locator('#files [data-path="chapters/chapter.qs"]'), 'delete')
  await page.locator('#files [data-path="chapters/chapter.qs"]').waitFor({ state: 'detached' })
  await page.locator('#editor .view-lines').filter({ hasText: '删除后保留的草稿' }).waitFor()
  await page.locator('#disk-change').waitFor()
  assert.equal(await page.locator('.document-tab.active .tab-close').textContent(), '●')
  assert.equal(await page.locator('#save').isDisabled(), true)
  assert.deepEqual(errors, [])
  process.stdout.write('Explorer: scoped Ctrl+F, floating Ctrl+P and line navigation, native menu callbacks, create folder/file, rename with preserved draft/undo, format/save at new path, duplicate, cut/paste, actual drag/drop, parent rename, cancelled trash and deleted-buffer preservation passed\n')
}
catch (error) {
  await page?.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await application?.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }).catch(() => {})
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
