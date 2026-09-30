// Release tooling is an isolated workspace: validate with Node's built-in runner.
/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
test('channel manifest requires every platform and verifies actual release bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'editor-release-'))
  try {
    const env = { ...process.env, RELEASE_ARTIFACTS_ROOT: join(root, 'artifacts'), RELEASE_OUTPUT: join(root, 'output'), QUA_EDITOR_CHANNEL: 'stable', QUA_EDITOR_VERSION: '0.1.1', QUA_EDITOR_RELEASE_BASE_URL: 'https://example.test/editor-v0.1.1' }
    const publish = () => exec(process.execPath, [fileURLToPath(new URL('./publish-manifest.mjs', import.meta.url))], { env })
    await mkdir(env.RELEASE_ARTIFACTS_ROOT)
    await assert.rejects(publish(), /Missing editor artifacts/u)
    for (const [platform, arch] of [['macos', 'arm64'], ['windows', 'x64'], ['linux', 'x64']]) {
      const directory = join(env.RELEASE_ARTIFACTS_ROOT, platform)
      await mkdir(directory)
      const fileName = `QuaEngine-Editor-stable-${platform}-${arch}.tar.gz`
      const bytes = Buffer.from(`artifact for ${platform}`)
      await writeFile(join(directory, fileName), bytes)
      await writeFile(join(directory, 'artifact-metadata.json'), JSON.stringify({ channel: 'stable', version: '0.1.1', platform, arch, fileName, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...(platform === 'macos' ? { macosSigning: { teamId: 'ABCD123456', identity: 'Developer ID Application: Example (ABCD123456)', hardenedRuntime: true, notarized: true, stapled: true, gatekeeper: true } } : {}) }))
    }
    const macPath = join(env.RELEASE_ARTIFACTS_ROOT, 'macos/artifact-metadata.json')
    const macMetadata = JSON.parse(await readFile(macPath, 'utf8'))
    await writeFile(macPath, JSON.stringify({ ...macMetadata, macosSigning: undefined }))
    await assert.rejects(publish(), /macOS publication requires/u)
    await writeFile(macPath, JSON.stringify(macMetadata))
    await publish()
    const manifest = JSON.parse(await readFile(join(env.RELEASE_OUTPUT, 'QuaEngine-Editor-stable-manifest.json'), 'utf8'))
    assert.equal(manifest.artifacts.length, 3)
    assert.ok(manifest.artifacts.every(item => item.url.startsWith('https://example.test/editor-v0.1.1/')))
    await writeFile(join(env.RELEASE_ARTIFACTS_ROOT, 'linux/QuaEngine-Editor-stable-linux-x64.tar.gz'), 'tampered')
    await assert.rejects(publish(), /checksum mismatch/u)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

test('component publication retains compatible history and rejects overwriting a version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'editor-catalog-'))
  try {
    const current = join(root, 'current')
    const previous = join(root, 'previous')
    await mkdir(current)
    await mkdir(previous)
    for (const id of ['runtime', 'boilerplate']) {
      const catalog = { schemaVersion: 1, product: 'quaengine-editor-components', channel: 'stable', component: id }
      await writeFile(join(current, `${id}.json`), JSON.stringify({ ...catalog, releases: [{ version: '0.2.1', editorRange: '^0.2.0' }] }))
      await writeFile(join(previous, `${id}.json`), JSON.stringify({ ...catalog, releases: [{ version: '0.1.9', editorRange: '^0.1.0' }] }))
    }
    const merge = () => exec(process.execPath, [fileURLToPath(new URL('./merge-catalogs.mjs', import.meta.url)), current, previous])
    await merge()
    const merged = JSON.parse(await readFile(join(current, 'runtime.json'), 'utf8'))
    assert.deepEqual(merged.releases.map(item => item.version), ['0.2.1', '0.1.9'])
    for (const id of ['runtime', 'boilerplate'])
      await writeFile(join(previous, `${id}.json`), await readFile(join(current, `${id}.json`)))
    await assert.rejects(merge(), /versions are immutable/u)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
