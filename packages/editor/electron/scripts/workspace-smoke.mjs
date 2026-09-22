/* eslint-disable no-template-curly-in-string -- Fixture text contains QuaScript interpolation. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await mkdtemp(join(tmpdir(), 'qua-editor-workspace-smoke-'))
const projectRoot = join(temporary, 'first')
const secondRoot = join(temporary, 'second')
const artifacts = resolve(root, '.codex-tmp/editor-workspace-smoke')
const source = '<script setup lang="ts">\nconst message = "hello"\n</script>\n@Scene("test")\n@Node("start", { title: "Start" })\nNarrator: ${message}'
for (const [path, name] of [[projectRoot, 'Editor workspace fixture'], [secondRoot, 'Second project']]) {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name, bundleId: 'dev.qua.editor.fixture', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(path, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { 'dev:web': 'vite' } }))
  await writeFile(join(path, 'scene.qs'), source)
}
await mkdir(artifacts, { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const application = await launchEditor({ executablePath: require('electron'), args: [editorRoot, '--project', projectRoot], env, timeout: 60000 })
const errors = []
const documentEnd = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'
const page = await application.firstWindow()
page.on('pageerror', error => errors.push(error.message))
application.process().stderr.on('data', data => process.stderr.write(data))
try {
  await page.locator('.dock-separator[data-split-id="main"]').dblclick()
  await page.locator('#tab-console').click()
  await page.locator('#files[data-project-name="Editor workspace fixture"]').waitFor()
  await page.locator('#files button[data-path="scene.qs"]').click()
  await page.locator('#document-name').filter({ hasText: 'scene.qs' }).waitFor()
  await page.keyboard.press(documentEnd)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('F12')
  await page.locator('#cursor-position').filter({ hasText: '行 2，列 7' }).waitFor()
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.press('ControlOrMeta+i')
  await page.locator('.monaco-hover').filter({ hasText: 'message' }).waitFor({ timeout: 10000 })
  await page.keyboard.press('Escape')
  process.stdout.write('Language: F12 resolved a virtual TypeScript symbol to its QuaScript declaration\n')

  await page.keyboard.press(documentEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('@Cho')
  await page.keyboard.press('Control+Space')
  const choice = page.locator('.suggest-widget .monaco-list-row').filter({ hasText: /^Choice/ }).first()
  await choice.waitFor({ timeout: 20000 })
  await choice.click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+s')
  await poll(async () => (await readFile(join(projectRoot, 'scene.qs'), 'utf8')).endsWith('@Choice'))
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '×' }).waitFor()
  await page.locator('#format').click()
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '●' }).waitFor()
  await page.locator('#save').click()
  await poll(async () => (await readFile(join(projectRoot, 'scene.qs'), 'utf8')).endsWith('@Choice\n'))
  process.stdout.write('Language: compiler-backed completion inserted and saved @Choice\n')

  await writeFile(join(projectRoot, 'helper.ts'), 'export const greeting = "hello"\n')
  await writeFile(join(projectRoot, 'scene.qs'), '<script lang="ts">\nimport { greeting } from "./helper"\n</script>\nNarrator: ${greeting}')
  await page.locator('#status').filter({ hasText: '已同步磁盘上的修改' }).waitFor({ timeout: 20000 })
  await page.locator('#editor').click({ position: { x: 120, y: 25 } })
  await page.keyboard.press(documentEnd)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('F12')
  await page.locator('#document-name').filter({ hasText: 'helper.ts' }).waitFor({ timeout: 15000 })
  await page.locator('#files button[data-path="scene.qs"]').click()
  await page.locator('#document-name').filter({ hasText: 'scene.qs' }).waitFor()
  process.stdout.write('Language: hover, formatting and cross-file definition navigation passed\n')

  await writeFile(join(projectRoot, 'scene.qs'), source.replace('hello', 'DISK UPDATE'))
  await poll(async () => (await editorText()).includes('DISK UPDATE'))
  await page.locator('#editor').click({ position: { x: 120, y: 25 } })
  await page.keyboard.press(documentEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('LOCAL DRAFT')
  await writeFile(join(projectRoot, 'scene.qs'), source.replace('hello', 'REMOTE CHANGE'))
  await page.locator('#disk-message').filter({ hasText: '文件已被外部修改' }).waitFor({ timeout: 20000 })
  assert.ok((await editorText()).includes('LOCAL DRAFT'))
  await page.locator('#compare-disk').click()
  await page.locator('#disk-diff .monaco-diff-editor').waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(artifacts, 'conflict.png') })
  await page.locator('#close-diff').click()
  await page.locator('#save').click()
  await page.locator('#status').filter({ hasText: '外部修改' }).waitFor()
  assert.ok((await readFile(join(projectRoot, 'scene.qs'), 'utf8')).includes('REMOTE CHANGE'))
  await page.locator('#keep-local').click()
  await poll(async () => (await readFile(join(projectRoot, 'scene.qs'), 'utf8')).includes('LOCAL DRAFT'))
  await page.locator('#disk-change').waitFor({ state: 'hidden' })
  await page.locator('#editor').click({ position: { x: 120, y: 25 } })
  await page.keyboard.press(documentEnd)
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('SECOND DRAFT')
  await rm(join(projectRoot, 'scene.qs'))
  await page.locator('#disk-message').filter({ hasText: '已删除或不可读取' }).waitFor({ timeout: 20000 })
  assert.equal(await page.locator('#save').isDisabled(), true)
  assert.ok((await editorText()).includes('LOCAL DRAFT'))
  await writeFile(join(projectRoot, 'scene.qs'), source.replace('hello', 'RESTORED DISK'))
  await page.locator('#disk-message').filter({ hasText: '文件已被外部修改' }).waitFor({ timeout: 20000 })
  process.stdout.write('Documents: clean reload, guarded conflict resolution and deletion preserved the working buffer\n')

  await writeFile(join(projectRoot, 'next.qs'), '@Scene("next")\n@Node("second", { title: "New chapter" })\nNarrator: next\n')
  await page.locator('#activity-story').click()
  await page.locator('#story button').filter({ hasText: 'New chapter' }).waitFor({ timeout: 20000 })
  await rename(join(projectRoot, 'next.qs'), join(projectRoot, 'renamed.qs'))
  await page.locator('#activity-explorer').click()
  await page.locator('#files button').filter({ hasText: 'renamed.qs' }).waitFor({ timeout: 20000 })
  assert.equal(await page.locator('#files button[data-path="next.qs"]').count(), 0)
  await rm(join(projectRoot, 'renamed.qs'))
  await page.locator('#story button').filter({ hasText: 'New chapter' }).waitFor({ state: 'detached', timeout: 20000 })
  await application.evaluate(({ dialog }, secondRoot) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [secondRoot] })
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }, secondRoot)
  await application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('open-project').click())
  await page.locator('#files[data-project-name="Second project"]').waitFor()
  await writeFile(join(projectRoot, 'old.qs'), '@Scene("old")\n@Node("old", { title: "Old project" })\nNarrator: ignored')
  await page.waitForTimeout(800)
  assert.equal(await page.locator('#files button').filter({ hasText: 'old.qs' }).count(), 0)
  assert.deepEqual(errors, [])
  process.stdout.write('Project: file/story add, rename, deletion and watcher disposal on project switch passed\n')
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
  await rm(temporary, { recursive: true, force: true })
}

async function poll(predicate) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await predicate())
      return
    await page.waitForTimeout(100)
  }
  throw new Error('Workspace condition timed out')
}

async function editorText() {
  return (await page.locator('#editor .view-lines').textContent()).replaceAll('\u00A0', ' ')
}
