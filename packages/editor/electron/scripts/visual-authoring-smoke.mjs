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
const temporary = await mkdtemp(join(tmpdir(), 'qua-visual-authoring-'))
const artifacts = resolve(root, '.codex-tmp/editor-visual-authoring')
await mkdir(artifacts, { recursive: true })
await writeFile(join(temporary, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Visual authoring', bundleId: 'dev.qua.visual', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(temporary, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { 'dev:web': 'vite' } }))
const plugins = []
for (const path of ['plugins/background', 'plugins/audio', 'game/character']) {
  const pkg = JSON.parse(await readFile(join(root, 'packages', path, 'package.json'), 'utf8'))
  plugins.push({ name: pkg.name, decorators: pkg.quajs.decorators, language: pkg.quajs.language })
}
await writeFile(join(temporary, 'qua.plugins.json'), JSON.stringify({ plugins }))
await mkdir(join(temporary, 'assets/images'), { recursive: true })
await writeFile(join(temporary, 'assets/images/room.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
const source = `// Keep comments and expression bytes
@SetBackground("room.png", {
  transition: { type: "fade", duration: 400 }
})
@PlayVoice("one.ogg")
@ShowCharacter("凛", { position: { x: 960, y: 1080 }, opacity: 0.8 })
凛: 第一句 🌧
// Keep this boundary
@SetExpression("smile", "凛")
凛: 第二句
`
const file = join(temporary, 'scene.qs')
await writeFile(file, source)
await writeFile(join(temporary, 'other.qs'), '旁白: 其他文件\n')
await writeFile(join(temporary, 'helper.ts'), 'export const count = 1\n')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', temporary, `--user-data-dir=${join(temporary, 'profile')}`], env })
const page = await app.firstWindow()
page.setDefaultTimeout(20000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const visual = page.locator('#visual-editor')
async function save() {
  await page.locator('#save').click()
  await page.waitForFunction(() => document.querySelector('#save').disabled)
  return readFile(file, 'utf8')
}
async function select(index) {
  await visual.getByLabel('当前语句', { exact: true }).selectOption(String(index))
}
try {
  await page.locator('#files[data-project-name="Visual authoring"]').waitFor()
  await page.locator('#files button[data-path="scene.qs"]').click()
  await page.locator('#tab-properties').click()
  await visual.locator('select[aria-label="当前语句"] option[value="0"]').waitFor({ state: 'attached' })
  await select(0)
  await visual.getByLabel('文本', { exact: true }).fill('第一句改写 🌧')
  assert.equal(await readFile(file, 'utf8'), source, 'visual changes stay in the draft')
  await visual.locator('[data-decorator="PlayVoice"]').getByLabel('资源', { exact: true }).fill('new')
  await page.keyboard.type('-voice.ogg', { delay: 40 })
  await visual.getByLabel('选项 / 位置 / X（逻辑坐标）', { exact: true }).fill('720')
  const edited = await save()
  assert.equal(edited, source.replace('第一句 🌧', '第一句改写 🌧').replace('one.ogg', 'new-voice.ogg').replace('x: 960', 'x: 720'))
  process.stdout.write('Live text, audio and nested position edits preserved neighboring source.\n')

  // Editing the code updates the form; undo from an input returns through Monaco.
  await visual.getByLabel('文本', { exact: true }).fill('临时改动')
  await page.keyboard.press('ControlOrMeta+z')
  await page.waitForFunction(() => document.querySelector('#visual-editor [data-field="文本"]')?.value === '第一句改写 🌧')
  await visual.getByLabel('当前语句', { exact: true }).focus()
  await select(1)
  assert.equal(await visual.getByLabel('文本', { exact: true }).inputValue(), '第二句')
  assert.equal(await page.locator('#editor').isVisible(), true)
  await visual.getByLabel('文本', { exact: true }).fill('第二句改写')
  assert.equal(await visual.getByLabel('文本', { exact: true }).inputValue(), '第二句改写')
  await page.locator('#files button[data-path="other.qs"]').click()
  await visual.getByLabel('当前语句', { exact: true }).selectOption('0')
  assert.equal(await visual.getByLabel('文本', { exact: true }).inputValue(), '其他文件')
  await page.locator('#files button[data-path="helper.ts"]').click()
  assert.equal(await visual.isVisible(), true)
  assert.equal(await page.locator('#editor').isVisible(), true)
  await page.locator('#files button[data-path="scene.qs"]').click()
  await select(0)
  await visual.locator('[data-decorator="SetBackground"]').getByRole('button', { name: '移除', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('#visual-editor [data-decorator="SetBackground"]'))
  await visual.getByLabel('添加指令', { exact: true }).selectOption('ClearBackground')
  await visual.getByRole('button', { name: '添加到当前语句', exact: true }).click()
  await visual.locator('[data-decorator="ClearBackground"]').waitFor()
  const withClear = await save()
  assert.ok(withClear.includes('@ClearBackground()\n@PlayVoice("new-voice.ogg")\n@ShowCharacter'))
  await writeFile(join(artifacts, 'saved.qs'), withClear)
  assert.ok(withClear.includes('// Keep this boundary\n@SetExpression("smile", "凛")\n凛: 第二句改写'))
  assert.equal((await visual.getByLabel('当前语句', { exact: true }).locator('option').count()), 3, 'remove/add must not split the dialogue attachment')
  await page.locator('#tab-properties').click()
  await visual.locator('.visual-body').evaluate(element => element.scrollTop = 0)
  await page.screenshot({ path: join(artifacts, 'split.png') })

  // Replace just the current source using the actual editor keyboard path.
  await page.locator('#editor .view-lines').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('凛: 从代码更新\n')
  await page.locator('#tab-properties').click()
  await select(0)
  await page.waitForFunction(() => document.querySelector('#visual-editor [data-field="文本"]')?.value === '从代码更新')
  assert.equal(await page.locator('#editor > .monaco-editor').count(), 1)
  await page.locator('.dock-separator[data-split-id="main"]').focus()
  const ratio = Number(await page.locator('.dock-separator[data-split-id="main"]').getAttribute('aria-valuenow'))
  await page.keyboard.press('ArrowUp')
  assert.equal(Number(await page.locator('.dock-separator[data-split-id="main"]').getAttribute('aria-valuenow')), ratio - 3)
  await page.screenshot({ path: join(artifacts, 'code-sync.png') })
  assert.deepEqual(errors, [])
  process.stdout.write(`Visual authoring smoke passed; screenshots: ${artifacts}\n`)
}
catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
  await app.close()
  await rm(temporary, { recursive: true, force: true })
}
