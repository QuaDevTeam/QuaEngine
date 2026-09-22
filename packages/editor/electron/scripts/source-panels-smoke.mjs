import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await mkdtemp(join(tmpdir(), 'qua-source-panels-'))
const project = join(temporary, 'project')
const empty = join(temporary, 'empty')
const artifacts = resolve(root, '.codex-tmp/editor-source-panels')
await mkdir(artifacts, { recursive: true })
for (const directory of [project, empty]) {
  await mkdir(directory)
  await writeFile(join(directory, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: directory === project ? 'Source panels' : 'Empty source panels', bundleId: 'dev.qua.source.panels', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(directory, 'package.json'), '{"name":"source-panels"}')
}
const timeline = id => JSON.stringify({ id, duration: 1000, commit: 'none', fill: 'both', tracks: [{ target: 'self', property: 'position.x', interpolation: 'number', keyframes: [{ at: 0, value: 640 }, { at: 1000, value: 1280 }] }] }, null, 2)
await writeFile(join(project, 'first.animation.json'), timeline('first'))
await writeFile(join(project, 'second.animation.json'), timeline('second'))
await writeFile(join(project, 'notes.md'), '# Notes\n')
await writeFile(join(project, 'characters.ts'), `import { registerCharacters } from '@quajs/character'
// Static definitions, no project code is executed.
registerCharacters([
  { id: 'alice', displayName: 'Alice', spriteManifest: 'alice.manifest.json' },
  { id: 'bob', displayName: 'Bob' },
])
`)
await writeFile(join(project, 'alice.manifest.json'), '{"version":1,"family":"alice","expressions":{}}')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', project, `--user-data-dir=${join(temporary, 'profile')}`], env })
const page = await app.firstWindow()
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const animation = page.locator('.animation-editor')
const characters = page.locator('.character-browser')
const animationFile = animation.getByLabel('动画文件', { exact: true })
const animationTab = page.getByRole('tab', { name: '动画', exact: true })
const characterTab = page.getByRole('tab', { name: '角色浏览器', exact: true })
const discard = page.locator('footer').getByRole('button', { name: '放弃更改并切换', exact: true })
async function open(path, line) {
  await page.keyboard.press('ControlOrMeta+p')
  await page.locator('#quick-open-input').fill(`${path}${line ? `:${line}` : ''}`)
  await page.locator(`#quick-open-results [data-path="${path}"]`).waitFor()
  await page.keyboard.press('Enter')
  await page.locator('#document-name').filter({ hasText: path }).waitFor()
}
async function selectedAnimation(path) {
  await page.waitForFunction(path => document.querySelector('.animation-toolbar select')?.value === path, path)
  assert.equal(await animationTab.getAttribute('aria-selected'), 'true')
}
async function selectedCharacter(id) {
  await characters.locator(`[data-character="${id}"][aria-pressed="true"]`).waitFor()
  assert.equal(await characterTab.getAttribute('aria-selected'), 'true')
}
try {
  await page.locator('#files[data-project-name="Source panels"]').waitFor()
  await open('second.animation.json')
  await selectedAnimation('second.animation.json')
  assert.equal(await page.locator('#editor').evaluate(editor => editor.contains(document.activeElement)), true, 'source retains focus')
  await open('first.animation.json')
  await selectedAnimation('first.animation.json')
  await page.locator('.document-tab[data-path="second.animation.json"] [role="tab"]').click()
  await selectedAnimation('second.animation.json')
  await animation.getByLabel('数值', { exact: true }).fill('900')
  await animation.getByLabel('数值', { exact: true }).press('Tab')
  await open('first.animation.json')
  await discard.waitFor()
  assert.equal(await animationFile.inputValue(), 'second.animation.json')
  assert.equal(await animation.getByLabel('数值', { exact: true }).inputValue(), '900')
  await open('notes.md')
  assert.equal(await discard.count(), 0, 'unrelated source cancels pending discard')
  await open('first.animation.json')
  await discard.click()
  await selectedAnimation('first.animation.json')
  await page.screenshot({ path: join(artifacts, 'animation-source.png') })

  await open('characters.ts', 5)
  await selectedCharacter('bob')
  await open('alice.manifest.json')
  await selectedCharacter('alice')
  await page.locator('.document-tab[data-path="characters.ts"] [role="tab"]').click()
  await selectedCharacter('bob')
  await characters.getByLabel('角色名称', { exact: true }).fill('Unapplied Bob')
  await open('alice.manifest.json')
  await discard.waitFor()
  await selectedCharacter('bob')
  assert.equal(await characters.getByLabel('角色名称', { exact: true }).inputValue(), 'Unapplied Bob')
  await open('notes.md')
  assert.equal(await discard.count(), 0)
  await open('alice.manifest.json')
  await discard.click()
  await selectedCharacter('alice')
  await open('characters.ts', 5)
  await selectedCharacter('bob')
  await open('characters.ts', 4)
  await selectedCharacter('alice')
  await page.screenshot({ path: join(artifacts, 'character-source.png') })

  await open('first.animation.json')
  await selectedAnimation('first.animation.json')
  await page.getByRole('tab', { name: '调试控制台', exact: true }).click()
  const version = await animation.getAttribute('data-index-version')
  await writeFile(join(project, 'first.animation.json'), timeline('reindexed'))
  await page.waitForFunction(version => document.querySelector('.animation-editor')?.dataset.indexVersion !== version, version)
  assert.equal(await animationTab.getAttribute('aria-selected'), 'false', 'watch refresh does not steal panel selection')
  await open('notes.md')
  assert.equal(await page.getByRole('tab', { name: '调试控制台', exact: true }).getAttribute('aria-selected'), 'true')
  await page.locator('.document-tab[data-path="first.animation.json"] [role="tab"]').click()
  await selectedAnimation('first.animation.json')
  assert.equal(await animation.getByLabel('动画 ID', { exact: true }).inputValue(), 'reindexed')

  await app.evaluate(({ dialog, Menu }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    Menu.getApplicationMenu().getMenuItemById('open-project').click()
  }, empty)
  await page.locator('#files[data-project-name="Empty source panels"]').waitFor()
  await animationFile.waitFor()
  assert.equal(await animationFile.inputValue(), '')
  assert.equal(await characters.locator('[data-character]').count(), 0)
  assert.deepEqual(errors, [])
  process.stdout.write('Source panels: indexed animation/character/manifest navigation, tab and line switches, draft protection, refresh and project cleanup passed.\n')
}
catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await app.close()
  await rm(temporary, { recursive: true, force: true })
}
