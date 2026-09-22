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
const temporary = await mkdtemp(join(tmpdir(), 'qua-outline-'))
const fixture = join(temporary, 'project')
const artifacts = resolve(root, '.codex-tmp/editor-outline-smoke')
await mkdir(artifacts, { recursive: true })
await mkdir(fixture)
await writeFile(join(fixture, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Outline fixture', bundleId: 'dev.qua.outline', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'outline', scripts: { 'dev:web': 'vite' } }))
const scene = '@Chapter("01", { title: "实时章节" })\n@Scene("room")\n  @Node(\n    "door",\n    { title: "门后的声音" }\n  )\n  凛: 有人在吗？\n'
await writeFile(join(fixture, 'scene.qs'), scene)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', join(root, 'demo'), `--user-data-dir=${join(temporary, 'profile')}`], env, timeout: 60000 })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.locator('#activity-story').click()
  await page.locator('#sidebar-title').filter({ hasText: '故事大纲' }).waitFor()
  await page.locator('#story [data-symbol="00"]').waitFor({ timeout: 30000 })
  assert.equal(await page.locator('#view-story .section-heading').count(), 0)
  assert.ok(await page.locator('#story .tree-row').count() < 70, 'outline DOM must remain viewport bounded')
  assert.equal(await page.locator('#story .tree-row').first().evaluate(row => row.getBoundingClientRect().height), 22)
  await page.screenshot({ path: join(artifacts, 'demo-outline.png') })
  const input = page.locator('#outline-search')
  await input.fill('商店街')
  const street = page.locator('#story [data-kind="node"][data-symbol="prologue-street"]')
  await street.waitFor()
  await street.click()
  await page.locator('#document-name').filter({ hasText: 'prologue-arrival.qs' }).waitFor()
  const source = await readFile(join(root, 'demo/src/game/scenes/prologue-arrival.qs'), 'utf8')
  const line = source.split('\n').findIndex(line => line.startsWith('@Node(\'prologue-street\'')) + 1
  await page.locator('#cursor-position').filter({ hasText: `行 ${line}，列 1` }).waitFor()
  await page.screenshot({ path: join(artifacts, 'demo-source-jump.png') })
  await input.fill('提前结束这次委托')
  const choice = page.locator('#story [data-kind="choice"][data-symbol="early-handoff"]')
  await choice.waitFor()
  await choice.click()
  await page.locator('#document-name').filter({ hasText: 'chapter-05.qs' }).waitFor()
  const choiceSource = await readFile(join(root, 'demo/src/game/scenes/chapter-05.qs'), 'utf8')
  const choiceLine = choiceSource.split('\n').findIndex(line => line.startsWith('@Choice(') && line.includes('id: \'early-handoff\'')) + 1
  assert.ok(choiceLine > 0, 'Demo contains the early-handoff choice')
  await page.locator('#cursor-position').filter({ hasText: `行 ${choiceLine}，列 1` }).waitFor()
  await input.fill('下一次见面')
  await page.locator('#story [data-kind="chapter"]').filter({ hasText: '下一次见面' }).waitFor()
  await page.locator('#outline-collapse').click()
  assert.equal(await page.locator('#story [aria-expanded="true"]').count(), 0)
  await page.locator('#story').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.locator('#document-name').filter({ hasText: 'prologue-arrival.qs' }).waitFor()
  await page.locator('#outline-reveal').click()
  const active = await page.locator('#story').getAttribute('aria-activedescendant')
  assert.equal(await page.locator(`#${active}`).getAttribute('data-path'), 'src/game/scenes/prologue-arrival.qs')
  await app.evaluate(({ dialog, Menu }, project) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] })
    Menu.getApplicationMenu().getMenuItemById('open-project').click()
  }, fixture)
  await page.locator('#files[data-project-name="Outline fixture"]').waitFor({ state: 'attached' })
  await page.locator('#story [data-symbol="door"]').click()
  await page.locator('#cursor-position').filter({ hasText: '行 3，列 3' }).waitFor()
  await writeFile(join(fixture, 'scene.qs'), `// 新增注释\n${scene.replace('门后的声音', '更新后的声音')}`)
  await page.locator('#story [data-symbol="door"]').filter({ hasText: '更新后的声音' }).waitFor({ timeout: 20000 })
  await page.locator('#story [data-symbol="door"]').click()
  await page.locator('#cursor-position').filter({ hasText: '行 4，列 3' }).waitFor()
  await writeFile(join(fixture, 'broken.qs'), '@Node("broken"')
  await page.locator('#outline-message').filter({ hasText: '1 个文件无法解析' }).waitFor({ timeout: 20000 })
  assert.equal(await page.locator('#story [data-symbol="door"]').count(), 1)
  await rm(join(fixture, 'broken.qs'))
  await page.locator('#outline-message').waitFor({ state: 'hidden', timeout: 20000 })
  await rm(join(fixture, 'scene.qs'))
  await page.locator('#outline-message').filter({ hasText: '项目中暂无故事声明' }).waitFor({ timeout: 20000 })
  assert.deepEqual(errors, [])
  await rm(join(artifacts, 'failure.png'), { force: true })
  process.stdout.write('Outline: real Demo hierarchy, exact node/choice jumps, keyboard navigation, virtualization, multiline locations, live title/line updates, parse errors and deletion passed\n')
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
