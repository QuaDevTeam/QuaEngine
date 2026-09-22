import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(repository, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const directory = await realpath(
  await mkdtemp(join(tmpdir(), 'qua-publish-smoke-')),
)
const root = join(directory, 'project')
await mkdir(join(root, 'dist'), { recursive: true })
await writeFile(
  join(root, 'package.json'),
  JSON.stringify(
    {
      name: 'qua-publish-smoke',
      version: '1.2.3',
      type: 'module',
      packageManager: 'npm@11.0.0',
      files: ['dist'],
      scripts: {
        prepack:
          'node -e "require(\'fs\').writeFileSync(\'executed.txt\',\'bad\')"',
      },
      quajs: {
        extension: {
          schemaVersion: 1,
          id: 'fixture.publish',
          title: 'Publishing fixture',
          runtime: { entry: './dist/index.js' },
          devtools: { apiVersion: 1, entry: './dist/editor.js' },
        },
      },
    },
    null,
    2,
  ),
)
await writeFile(join(root, 'dist/index.js'), 'export const runtime = {}')
await writeFile(join(root, 'dist/editor.js'), 'export const editorPlugin = {}')
const env = { ...process.env, QUA_EDITOR_PLUGIN_REGISTRY: '' }
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
const artifacts = join(repository, '.codex-tmp/editor-publishing-smoke')
await mkdir(artifacts, { recursive: true })
try {
  await page
    .locator('#files[data-project-name="Publishing fixture"]')
    .waitFor({ timeout: 30000 })
  await page.locator('#activity-extensions').click()
  const market = page.locator('#plugin-marketplace')
  await market.getByRole('tab', { name: '发布', exact: true }).click()
  await market.getByRole('button', { name: '打包并检查文件' }).click()
  await market.locator('.publisher-artifact').waitFor({ timeout: 30000 })
  assert.match(
    await market.locator('.publisher-artifact').textContent(),
    /qua-publish-smoke@1.2.3/,
  )
  assert.match(
    await market.locator('.publisher-artifact').textContent(),
    /sha512-/,
  )
  assert.match(
    await market.locator('.publisher-artifact pre').textContent(),
    /dist\/editor.js/,
  )
  assert.equal(
    await market
      .getByRole('button', { name: '发布 1.2.3 到 npm', exact: true })
      .isEnabled(),
    true,
  )
  assert.equal(
    await stat(join(root, 'executed.txt')).catch(() => undefined),
    undefined,
  )
  await page.screenshot({ path: join(artifacts, 'publication-preview.png') })
  await market.getByRole('tab', { name: '项目内', exact: true }).click()
  assert.equal(await market.locator('.plugin-publisher').isVisible(), false)
  await market.getByRole('tab', { name: '发布', exact: true }).click()
  await market.locator('.publisher-artifact').waitFor()
  assert.deepEqual(errors, [])
  process.stdout.write(
    'Publishing: standalone plugin project, runtime + devtools identity, real npm pack, lifecycle suppression, archive file/hash preview and retained preview across tabs passed; no package published\n',
  )
}
catch (error) {
  await page
    .screenshot({ path: join(artifacts, 'failure.png') })
    .catch(() => {})
  console.error(errors)
  throw error
}
finally {
  await app.close()
  await rm(directory, { recursive: true, force: true })
}
