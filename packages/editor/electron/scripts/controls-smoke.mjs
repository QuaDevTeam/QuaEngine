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
const temporary = await mkdtemp(join(tmpdir(), 'qua-controls-'))
const fixture = join(temporary, 'project')
await mkdir(fixture)
const artifacts = resolve(root, '.codex-tmp/editor-controls-smoke')
await mkdir(artifacts, { recursive: true })
await writeFile(join(fixture, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Editor controls', bundleId: 'dev.qua.controls', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'controls-fixture' }))
const source = JSON.stringify({ id: 'enter', duration: 1000, tracks: [{ target: 'self', property: 'position.x', keyframes: [{ at: 0, value: 640 }, { at: 1000, value: 1280 }] }] })
await writeFile(join(fixture, 'enter.animation.json'), source)
await writeFile(join(fixture, 'characters.ts'), 'import { registerCharacters } from \'@quajs/character\'\nregisterCharacters([{ id: \'rin\', displayName: \'凛\' }])\n')
await writeFile(join(fixture, 'scene.qs'), '凛: 在同一套控件里编辑角色、台词和动画。\n')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', fixture, `--user-data-dir=${join(temporary, 'profile')}`], env, timeout: 60000 })
const page = await app.firstWindow()
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const metrics = {}
async function geometry(locator) {
  return locator.evaluate((control) => {
    const style = getComputedStyle(control)
    const box = (control.closest('.editor-input-unit') ?? control).getBoundingClientRect()
    return { height: box.height, radius: style.borderRadius, background: style.backgroundColor, color: style.color, outline: style.outlineStyle }
  })
}
async function screenshot(name) {
  await page.screenshot({ path: join(artifacts, `${name}.png`) })
}
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 1000))
  await page.locator('#files[data-project-name="Editor controls"]').waitFor()
  await page.getByRole('tab', { name: '动画', exact: true }).click()
  const panel = page.locator('.animation-editor')
  await panel.getByLabel('动画 ID', { exact: true }).waitFor()
  const splitter = await page.locator('.dock-separator[data-split-id="main"]').boundingBox()
  await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 2)
  await page.mouse.down()
  await page.mouse.move(splitter.x + splitter.width / 2, 260, { steps: 8 })
  await page.mouse.up()
  const duration = panel.getByLabel('时长 ms', { exact: true })
  await duration.fill('0')
  await duration.press('Tab')
  assert.equal(await duration.evaluate(input => input.validity.rangeUnderflow), true)
  assert.equal(await panel.getByRole('button', { name: '应用到源文件', exact: true }).isDisabled(), true)
  await duration.fill('')
  await duration.press('Tab')
  assert.equal(await panel.getByRole('button', { name: '应用到源文件', exact: true }).isDisabled(), true, 'Empty numeric draft does not commit zero')
  await duration.fill('1000')
  await duration.press('Tab')
  await panel.locator('.animation-inspector').evaluate(element => element.scrollTop = 0)
  metrics.animation = await geometry(panel.getByLabel('动画 ID', { exact: true }))
  metrics.number = await geometry(duration)
  metrics.select = await geometry(panel.getByLabel('属性', { exact: true }))
  assert.equal(metrics.animation.height, 26)
  assert.equal(metrics.number.height, 26)
  assert.equal(metrics.select.height, 26)
  const layout = await panel.evaluate((element) => {
    const inspector = element.querySelector('.animation-inspector').getBoundingClientRect()
    const workspace = element.querySelector('.animation-workspace').getBoundingClientRect()
    const labels = [...element.querySelectorAll('.animation-context .editor-field-label')].map(label => label.getBoundingClientRect().height)
    return { inspector: inspector.height, workspace: workspace.height, labels }
  })
  assert.equal(layout.inspector, layout.workspace, 'Inspector spans stage and timeline')
  assert.ok(layout.labels.every(height => height < 20), 'Preview labels stay on one line')
  await screenshot('animation')
  await panel.getByText('播放设置', { exact: true }).click()
  await panel.getByLabel('循环', { exact: true }).selectOption('count')
  assert.equal(await panel.getByLabel('循环次数', { exact: true }).inputValue(), '2')
  assert.equal(await panel.locator('.animation-settings').getAttribute('open'), '', 'Open group survives form edits')
  await panel.getByRole('button', { name: '撤销', exact: true }).click()
  await panel.getByText('播放设置', { exact: true }).click()

  await page.getByRole('tab', { name: '角色浏览器', exact: true }).click()
  const character = page.getByLabel('角色名称', { exact: true })
  await character.waitFor()
  metrics.character = await geometry(character)
  assert.equal(metrics.character.height, metrics.animation.height)
  assert.equal(metrics.character.background, metrics.animation.background)
  await screenshot('character')

  await page.locator('#files button[data-path="scene.qs"]').click()
  await page.locator('#tab-properties').click()
  const visual = page.locator('#visual-editor')
  await visual.locator('select[aria-label="当前语句"] option[value="0"]').waitFor({ state: 'attached' })
  await visual.getByLabel('当前语句', { exact: true }).selectOption('0')
  metrics.visual = await geometry(visual.getByLabel('说话角色', { exact: true }))
  assert.equal(metrics.visual.height, metrics.animation.height)
  assert.equal(metrics.visual.background, metrics.animation.background)
  await screenshot('visual')

  await page.getByRole('button', { name: '编辑器设置', exact: true }).click()
  const settings = page.locator('#settings-dialog')
  metrics.settings = await geometry(settings.getByLabel('字体大小', { exact: true }))
  assert.equal(metrics.settings.height, metrics.animation.height)
  const toggle = settings.getByLabel('显示代码缩略图', { exact: true })
  const checked = await toggle.isChecked()
  await settings.locator('label[for="setting-minimap"]').click()
  assert.equal(await toggle.isChecked(), !checked, 'Native label toggles the checkbox')
  await toggle.focus()
  await toggle.press('Space')
  assert.equal(await toggle.isChecked(), checked, 'Space preserves native checkbox behavior')
  await settings.getByLabel('缩进宽度', { exact: true }).focus()
  // Native select typeahead avoids OS popup windows that CDP cannot drive.
  await page.keyboard.press('4')
  await page.keyboard.press('Tab')
  assert.equal(await settings.getByLabel('缩进宽度', { exact: true }).inputValue(), '4')
  await settings.getByLabel('字体大小', { exact: true }).focus()
  await screenshot('settings')
  await page.keyboard.press('Escape')
  assert.equal(await settings.isVisible(), false)

  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('new-project').click())
  const project = page.locator('#project-create-dialog')
  await project.waitFor()
  metrics.project = await geometry(project.getByLabel('项目名称', { exact: true }))
  assert.equal(metrics.project.height, metrics.animation.height)
  assert.equal(metrics.project.background, metrics.animation.background)
  assert.equal(await project.getByLabel('位置', { exact: true }).getAttribute('readonly'), '')
  await project.getByLabel('项目名称', { exact: true }).fill('Invalid name')
  assert.equal(await project.getByLabel('项目名称', { exact: true }).evaluate(input => input.checkValidity()), false)
  await project.getByLabel('项目名称', { exact: true }).fill('my-game')
  await screenshot('project')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: '动画', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1024, 780))
  const overflow = await panel.evaluate((element) => {
    const inspector = element.querySelector('.animation-inspector')
    return { panel: element.scrollWidth - element.clientWidth, inspector: inspector.scrollWidth - inspector.clientWidth }
  })
  assert.ok(overflow.panel <= 1 && overflow.inspector <= 1, JSON.stringify(overflow))
  await screenshot('compact')
  assert.equal(await readFile(join(fixture, 'enter.animation.json'), 'utf8'), source, 'Form QA does not save source files')
  assert.deepEqual(errors, [])
  await writeFile(join(artifacts, 'metrics.json'), JSON.stringify(metrics, null, 2))
  process.stdout.write('Editor controls: shared geometry/palette, units, numeric validation, labels, native keyboard controls, inspector layout and compact window passed.\n')
}
catch (error) {
  await screenshot('failure').catch(() => {})
  throw error
}
finally {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
  await app.close()
  await rm(temporary, { recursive: true, force: true })
}
