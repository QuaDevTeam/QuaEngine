import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { _electron } from 'playwright'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(repository, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const directory = await realpath(await mkdtemp(join(tmpdir(), 'qua-project-setup-')))
const artifacts = join(repository, '.codex-tmp/editor-project-setup-smoke')
await mkdir(artifacts, { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, `--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60000 })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
async function ready() {
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.quaEditor.runtimeState())
    if (state && ['ready', 'error', 'cancelled'].includes(state.phase)) {
      assert.equal(state.phase, 'ready', JSON.stringify(state))
      return
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Runtime setup timed out')
}
async function create(name, kind) {
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('new-project').click())
  await page.locator('#project-create-dialog input[name="name"]').fill(name)
  await page.locator('#project-create-dialog select[name="kind"]').selectOption(kind)
  await page.locator('#project-create-dialog [data-action="location"]').click()
  await page.locator('#project-create-dialog button[type="submit"]').click()
  await page.locator('#project-create-dialog').waitFor({ state: 'hidden', timeout: 30000 })
  await ready()
}
try {
  await page.locator('#welcome-create').waitFor()
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] })
  }, directory)
  await create('example-plugin', 'plugin')
  assert.equal(await page.locator('.preview-pane').isVisible(), false)
  assert.equal(await page.locator('.dock-separator[data-split-id="editors"]').isVisible(), false)
  const plugin = join(directory, 'example-plugin')
  await promisify(execFile)('npm', ['run', 'build'], { cwd: plugin, env, maxBuffer: 1024 * 1024 })
  const pkg = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8'))
  assert.ok(pkg.devDependencies['@quajs/engine'].startsWith('file:./vendor/'))
  assert.equal(await page.evaluate(() => window.quaEditor.startPreview('web').then(() => false, () => true)), true)
  await page.screenshot({ path: join(artifacts, 'plugin.png') })

  // Duplicate creation must remain a reviewable error with the existing project intact.
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('new-project').click())
  await page.locator('#project-create-dialog button[type="submit"]').click()
  await page.waitForFunction(() => document.querySelector('.project-error')?.textContent?.includes('EEXIST'))
  await page.locator('#project-create-dialog [data-action="cancel"]').click()
  await create('example-game', 'game')
  assert.equal(await page.locator('.preview-pane').isVisible(), true)
  await page.locator('#run').click()
  await page.evaluate(() => new Promise((resolve) => {
    const dispose = window.quaEditor.onPreviewState((state) => {
      if (['running', 'error'].includes(state.phase)) {
        dispose()
        resolve(state)
      }
    })
    void window.quaEditor.previewState().then((state) => {
      if (['running', 'error'].includes(state.phase)) {
        dispose()
        resolve(state)
      }
    })
  }))
  const preview = await page.evaluate(() => window.quaEditor.previewState())
  assert.equal(preview.phase, 'running', JSON.stringify(preview))
  const gameManifest = JSON.parse(await readFile(join(directory, 'example-game/package.json'), 'utf8'))
  assert.equal(gameManifest.devDependencies['@quajs/engine-native'], undefined)
  let visible = false
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await page.evaluate(() => window.quaEditor.previewState())
    assert.equal(state.renderError, undefined, state.renderError)
    visible = await app.evaluate(async ({ webContents }) => {
      const view = webContents.getAllWebContents().find(contents => /^http:\/\/127\.0\.0\.1:/.test(contents.getURL()))
      return view ? view.executeJavaScript('Boolean(document.querySelector(".qua-stage") && document.body.textContent.includes("Welcome to"))') : false
    })
    if (visible)
      break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(visible, 'The starter must render an actual stage and opening dialogue')
  assert.equal(await app.evaluate(async ({ webContents }) => {
    const view = webContents.getAllWebContents().find(contents => /^http:\/\/127\.0\.0\.1:/.test(contents.getURL()))
    return view.executeJavaScript('Boolean(document.querySelector(".boot-message") || document.body.textContent.includes("Close"))')
  }), false, 'The opening scene must not be covered by an empty HUD or a stale startup message')
  await promisify(execFile)('npm', ['run', 'typecheck'], { cwd: join(directory, 'example-game'), env, maxBuffer: 1024 * 1024 })
  const afterCompile = await page.evaluate(() => window.quaEditor.previewState())
  assert.equal(afterCompile.renderError, undefined, afterCompile.renderError)
  const gameImage = await app.evaluate(async ({ webContents }) => {
    const view = webContents.getAllWebContents().find(contents => /^http:\/\/127\.0\.0\.1:/.test(contents.getURL()))
    return (await view.capturePage()).toPNG().toString('base64')
  })
  await writeFile(join(artifacts, 'game-stage.png'), Buffer.from(gameImage, 'base64'))
  await page.screenshot({ path: join(artifacts, 'game.png') })
  await page.evaluate(() => window.quaEditor.stopPreview())
  // An individually removed dependency must be repaired on an already installed project.
  const game = join(directory, 'example-game')
  await rm(join(game, 'node_modules/@quajs/engine'), { recursive: true })
  await page.evaluate(root => window.quaEditor.repairRuntime(root), game)
  await ready()
  assert.equal(JSON.parse(await readFile(join(game, 'node_modules/@quajs/engine/package.json'), 'utf8')).name, '@quajs/engine')
  assert.deepEqual(errors, [])
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ pluginBuild: true, gamePreview: preview.phase, repairedDependency: true, errors }, null, 2))
  process.stdout.write('Project creation, SDK installation, plugin build, Web preview and dependency repair passed.\n')
}
catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  process.stderr.write(`${JSON.stringify(await page.evaluate(() => window.quaEditor.runtimeState()).catch(() => undefined))}\n`)
  throw error
}
finally {
  await app.close()
  await rm(directory, { recursive: true, force: true })
}
