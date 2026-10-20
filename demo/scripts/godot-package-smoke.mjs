import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertTargetBundleManifest } from '@quajs/native-contracts'

const demo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(demo, 'dist/godot/workspace')
const output = join(demo, '.generated/godot-package-smoke')
const fixture = await mkdtemp(join(tmpdir(), 'qua-godot-package-'))
const identity = basename(fixture)
const userRoot = process.platform === 'darwin' ? join(homedir(), 'Library/Application Support') : process.platform === 'win32' ? process.env.APPDATA : process.env.XDG_DATA_HOME || join(homedir(), '.local/share')
const godot = process.env.GODOT_BIN || (process.platform === 'darwin' ? '/Applications/Godot.app/Contents/MacOS/Godot' : 'godot')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

async function run() {
  return new Promise((resolve, reject) => {
    const child = spawn(godot, ['--headless', '--path', fixture, '--quit-after', '180'], { cwd: fixture, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => log += bytes.toString())
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Godot package smoke timed out'))
    }, 30000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, log })
    })
  })
}

try {
  await mkdir(output, { recursive: true })
  // No source links, npm packages, imported-editor cache or source working directory.
  await cp(source, fixture, { recursive: true, dereference: true, filter: path => !path.split(/[\\/]/).includes('.godot') })
  const manifest = JSON.parse(await readFile(join(fixture, 'target-bundle-manifest.json'), 'utf8'))
  assertTargetBundleManifest(manifest, { expectedTarget: 'godot' })
  const graph = JSON.parse(await readFile(join(fixture, 'retained-module-graph.json'), 'utf8'))
  assertTargetBundleManifest({ ...manifest, projectGraphs: [{ id: 'relocated.post-bundle', kind: 'post-bundle', references: graph.modules }] }, { expectedTarget: 'godot' })
  const runtime = await readFile(join(fixture, 'qua/runtime.js'), 'utf8')
  assert(!runtime.includes(demo), 'Runtime retained the source checkout path')
  const configPath = join(fixture, 'project.godot')
  const config = await readFile(configPath, 'utf8')
  await writeFile(configPath, config.replace(/config\/custom_user_dir_name\s*=.*\n/, `config/custom_user_dir_name="${identity}"\n`))
  const relocated = await run()
  await writeFile(join(output, 'relocated.log'), relocated.log)
  assert.equal(relocated.code, 0, relocated.log)
  assert(relocated.log.includes('QUA_GODOT_READY'), relocated.log)
  const qpk = (await readdir(join(fixture, 'qua'))).find(file => file.endsWith('.qpk'))
  assert(qpk, 'Missing generated QPK')
  const qpkPath = join(fixture, 'qua', qpk)
  const bytes = await readFile(qpkPath)
  const qpkHash = hash(bytes)
  bytes[bytes.length - 1] ^= 1
  await writeFile(qpkPath, bytes)
  const tampered = await run()
  await writeFile(join(output, 'tampered.log'), tampered.log)
  assert.notEqual(tampered.code, 0, 'Modified QPK must fail startup')
  assert(!tampered.log.includes('QUA_GODOT_READY'), tampered.log)
  assert(/hash|integrity/i.test(tampered.log), tampered.log)
  await writeFile(join(output, 'report.json'), `${JSON.stringify({ platform: `${process.platform}-${process.arch}`, runtimeSha256: hash(runtime), qpkSha256: qpkHash, relocated: { exitCode: relocated.code, ready: true }, tampered: { exitCode: tampered.code, rejected: true }, retainedModules: graph.modules.length }, null, 2)}\n`)
  process.stdout.write(`Godot relocation, isolation and integrity passed: ${output}\n`)
}
finally {
  await rm(fixture, { recursive: true, force: true })
  if (userRoot)
    await rm(join(userRoot, identity), { recursive: true, force: true })
}
