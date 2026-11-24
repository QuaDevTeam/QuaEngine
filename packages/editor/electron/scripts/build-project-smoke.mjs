import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTestEditor, editorTestApp, firstTestWindow, launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editor = join(root, 'packages/editor/electron')
const require = createRequire(join(editor, 'package.json'))
const scratch = await realpath(await mkdtemp(join(tmpdir(), 'qua-build-e2e-')))
const project = join(scratch, 'game')
let app
try {
  await mkdir(project)
  await copyFile(join(root, 'demo/public/favicon.png'), join(project, 'icon.png'))
  await symlink(join(root, 'demo/node_modules'), join(project, 'node_modules'), 'dir')
  await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'build-test', type: 'module', scripts: { 'dev:web': 'vite' } }))
  await writeFile(join(project, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Build fixture', bundleId: 'dev.qua.build', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(project, 'index.html'), '<!doctype html><title>Build draft</title><main>Saved text</main>')
  // Hold the real Vite build in an ordinary project hook until the editor cancels the process.
  const config = join(project, 'vite.config.mjs')
  await writeFile(config, 'export default { plugins: [{ name: "slow-fixture", async buildStart() { await new Promise(resolve => setTimeout(resolve, 60000)) } }] }')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await launchEditor({ executablePath: require('electron'), args: [editorTestApp, '--project', project], env })
  const page = await firstTestWindow(app)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const openBuild = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('build-project').click())
  await page.locator('#files [data-path="index.html"]').click()
  await page.locator('#editor .view-lines').filter({ hasText: 'Saved text' }).waitFor()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.insertText('<p>Draft shipped</p>')
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '●' }).waitFor()
  await openBuild()
  const dialog = page.getByRole('dialog', { name: '生产打包' })
  await dialog.getByRole('button', { name: '开始打包' }).click()
  await dialog.locator('.build-steps li[data-phase="running"]').filter({ hasText: '构建游戏代码' }).waitFor()
  await dialog.getByRole('button', { name: '后台运行' }).click()
  await openBuild()
  await dialog.getByRole('button', { name: '取消打包' }).click()
  await dialog.getByRole('status').filter({ hasText: '打包已取消' }).waitFor()
  assert.match(await readFile(join(project, 'index.html'), 'utf8'), /Draft shipped/u)

  await writeFile(config, 'throw new Error("Fixture compilation failure")')
  await dialog.getByRole('button', { name: '重新打包' }).click()
  await dialog.locator('.build-log[open] pre').filter({ hasText: 'Fixture compilation failure' }).waitFor()
  assert.equal(await dialog.locator('.build-steps li[data-phase="error"]').count(), 1)

  await rm(config)
  await dialog.getByRole('button', { name: '重新打包' }).click()
  await dialog.locator('.build-output code').waitFor()
  const artifact = await dialog.locator('.build-output code').textContent()
  assert.match(relative(project, artifact), /^dist[/\\]web-production[/\\]/u)
  assert.match(await readFile(join(artifact, 'index.html'), 'utf8'), /Draft shipped/u)
  assert.equal(JSON.parse(await readFile(join(artifact, 'target-bundle-manifest.json'), 'utf8')).profile, 'release')
  assert.equal(await dialog.locator('.build-steps li[data-phase="completed"]').count(), 4)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await openBuild()
  assert.equal(await dialog.locator('.build-output code').textContent(), artifact)
  assert.deepEqual(errors, [])
  process.stdout.write('Production build saved the draft, survived backgrounding, cancelled, recovered from a compile error and produced the verified Web artifact.\n')
}
catch (error) {
  const page = app?.windows()[0]
  console.error(await page?.locator('#production-build').textContent({ timeout: 2000 }).catch(() => 'Build panel unavailable'))
  throw error
}
finally {
  await app?.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }).catch(() => {})
  await closeTestEditor(app)
  await rm(scratch, { recursive: true, force: true })
}
