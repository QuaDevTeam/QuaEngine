import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { prepareEditorInstall } from '../src/release/install.ts'
import { firstTestWindow, launchEditor } from './smoke-profile.mjs'

const archive = process.argv[2]
if (!archive)
  throw new Error('Pass the packaged editor tar.gz to smoke test.')
const scratch = await mkdtemp(join(tmpdir(), 'qua-packaged-smoke-'))
let app
let child
let summary
try {
  await promisify(execFile)('tar', ['-xzf', resolve(archive), '-C', scratch])
  const [application] = await readdir(scratch)
  const name = application.includes('beta') ? 'quaengine-editor-beta' : 'quaengine-editor'
  const executablePath = process.platform === 'darwin'
    ? join(scratch, application, 'Contents/MacOS', name)
    : join(scratch, application, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
  const env = { ...process.env, NOVEL_WRITER_HOME: join(scratch, 'writing') }
  delete env.ELECTRON_RUN_AS_NODE
  app = await launchEditor({ executablePath, args: process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : [], env, timeout: 30000 })
  child = app.process()
  const page = await firstTestWindow(app)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#editor-update').waitFor()
  const projectParent = join(scratch, 'projects')
  await mkdir(projectParent)
  const assets = await app.evaluate(async ({ app, dialog, net }, parent) => {
    const { readFile, readdir } = process.getBuiltinModule('node:fs/promises')
    const { join } = process.getBuiltinModule('node:path')
    const dist = join(app.getAppPath(), 'dist')
    const runtime = JSON.parse(await readFile(join(dist, 'sdk/index.json'), 'utf8'))
    const templates = await readdir(join(dist, 'components/boilerplate/visual-novel-vue/src'))
    const metadata = JSON.parse(await readFile(join(dist, 'release-channel.json'), 'utf8'))
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [parent] })
    // This smoke covers offline distribution contents; provider/network tests are separate.
    net.fetch = async () => {
      throw new Error('Offline package smoke')
    }
    return { packaged: app.isPackaged, packages: Object.keys(runtime).length, templates, metadata }
  }, projectParent)
  assert.equal(assets.packaged, true)
  assert.ok(assets.packages > 0 && assets.templates.length > 0)
  const project = await page.evaluate(async () => {
    await window.quaEditor.chooseProjectLocation()
    const project = await window.quaEditor.createProject({ name: 'packaged-story', kind: 'game' })
    await window.quaEditor.cancelRuntime()
    return project
  })
  assert.ok(project.entries.some(entry => entry.path.endsWith('.qs')), 'Packaged templates create real story source through the worker')
  const terminalPid = await page.evaluate(async (root) => {
    const terminal = await window.quaEditor.createTerminal(root, 80, 24)
    await window.quaEditor.closeTerminal(terminal.id)
    return terminal.pid
  }, project.root)
  assert.ok(terminalPid > 0, 'Packaged native PTY and spawn helper work')
  const [writer] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 30000 }),
    page.locator('#activity-writer').click(),
  ])
  await writer.getByRole('button', { name: '新建项目', exact: true }).waitFor()
  assert.equal(await writer.evaluate(() => typeof window.quaNovelWriter?.dirty), 'function')
  await page.locator('#tab-source').click()
  const state = await page.evaluate(() => window.quaEditor.editorUpdateState())
  assert.equal(state.app.installSupported, true)
  assert.equal(state.app.channel, assets.metadata.channel)
  assert.equal(state.app.currentVersion, assets.metadata.version)
  const metadata = JSON.parse(await readFile(join(resolve(archive), '../artifact-metadata.json'), 'utf8'))
  const prepared = await prepareEditorInstall({ archivePath: resolve(archive), format: 'tar.gz', installRoot: join(scratch, application), executablePath, sha256: metadata.sha256, size: metadata.size, version: assets.metadata.version, channel: assets.metadata.channel, platform: state.app.platform, arch: state.app.arch, signingTeamId: assets.metadata.signingTeamId }, join(scratch, 'helpers'), resolve('packages/editor/electron/src/release'))
  await prepared.discard()
  const output = resolve('.codex-tmp/editor-packaged-smoke')
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: join(output, 'packaged-editor.png') })
  assert.deepEqual(errors, [])
  summary = `Packaged ${state.app.channel} ${state.app.currentVersion}: standalone launch, ${assets.packages} SDK packages, complete templates, project creation, worker IPC, native terminal, embedded Novel Writer, real update staging and clean exit passed.\n`
}
finally {
  if (app) {
    // A native startup error dialog can block the main process and its debugging connection.
    const terminate = setTimeout(() => child.kill('SIGKILL'), 5000)
    try {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
      await app.close().catch(() => {})
    }
    finally {
      clearTimeout(terminate)
    }
  }
  await rm(scratch, { recursive: true, force: true })
}
assert.equal(child.signalCode, null, 'Packaged editor should exit without a signal')
assert.equal(child.exitCode, 0, 'Packaged editor should exit successfully')
process.stdout.write(summary)
