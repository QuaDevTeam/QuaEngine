import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { pluginFixture } from './plugin-fixture.mjs'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(repository, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const directory = await mkdtemp(join(tmpdir(), 'qua-marketplace-smoke-'))
const root = join(directory, 'project')
await mkdir(root)
await writeFile(
  join(root, 'package.json'),
  JSON.stringify({
    name: 'fixture',
    private: true,
    packageManager: 'npm@11.0.0',
  }),
)
await writeFile(
  join(root, 'qua.project.json'),
  JSON.stringify({
    schemaVersion: 1,
    name: 'Marketplace fixture',
    bundleId: 'dev.qua.marketplace',
    icons: { favicon: 'icon.png' },
    targets: { web: { enabled: true } },
  }),
)
await writeFile(
  join(root, 'scene.qs'),
  'Narrator: fixture indexed successfully',
)
const registry = await pluginFixture(join(directory, 'registry'))
const artifacts = join(repository, '.codex-tmp/editor-marketplace-smoke')
await mkdir(artifacts, { recursive: true })
const env = { ...process.env, QUA_EDITOR_NPM_REGISTRY: registry.base, QUA_EDITOR_PLUGIN_REGISTRY: '' }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  executablePath: require('electron'),
  args: [
    editorRoot,
    '--project',
    root,
    `--user-data-dir=${join(directory, 'profile')}`,
  ],
  env,
  timeout: 60000,
})
const page = await app.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', (msg) => {
  if (msg.type() === 'error')
    errors.push(msg.text())
})
async function toggle(id, title) {
  const tab = page.locator(`.dock-tab[data-dock-view="${id}"]`)
  if (await tab.isVisible()) {
    await tab.locator('.dock-tab-close').click()
  }
  else {
    await page.locator('#workbench-views').click()
    await page.locator('.dock-dialog').getByRole('button', { name: title, exact: true }).click()
  }
}

