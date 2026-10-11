import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { it } from 'vitest'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'qua-creator-publish-'))
  const workspace = join(root, 'workspace')
  await mkdir(join(workspace, 'qua-build'), { recursive: true })
  await mkdir(join(workspace, 'build/web-desktop'), { recursive: true })
  await writeFile(join(workspace, 'build/web-desktop/previous'), 'working')
  await writeFile(join(workspace, 'qua-import-meta.json'), JSON.stringify({ schemaVersion: 1, files: {} }))
  await writeFile(join(workspace, 'qua-build/web-desktop.build.json'), JSON.stringify({ scenes: [{ url: 'db://assets/main.scene' }] }))
  await writeFile(join(workspace, 'raw-artifact'), 'immutable')
  const creator = join(root, 'creator.mjs')
  await writeFile(creator, `#!/usr/bin/env node
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const workspace=process.argv[process.argv.indexOf('--project')+1];
writeFileSync(process.env.TEST_SCRATCH,workspace);
writeFileSync(join(workspace,'raw-artifact'),'modified by Creator');
if(process.env.TEST_FAIL==='true')process.exit(17);
const output=join(workspace,'build/web-desktop');
mkdirSync(join(output,'assets/main'),{recursive:true});
writeFileSync(join(output,'assets/main/config.json'),JSON.stringify({scenes:{'db://assets/main.scene':0}}));
writeFileSync(join(output,'index.html'),'new working output');
process.exit(36);
`)
  await chmod(creator, 0o755)
  const run = (fail = false) => promisify(execFile)(process.execPath, ['scripts/cocos-build.mjs', 'web-desktop', '--no-generate'], { env: { ...process.env, QUA_COCOS_WORKSPACE: workspace, COCOS_CREATOR: creator, QUA_COCOS_BUILD_LOGS: join(root, 'logs'), TEST_SCRATCH: join(root, 'scratch'), TEST_FAIL: String(fail) } })
  return { root, workspace, run }
}
it('builds in a private import copy, publishes complete output and removes owned scratch data', async () => {
  const { root, workspace, run } = await fixture()
  try {
    await run()
    assert.equal(await readFile(join(workspace, 'raw-artifact'), 'utf8'), 'immutable')
    assert.equal(await readFile(join(workspace, 'build/web-desktop/index.html'), 'utf8'), 'new working output')
    await assert.rejects(readFile(join(workspace, 'build/web-desktop/previous')), { code: 'ENOENT' })
    const scratch = await readFile(join(root, 'scratch'), 'utf8')
    await assert.rejects(readFile(join(scratch, 'raw-artifact')), { code: 'ENOENT' })
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
it('preserves the previous usable output and immutable source when Creator fails', async () => {
  const { root, workspace, run } = await fixture()
  try {
    await assert.rejects(run(true), /failed with exit code 17/)
    assert.equal(await readFile(join(workspace, 'build/web-desktop/previous'), 'utf8'), 'working')
    assert.equal(await readFile(join(workspace, 'raw-artifact'), 'utf8'), 'immutable')
    await assert.rejects(readFile(`${workspace}.creator-build-lock/owner.json`), { code: 'ENOENT' })
    const scratch = await readFile(join(root, 'scratch'), 'utf8')
    await assert.rejects(readFile(join(scratch, 'raw-artifact')), { code: 'ENOENT' })
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
