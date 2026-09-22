import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron } from 'playwright'

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