try {
  await page
    .locator('#files[data-project-name="Marketplace fixture"]')
    .waitFor({ state: 'attached', timeout: 30000 })
  assert.notEqual(
    await page.locator('#activity-story').innerHTML(),
    await page.locator('#activity-writer').innerHTML(),
  )
  await page.getByRole('tab', { name: '角色浏览器' }).click()
  await toggle('plugin-qua.character-characters', '角色浏览器')
  await page
    .locator('[id="tab-plugin-qua.character-characters"]')
    .waitFor({ state: 'hidden' })
  assert.equal(
    await page.locator('.dock-group[data-dock-group="tools"] [role=tab][aria-selected=true]').getAttribute('aria-selected'),
    'true',
  )
  await page.locator('#activity-story').click()
  assert.equal(await page.locator('.dock-tab[data-dock-view="story"]').count(), 0, 'Story is fixed navigation, not a dock tab')
  await page.reload()
  await page
    .locator('#files[data-project-name="Marketplace fixture"]')
    .waitFor({ state: 'attached', timeout: 30000 })
  assert.equal(await page.locator('.dock-tab[data-dock-view="story"]').isVisible(), false)
  assert.equal(
    await page
      .locator('[id="tab-plugin-qua.character-characters"]')
      .isVisible(),
    false,
  )
  await page.locator('#activity-story').click()
  await toggle('plugin-qua.character-characters', '角色浏览器')
  await page.locator('#story').waitFor({ state: 'visible' })
  await page
    .locator('[id="tab-plugin-qua.character-characters"]')
    .waitFor({ state: 'visible' })
  await page.locator('#activity-extensions').click()
  const market = page.locator('#plugin-marketplace')
  await market.getByRole('tab', { name: '插件市场', exact: true }).click()
  await market
    .getByLabel('搜索插件或输入 npm 包名')
    .fill('qua-fixture-devtools')
  await market.locator('[data-package="qua-fixture-devtools"]').click()
  await market.getByRole('button', { name: '安装到项目', exact: true }).click()
  await market
    .locator('.market-progress')
    .filter({ hasText: '安装完成' })
    .waitFor({ timeout: 60000 })
  await page
    .locator('[id="tab-plugin-fixture.devtools-browser"]')
    .waitFor({ state: 'attached', timeout: 30000 })
  const manifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  )
  assert.equal(manifest.devDependencies['qua-fixture-devtools'], '1.0.0')
  assert.equal(
    await stat(
      join(root, 'node_modules/qua-fixture-devtools/executed.txt'),
    ).catch(() => undefined),
    undefined,
  )
  await page.screenshot({ path: join(artifacts, 'marketplace-installed.png') })
  // Leave the market using the activity bar, then select the newly contributed panel.
  await page.getByRole('tab', { name: 'Fixture panel', exact: true }).click()
  await page
    .locator('.fixture-plugin')
    .filter({ hasText: 'fixture indexed successfully' })
    .waitFor({ timeout: 30000 })
  assert.equal(
    await page
      .locator('.fixture-plugin')
      .evaluate(host => getComputedStyle(host).color),
    'rgb(110, 200, 170)',
  )
  await toggle('plugin-fixture.devtools-browser', 'Fixture panel')
  await page
    .getByRole('tab', { name: 'Fixture panel', exact: true })
    .waitFor({ state: 'hidden' })
  await toggle('plugin-fixture.devtools-browser', 'Fixture panel')
  await page.getByRole('tab', { name: 'Fixture panel', exact: true }).click()
  await page.screenshot({ path: join(artifacts, 'installed-panel.png') })
  await page.locator('#activity-extensions').click()
  await market.getByRole('tab', { name: '项目内', exact: true }).click()
  await market.locator('[data-package="qua-fixture-devtools"]').click()
  const layout = await page.evaluate(() => {
    const workspace = document.querySelector('.workspace').getBoundingClientRect()
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect()
    const dock = document.querySelector('#dock-workspace').getBoundingClientRect()
    const market = document.querySelector('#plugin-marketplace')
    return { workspace: workspace.toJSON(), sidebar: sidebar.toJSON(), dock: dock.toJSON(), overflow: market.scrollWidth > market.clientWidth }
  })
  assert.equal(Math.round(layout.sidebar.width), 270, 'marketplace preserves the fixed sidebar')
  assert.ok(Math.abs(layout.dock.right - layout.workspace.right) <= 1, 'docked marketplace fills its workspace column')
  assert.equal(layout.overflow, false, 'narrow plugin panel must not overflow')
  await market.getByRole('button', { name: '停用 Devtools' }).click()
  await page
    .locator('[id="tab-plugin-fixture.devtools-browser"]')
    .waitFor({ state: 'detached' })
  assert.equal(await page.locator('link[href^="qua-plugin:"]').count(), 0)
  await market.getByRole('button', { name: '启用 Devtools' }).click()
  await page
    .locator('[id="tab-plugin-fixture.devtools-browser"]')
    .waitFor({ state: 'attached' })
  await page.reload()
  await page
    .locator('#files[data-project-name="Marketplace fixture"]')
    .waitFor({ state: 'attached', timeout: 30000 })
  await page.getByRole('tab', { name: 'Fixture panel', exact: true }).click()
  await page
    .locator('.fixture-plugin')
    .filter({ hasText: 'fixture indexed successfully' })
    .waitFor()
  assert.deepEqual(errors, [])
  process.stdout.write(
    'Marketplace: dock close/reopen, persistence, distinct activity icons, npm exact-version install, script suppression, runtime discovery, dynamic ESM + stylesheet + indexer, disable/enable and reload passed\n',
  )
}
catch (error) {
  process.stderr.write(`${JSON.stringify(errors)}\n`)
  await page
    .screenshot({ path: join(artifacts, 'failure.png') })
    .catch(() => {})
  throw error
}
finally {
  await app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      })
    })
    .catch(() => {})
  await app.close()
  await registry.close()
  await rm(directory, { recursive: true, force: true })
}
