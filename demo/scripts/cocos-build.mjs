import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifactWorkspace = resolve(process.env.QUA_COCOS_WORKSPACE || join(root, 'dist/cocos/workspace'))
const creator = process.env.COCOS_CREATOR || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator'
const platform = process.argv[2] || 'web-desktop'
if (!['web-desktop', 'mac'].includes(platform))
  throw new Error(`Unsupported review platform: ${platform}`)
// Both platforms replace the same Creator import caches. Keep this lock beside
// the workspace, since generation atomically replaces the workspace directory.
const lock = `${artifactWorkspace}.creator-build-lock`
await mkdir(dirname(lock), { recursive: true })
try {
  await mkdir(lock)
}
catch (error) {
  if (error.code === 'EEXIST')
    throw new Error(`Another Creator build owns ${lock}. If its process has stopped, remove the stale lock before retrying.`)
  throw error
}
process.once('exit', () => rmSync(lock, { recursive: true, force: true }))
await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, platform, workspace: artifactWorkspace }))
let workspace = artifactWorkspace
const logs = resolve(process.env.QUA_COCOS_BUILD_LOGS || join(root, 'dist/cocos/review/logs'))
await mkdir(logs, { recursive: true })
async function run(command, args, name, success = [0]) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (bytes) => {
      log += bytes.toString()
      process.stdout.write(bytes)
    })
  }
  // Creator may leave helper processes holding stdout after its main process exits.
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  await new Promise(r => setTimeout(r, 100))
  child.stdout.destroy()
  child.stderr.destroy()
  await mkdir(logs, { recursive: true })
  await writeFile(join(logs, `${name}.log`), log)
  if (!success.includes(code))
    throw new Error(`${name} failed with exit code ${code}; see ${logs}`)
}
if (!process.argv.includes('--no-generate'))
  await run('pnpm', ['build:cocos'], 'workspace')
// Creator 3.8.8 can invalidate all importer types when another platform's
// database is reused. Build an immutable artifact copy with private imports.
workspace = await mkdtemp(join(tmpdir(), `qua-creator-${platform}-`))
process.once('exit', () => rmSync(workspace, { recursive: true, force: true }))
await cp(artifactWorkspace, workspace, {
  recursive: true,
  filter: path => !['build', 'library', 'temp', 'profiles'].includes(path.slice(artifactWorkspace.length + 1).split('/')[0]),
})
const config = join(workspace, `qua-build/${platform}.build.json`)
// This workspace is a regeneratable artifact. Creator may retain generic
// importer selections between CLI platforms; restore its authored metadata.
const importMetadata = JSON.parse(await readFile(join(workspace, 'qua-import-meta.json'), 'utf8'))
if (importMetadata.schemaVersion !== 1)
  throw new Error('Missing generated Creator import metadata contract.')
