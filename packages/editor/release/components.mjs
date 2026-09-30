/* eslint-disable antfu/no-top-level-await */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { prerelease, valid, validRange } from 'semver'

const exec = promisify(execFile)
const repository = fileURLToPath(new URL('../../../', import.meta.url))
const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'))
const channel = process.env.QUA_EDITOR_CHANNEL ?? 'stable'
const version = process.env.QUA_EDITOR_COMPONENT_VERSION ?? config.componentVersion
const editorRange = process.env.QUA_EDITOR_COMPONENT_EDITOR_RANGE ?? config.componentEditorRange
if (!['stable', 'beta'].includes(channel) || !valid(version) || !validRange(editorRange) || (channel === 'stable' && prerelease(version)))
  throw new Error('Invalid component version, channel or compatibility range.')
const env = { ...process.env, QUA_EDITOR_COMPONENT_EDITOR_RANGE: editorRange, QUA_EDITOR_RUNTIME_VERSION: version, QUA_EDITOR_BOILERPLATE_VERSION: version }
// Only the template SDK dependency closure is built; Electron, UI and Novel Writer are not required.
if (process.env.QUA_EDITOR_SKIP_BUILD !== '1') {
  const roots = new Set()
  for (const name of ['visual-novel-vue', 'plugin']) {
    const template = JSON.parse(await readFile(join(repository, 'packages/build/create-qua-game/templates', name, 'package.json'), 'utf8'))
    for (const dependency of Object.keys({ ...template.dependencies, ...template.devDependencies })) {
      if (dependency.startsWith('@quajs/'))
        roots.add(dependency)
    }
  }
  await exec('pnpm', [...Array.from(roots).flatMap(name => ['--filter', `${name}...`]), 'build'], { cwd: repository, env, maxBuffer: 32 * 1024 * 1024 })
}
for (const script of ['build-sdk.mjs', 'build-boilerplate.mjs'])
  await exec(process.execPath, [join(repository, 'packages/editor/electron/scripts', script)], { cwd: repository, env, maxBuffer: 32 * 1024 * 1024 })
const output = join(repository, 'packages/editor/electron/dist/component-release', channel, version)
await mkdir(output, { recursive: true })
const tag = `editor-components-${channel}-v${version}`
for (const [id, source] of [['boilerplate', 'components/boilerplate'], ['runtime', 'sdk']]) {
  const name = `QuaEngine-Editor-${channel}-${id}-${version}.tar.gz`
  await exec('tar', ['-czf', join(output, name), '-C', join(repository, 'packages/editor/electron/dist', source), '.'])
  const bytes = await readFile(join(output, name))
  const release = { component: id, version, editorRange, url: `https://github.com/${config.repository}/releases/download/${tag}/${name}`, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }
  await writeFile(join(output, `${id}.json`), `${JSON.stringify({ schemaVersion: 1, product: 'quaengine-editor-components', channel, component: id, releases: [release] }, null, 2)}\n`)
}
process.stdout.write(`Components ${channel} ${version}: ${output}\n`)
