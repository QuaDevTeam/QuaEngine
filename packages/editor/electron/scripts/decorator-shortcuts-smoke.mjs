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
const temporary = await mkdtemp(join(tmpdir(), 'qua-decorator-shortcuts-'))
const artifacts = resolve(root, '.codex-tmp/editor-decorator-shortcuts')
await mkdir(artifacts, { recursive: true })
await writeFile(join(temporary, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Decorator shortcuts', bundleId: 'dev.qua.shortcuts', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(temporary, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { 'dev:web': 'vite' } }))
await writeFile(join(temporary, 'qua.plugins.json'), JSON.stringify({ plugins: [{
  name: 'mood',
  decorators: { Mood: { function: 'mood', module: './helper' } },
  language: { decorators: { Mood: { description: 'Change the mood.', args: [{ name: 'value', values: ['calm', 'tense'] }, { name: 'options', detail: 'Transition options' }] } } },
}] }))
await writeFile(join(temporary, 'scene.qs'), '@Mood("calm", {})\nNarrator: hello\n')
await writeFile(join(temporary, 'helper.ts'), '/** Change the mood. */\nexport function mood(value: string, options?: object) {}\n')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', temporary, '--user-data-dir', join(temporary, 'profile')], env })
const page = await app.firstWindow()
page.setDefaultTimeout(20000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const start = process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home'
try {
  await page.locator('#files[data-project-name="Decorator shortcuts"]').waitFor()
  await page.locator('#files button[data-path="scene.qs"]').click()
  await page.keyboard.press(start)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('F12')
  await page.locator('#document-name').filter({ hasText: 'helper.ts' }).waitFor()
  await page.locator('#cursor-position').filter({ hasText: '行 2，列 17' }).waitFor()
  await page.locator('#files button[data-path="scene.qs"]').click()
  process.stdout.write('F12: resolved decorator implementation.\n')
  await replace('@Mo')
  await page.keyboard.press('Control+Space')
  const suggestion = page.locator('.suggest-widget .monaco-list-row').filter({ hasText: /^Mood/ }).first()
  await suggestion.waitFor()
  await suggestion.click()
  await page.keyboard.press('Escape')
  await contains('@Mood')
  await page.keyboard.type('(')
  await page.locator('.parameter-hints-widget.visible').filter({ hasText: '@Mood' }).waitFor()
  await page.keyboard.type('"calm", ')
  await page.locator('.parameter-hints-widget .parameter.active').filter({ hasText: 'options' }).waitFor()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+Shift+Space')
  await page.locator('.parameter-hints-widget.visible').filter({ hasText: '@Mood' }).waitFor()
  await page.screenshot({ path: join(artifacts, 'signature.png') })
  await page.keyboard.press('Escape')

  await replace('Narrator: alpha alpha\nNarrator: beta')
  await page.keyboard.press(start)
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ControlOrMeta+d')
  await page.keyboard.press('ControlOrMeta+d')
  await page.keyboard.insertText('omega')
  await contains('omega omega')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+z')
  await contains('alpha alpha')

  await page.keyboard.press(start)
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForFunction(() => document.querySelector('#editor .view-lines').textContent.replaceAll('\u00A0', ' ').startsWith('Narrator: beta'))
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press(start)
  await page.keyboard.press('Shift+Alt+ArrowDown')
  await page.waitForFunction(() => document.querySelector('#editor .view-lines').textContent.replaceAll('\u00A0', ' ').split('alpha alpha').length - 1 === 2)
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press(start)
  await page.keyboard.press('ControlOrMeta+/')
  await page.waitForFunction(() => document.querySelector('#editor .view-lines').textContent.startsWith('//'))
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+f')
  await page.locator('.find-widget.visible').waitFor()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+Shift+p')
  await page.locator('.quick-input-widget').waitFor({ state: 'visible' })
  await page.screenshot({ path: join(artifacts, 'commands.png') })
  await page.keyboard.press('Escape')
  await page.keyboard.press('F1')
  await page.locator('.quick-input-widget').waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  assert.deepEqual(errors, [])
  process.stdout.write('PASS: decorator completion, signature/active parameter, F12, multi-cursor undo, move/copy lines, comments, find and both command-palette shortcuts.\n')
}
catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }).catch(() => {})
  await app.close()
  await rm(temporary, { recursive: true, force: true })
}
async function replace(value) {
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(value)
}
async function contains(value) {
  await page.waitForFunction(value => document.querySelector('#editor .view-lines').textContent.replaceAll('\u00A0', ' ').includes(value), value)
}