async function restoreImportMetadata() {
  for (const [path, metadata] of Object.entries(importMetadata.files)) {
    if (!/^assets\/[^:]+\.meta$/.test(path) || path.split('/').includes('..'))
      throw new Error(`Invalid generated metadata path: ${path}`)
    await writeFile(join(workspace, path), `${JSON.stringify(metadata, null, 2)}\n`)
  }
  await rm(join(workspace, 'library'), { recursive: true, force: true })
  await rm(join(workspace, 'temp'), { recursive: true, force: true })
}
// Creator can return 36 after reporting that the start scene was omitted.
// Validate the emitted asset bundle before publishing/making the application.
const platformRoot = join(workspace, `build/${platform}`, ...(platform === 'mac' ? ['data'] : []))
const requested = JSON.parse(await readFile(config, 'utf8'))
async function missingScenes() {
  const mainBundle = JSON.parse(await readFile(join(platformRoot, 'assets/main', platform === 'mac' ? 'cc.config.json' : 'config.json'), 'utf8'))
  return (requested.scenes || []).filter(scene => !(scene.url in (mainBundle.scenes || {})))
}
async function importWithEditor() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(creator, ['--project', workspace], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  let exited = false
  let launchError
  child.once('error', error => launchError = error)
  const completion = new Promise(resolve => child.once('exit', () => {
    exited = true
    resolve()
  }))
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (bytes) => { log += bytes.toString() })
  let importError
  let stopped
  let complete = false
  try {
    const deadline = Date.now() + 90000
    let settledSince
    while (Date.now() < deadline) {
      if (launchError)
        throw launchError
      if (exited)
        throw new Error('Creator closed before completing workspace import.')
      const imported = await Promise.all(Object.entries(importMetadata.files).map(async ([path, expected]) => {
        try {
          const actual = JSON.parse(await readFile(join(workspace, path), 'utf8'))
          return actual.importer === expected.importer && actual.imported === true
        }
        catch { return false }
      }))
      // Imported metadata can appear before the database commits its startup
      // records. Closing at that point can make the next CLI classify scenes
      // as generic files. Require the real ready signal and a stable interval.
      if (imported.every(Boolean) && log.includes('asset-db is ready!')) {
        settledSince ??= Date.now()
        if (Date.now() - settledSince >= 1500) {
          complete = true
          break
        }
      }
      else {
        settledSince = undefined
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!complete)
      throw new Error('Creator import did not finish with the requested asset types within 90 seconds.')
  }
  catch (error) {
    importError = error
  }
  finally {
    // This process was launched solely to import this generated workspace.
    // Keep the imported library for the following CLI build.
    if (!exited)
      child.kill('SIGTERM')
    let timer
    stopped = await Promise.race([completion.then(() => true), new Promise(resolve => timer = setTimeout(resolve, 10000, false))])
    clearTimeout(timer)
    child.stdout.destroy()
    child.stderr.destroy()
    await writeFile(join(logs, `${platform}-editor-import.log`), log)
  }
  if (!stopped)
    throw new Error('Validation Creator process did not exit; refusing a concurrent workspace build.')
  if (importError)
    throw importError
}
// Reuse a completed Creator import across platform builds. Replacing valid
// imports with cold metadata forces CLI generic-import fallback unnecessarily.
const importedWorkspace = await Promise.all(Object.entries(importMetadata.files).map(async ([path, expected]) => {
  try {
    const actual = JSON.parse(await readFile(join(workspace, path), 'utf8'))
    return actual.importer === expected.importer && actual.uuid === expected.uuid && actual.imported === true
  }
  catch { return false }
}))
if (!importedWorkspace.every(Boolean))
  await restoreImportMetadata()
await run(creator, ['--project', workspace, '--build', `configPath=${config};stage=build`], `${platform}-build`, [36])
if ((await missingScenes()).length) {
  console.warn('Creator CLI omitted the start scene. Restoring metadata and completing a full Editor import before one retry.')
  await restoreImportMetadata()
  await importWithEditor()
  await run(creator, ['--project', workspace, '--build', `configPath=${config};stage=build`], `${platform}-build-reimport`, [36])
}
const missing = await missingScenes()
if (missing.length)
  throw new Error(`Creator exit 36 omitted requested scene ${missing[0].url}; refusing to make or publish the application.`)
if (platform === 'mac')
  await run(creator, ['--project', workspace, '--build', `configPath=${config};stage=make`], 'mac-make', [36])
async function findApps(dir) {
  const apps = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue
    const path = join(dir, entry.name)
    if (entry.name.endsWith('.app'))
      apps.push(path)
    else apps.push(...await findApps(path))
  }
  return apps
}
// Publish only a completely validated platform artifact. Failed builds keep
// the previously working app/Web output; no partially imported files escape.
if (platform === 'mac' && !(await findApps(join(workspace, 'build/mac'))).length)
  throw new Error('Creator make completed without a macOS application.')
const output = join(artifactWorkspace, 'build', platform)
const publish = `${output}.publish-${process.pid}`
const previous = `${output}.previous-${process.pid}`
await mkdir(dirname(output), { recursive: true })
await cp(join(workspace, 'build', platform), publish, { recursive: true })
let hadPrevious = false
try {
  try {
    await rename(output, previous)
    hadPrevious = true
  }
  catch (error) {
    if (error.code !== 'ENOENT')
      throw error
  }
  try {
    await rename(publish, output)
  }
  catch (error) {
    if (hadPrevious)
      await rename(previous, output)
    throw error
  }
}
finally {
  await rm(publish, { recursive: true, force: true })
}
if (hadPrevious)
  await rm(previous, { recursive: true, force: true })
if (platform === 'mac') {
  const apps = await findApps(output)
  if (!apps.length)
    throw new Error('Creator make completed without a macOS application.')
  await mkdir(join(root, 'dist/cocos/review'), { recursive: true })
  await writeFile(join(root, 'dist/cocos/review/mac-artifacts.json'), JSON.stringify(apps, null, 2))
  process.stdout.write(`Cocos macOS app: ${apps.join(', ')}\n`)
}
else {
  process.stdout.write(`Cocos Web preview artifact: ${output}\n`)
}
