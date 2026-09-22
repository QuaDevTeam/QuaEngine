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
const project = await realpath(await mkdtemp(join(tmpdir(), 'qua-context-menu-')))
const artifacts = resolve(root, '.codex-tmp/editor-context-menu-smoke')
await mkdir(artifacts, { recursive: true })
for (const [path, text] of Object.entries({
  'qua.project.json': JSON.stringify({ schemaVersion: 1, name: 'Context menu', bundleId: 'dev.qua.menu', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }),
  'package.json': '{}',
  'tsconfig.json': '{"compilerOptions":{"strict":true,"types":[],"moduleResolution":"bundler","module":"esnext"}}',
  'clipboard.md': 'Alpha Bravo Charlie\n',
  'helper.ts': 'export const title = "Rain"\n',
  'app.ts': 'import { title } from "./helper"\nconsole.log(title)\n',
})) await writeFile(join(project, path), text)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const application = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, `--user-data-dir=${join(project, '.editor-profile')}`, '--project', project], env })
const page = await application.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error')
    process.stderr.write(`${message.text()}\n`)
})
const home = process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home'
const end = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'
async function open(path) {
  await page.locator(`#files [data-path="${path}"]`).click()
  await page.locator('#document-name').filter({ hasText: path }).waitFor()
  await page.locator('#editor .view-lines').click()
}
async function menu() {
  await page.keyboard.press('Shift+F10')
  await page.getByRole('menu').first().waitFor()
}
async function choose(name) {
  const item = page.locator('.monaco-menu .action-label').filter({ hasText: new RegExp(`^${name}$`, 'u') })
  await item.waitFor()
  // Monaco intentionally arms menu mouse-up handlers 100ms after opening.
  await page.waitForTimeout(120)
  await item.click()
  await page.getByRole('menu').first().waitFor({ state: 'hidden' })
}
async function expectClipboard(text) {
  for (let i = 0; i < 30; i++) {
    if (await application.evaluate(({ clipboard }) => clipboard.readText()) === text)
      return
    await page.waitForTimeout(100)
  }
  assert.fail('Clipboard did not receive the selected fixture text')
}
try {
  await application.evaluate(async ({ clipboard }) => {
    globalThis.savedMenuClipboard = await clipboard.readText()
  })
  await page.locator('#files[data-project-name="Context menu"]').waitFor()
  await open('clipboard.md')
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor .view-lines')).fontSize === '13px')
  await page.keyboard.press(home)
  await page.keyboard.press('Shift+End')
  // The physical right-click must preserve a selection when clicked inside it.
  await page.locator('#editor .view-line').first().click({ button: 'right', position: { x: 25, y: 9 } })
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).waitFor()
  await page.screenshot({ path: join(artifacts, 'context-menu.png') })
  await choose('Copy')
  await expectClipboard('Alpha Bravo Charlie')
  await menu()
  await choose('Cut')
  await page.waitForFunction(() => !document.querySelector('#editor .view-lines').textContent.includes('Alpha'))
  await expectClipboard('Alpha Bravo Charlie')
  process.stdout.write('Copy and cut passed\n')
  await menu()
  await choose('Paste')
  await page.locator('#editor .view-lines').filter({ hasText: 'Alpha Bravo Charlie' }).waitFor({ timeout: 5000 })
  await menu()
  await choose('撤销')
  await page.waitForFunction(() => !document.querySelector('#editor .view-lines').textContent.includes('Alpha'))
  await menu()
  await choose('重做')
  await page.locator('#editor .view-lines').filter({ hasText: 'Alpha Bravo Charlie' }).waitFor()
  await menu()
  await choose('全选')
  await menu()
  await choose('Copy')
  await expectClipboard('Alpha Bravo Charlie\n')
  process.stdout.write('Clipboard, undo/redo and selection passed\n')
  await menu()
  await choose('查找')
  await page.locator('.find-widget.visible').waitFor()
  await page.keyboard.press('Escape')
  await menu()
  await choose('转到行…')
  await page.locator('.quick-input-widget').waitFor()
  await page.keyboard.press('Escape')
  await open('app.ts')
  await page.keyboard.press(end)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Home')
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowRight')
  await menu()
  await page.getByRole('menuitem', { name: /Peek/ }).hover()
  await choose('Peek Definition')
  await page.locator('.peekview-widget .view-lines').filter({ hasText: 'Rain' }).waitFor({ timeout: 5000 })
  const preview = page.locator('.peekview-widget .view-lines')
  const previewBounds = await page.locator('.peekview-widget .preview').boundingBox()
  assert.ok(previewBounds.width >= 200 && previewBounds.height >= 100, 'peek fills its split-view slot')
  await preview.click()
  await page.keyboard.insertText('SHOULD_NOT_EDIT')
  assert.equal((await preview.textContent()).includes('SHOULD_NOT_EDIT'), false, 'temporary peek models remain readonly')
  process.stdout.write('Unopened definition peek passed\n')
  assert.equal(await page.locator('.document-tab[data-path="helper.ts"]').count(), 0, 'peek does not open a draft tab')
  await page.screenshot({ path: join(artifacts, 'peek-definition.png') })
  await page.keyboard.press('Escape')
  await page.locator('.peekview-widget').waitFor({ state: 'hidden' })
  await menu()
  await choose('Go to Definition')
  await page.locator('#document-name').filter({ hasText: 'helper.ts' }).waitFor()
  await page.keyboard.press(end)
  await page.keyboard.insertText('// unsaved definition\n')
  await open('app.ts')
  await page.keyboard.press(end)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Home')
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowRight')
  // Repeat peek against the inactive dirty tab.
  await menu()
  await page.getByRole('menuitem', { name: /Peek/ }).hover()
  await choose('Peek Definition')
  await page.locator('.peekview-widget .view-lines').filter({ hasText: 'unsaved definition' }).waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.peekview-widget').waitFor({ state: 'hidden' })
  await page.locator('.document-tab[data-path="helper.ts"] [role="tab"]').click()
  await page.locator('#editor .view-lines').filter({ hasText: 'unsaved definition' }).waitFor()
  assert.deepEqual(errors, [])
  process.stdout.write('Context menu: 13px default, real clipboard copy/cut/paste, undo/redo, select-all, find, go-to-line, unopened-file peek, definition navigation and dirty-draft peek passed.\n')
}
catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.stderr.write(`${JSON.stringify(errors)}\n`)
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await application.evaluate(async ({ clipboard, dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    if (typeof globalThis.savedMenuClipboard === 'string')
      await clipboard.writeText(globalThis.savedMenuClipboard)
    delete globalThis.savedMenuClipboard
  }).catch(() => {})
  await application.close()
  await rm(project, { recursive: true, force: true })
}
