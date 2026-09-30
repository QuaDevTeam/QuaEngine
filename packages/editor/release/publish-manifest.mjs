/* eslint-disable antfu/no-top-level-await */
import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.env.RELEASE_ARTIFACTS_ROOT
const output = process.env.RELEASE_OUTPUT
const channel = process.env.QUA_EDITOR_CHANNEL
const version = process.env.QUA_EDITOR_VERSION
const baseUrl = (process.env.QUA_EDITOR_RELEASE_BASE_URL ?? '').replace(/\/$/u, '')
if (!root || !output || !['stable', 'beta'].includes(channel) || !version || !baseUrl.startsWith('https://'))
  throw new Error('Release manifest inputs are incomplete.')
await mkdir(output, { recursive: true })
const metadata = []
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      await visit(path)
    else if (entry.name === 'artifact-metadata.json')
      metadata.push({ ...JSON.parse(await readFile(path, 'utf8')), directory })
  }
}
await visit(root)
const expected = new Set(['macos-arm64', 'windows-x64', 'linux-x64'])
const artifacts = []
for (const item of metadata) {
  const target = `${item.platform}-${item.arch}`
  if (!expected.delete(target) || item.channel !== channel || item.version !== version
    || item.fileName !== `QuaEngine-Editor-${channel}-${target}.tar.gz`) {
    throw new Error(`Unexpected or duplicate release artifact: ${target}`)
  }
  const path = join(item.directory, item.fileName)
  const bytes = await readFile(path)
  if (bytes.length !== item.size || createHash('sha256').update(bytes).digest('hex') !== item.sha256)
    throw new Error(`Release checksum mismatch: ${target}`)
  if (item.platform === 'macos' && (!item.macosSigning
    || !/^[A-Z0-9]{10}$/u.test(item.macosSigning.teamId ?? '')
    || !item.macosSigning.identity?.startsWith('Developer ID Application: ')
    || !item.macosSigning.identity.endsWith(`(${item.macosSigning.teamId})`)
    || !['hardenedRuntime', 'notarized', 'stapled', 'gatekeeper'].every(key => item.macosSigning[key] === true))) {
    throw new Error('macOS publication requires a signed, notarized, stapled and Gatekeeper-verified archive.')
  }
  await cp(path, join(output, item.fileName))
  artifacts.push({ platform: item.platform, arch: item.arch, format: 'tar.gz', url: `${baseUrl}/${item.fileName}`, sha256: item.sha256, size: item.size })
}
if (expected.size)
  throw new Error(`Missing editor artifacts: ${[...expected].join(', ')}`)
const manifest = { schemaVersion: 1, product: 'quaengine-editor', channel, version, publishedAt: new Date().toISOString(), artifacts }
await writeFile(join(output, `QuaEngine-Editor-${channel}-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`Manifest contains ${artifacts.length} verified editor artifacts.\n`)
