import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { _electron } from 'playwright'
import { stopScenarioTree } from './stop-scenario.mjs'

export const editorTestApp = process.env.QUA_EDITOR_E2E_APP || fileURLToPath(new URL('../', import.meta.url))

export async function firstTestWindow(app, options) {
  const child = app.process()
  let diagnostics = ''
  const remember = (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-8192)
  }
  child.stderr?.on('data', remember)
  try {
    return await app.firstWindow(options)
  }
  catch (error) {
    // A process stuck before window creation may also never answer app.close().
    // Terminate only the test application while preserving the original error.
    if (diagnostics)
      process.stderr.write(diagnostics)
    await stopScenarioTree(child)
    throw error
  }
  finally {
    child.stderr?.off('data', remember)
  }
}

/** Never let a smoke test read or change the developer's editor profile. */
export async function launchEditor(options) {
  const profile = await mkdtemp(join(tmpdir(), 'qua-smoke-profile-'))
  try {
    const app = await _electron.launch({ ...options, args: [...options.args, `--user-data-dir=${profile}`] })
    app.process().once('exit', () => void rm(profile, { recursive: true, force: true }).catch(() => {}))
    return app
  }
  catch (error) {
    await rm(profile, { recursive: true, force: true })
    throw error
  }
}

export async function closeTestEditor(app, { destroyWindows = false } = {}) {
  if (!app || app.process().exitCode !== null || app.process().signalCode !== null)
    return
  try {
    if (process.env.QUA_EDITOR_E2E_SNAPSHOTS) {
      const ui = pathToFileURL(`${join(editorTestApp, 'dist/ui')}/`).href
      for (const page of app.windows()) {
        if (!page.isClosed() && page.url().startsWith(ui))
          await page.evaluate(() => window.dispatchEvent(new Event('editor-e2e-coverage-finish')))
      }
    }
  }
  finally {
    if (destroyWindows)
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
    await app.close()
  }
}
