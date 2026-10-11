import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { it } from 'vitest'

it('rejects a concurrent Creator build before changing the workspace or owner lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qua-creator-lock-'))
  const workspace = join(root, 'workspace')
  const lock = `${workspace}.creator-build-lock`
  await mkdir(lock)
  await mkdir(workspace)
  await writeFile(join(lock, 'owner.json'), '{"pid":123,"platform":"web-desktop"}')
  await writeFile(join(workspace, 'marker'), 'untouched')
  try {
    await assert.rejects(promisify(execFile)(process.execPath, ['scripts/cocos-build.mjs', 'mac', '--no-generate'], { env: { ...process.env, QUA_COCOS_WORKSPACE: workspace } }), /Another Creator build owns/)
    assert.equal(await readFile(join(lock, 'owner.json'), 'utf8'), '{"pid":123,"platform":"web-desktop"}')
    assert.equal(await readFile(join(workspace, 'marker'), 'utf8'), 'untouched')
  }
  finally {
    await rm(root, { recursive: true })
  }
})
