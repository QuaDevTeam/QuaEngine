import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, open, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stopScenarioTree } from './stop-scenario.mjs'

const print = message => process.stdout.write(`${message}\n`)
const scripts = dirname(fileURLToPath(import.meta.url))
const root = resolve(scripts, '../../../..')
const groups = {
  workbench: ['empty-states', 'window', 'settings-dock', 'controls', 'theme', 'context-menu', 'workbench', 'explorer', 'tabs', 'workspace', 'navigation', 'workbench-keyboard'],
  authoring: ['authoring', 'outline', 'decorator-shortcuts', 'languages-console', 'source-panels', 'visual-authoring', 'character-plugin', 'animation-plugin', 'animation-scene', 'novel-writer', 'writing-project'],
  tools: ['console-output', 'terminal', 'git', 'marketplace', 'publishing', 'network', 'update', 'project-setup', 'build-project'],
  preview: ['smoke', 'preview-tools', 'scene-debugger', 'storage', 'inspector', 'performance'],
  native: ['smoke', 'preview-tools', 'storage', 'inspector', 'performance', 'native-embedding'],
}
const filename = name => name === 'smoke' ? 'smoke.mjs' : `${name}-smoke.mjs`
const accounted = new Set([...Object.values(groups).flat().map(filename), 'packaged-smoke.mjs', 'packaged-update-smoke.mjs'])
for (const file of await readdir(scripts)) {
  if (file.endsWith('-smoke.mjs') && !accounted.has(file))
    throw new Error(`Register the new Electron scenario in e2e.mjs: ${file}`)
}
const measuring = process.argv.includes('--coverage')
const requested = process.argv.slice(2).filter(argument => argument !== '--coverage')
const defaultGroups = ['workbench', 'authoring', 'tools', 'preview']
const selected = [...new Set(requested.length ? requested : defaultGroups)]
const scenarios = new Set(Object.entries(groups).flatMap(([group, names]) => names.map(name => `${group}/${name}`)))
if (selected.some(entry => !Object.hasOwn(groups, entry) && !scenarios.has(entry)))
  throw new Error(`Expected suite or suite/scenario: ${Object.keys(groups).join(', ')}`)

const artifacts = join(root, '.codex-tmp/editor-e2e')
await mkdir(artifacts, { recursive: true })
const output = await mkdtemp(join(artifacts, 'run-'))
print(`Electron E2E results: ${output}`)
// Vite sets NODE_ENV for its build. The launched Editor and its dev servers
// must inherit the user's original environment.
const scenarioEnvironment = { ...process.env }
const coverageTools = measuring ? await import('./renderer-coverage/report.mjs') : undefined
const instrumented = await coverageTools?.prepareCoverage(output)
const results = []
let active
let stopping
let interrupted
function stopScenario() {
  if (!active?.pid || stopping)
    return
  const child = active
  stopping = stopScenarioTree(child).catch((error) => {
    child.kill('SIGKILL')
    return String(error)
  })
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(signal, () => {
    interrupted = code
    stopScenario()
  })
}

// Window focus, native menus and clipboard are shared desktop resources.
for (const id of new Set(selected.flatMap(entry => groups[entry]?.map(name => `${entry}/${name}`) ?? [entry]))) {
  if (interrupted)
    break
  const [group, name] = id.split('/')
  const log = join(output, `${group}-${name}.log`)
  const stream = await open(log, 'w')
  const start = Date.now()
  print(`Running ${id}`)
  let cleanupError
  let timedOut = false
  let code
  try {
    const args = [join(scripts, filename(name))]
    if (group === 'native' && name !== 'native-embedding')
      args.push('--native')
    const env = { ...scenarioEnvironment }
    if (instrumented) {
      env.QUA_EDITOR_E2E_APP = instrumented.app
      env.QUA_EDITOR_E2E_SNAPSHOTS = join(output, 'snapshots', group, name)
      await mkdir(env.QUA_EDITOR_E2E_SNAPSHOTS, { recursive: true })
    }
    if (interrupted)
      break
    active = spawn(process.execPath, args, { cwd: root, env, detached: process.platform !== 'win32', stdio: ['ignore', stream.fd, stream.fd] })
    const timer = setTimeout(() => {
      timedOut = true
      stopScenario()
    }, (group === 'native' ? 35 : 8) * 60000)
    try {
      code = await new Promise((resolve, reject) => {
        active.once('error', reject)
        active.once('exit', resolve)
      })
    }
    finally {
      clearTimeout(timer)
    }
  }
  finally {
    cleanupError = await stopping
    stopping = undefined
    active = undefined
    await stream.close()
  }
  const result = { id, passed: code === 0 && !timedOut && !interrupted && !cleanupError, code, timedOut, cleanupError, durationMs: Date.now() - start, log }
  results.push(result)
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2))
  print(`${result.passed ? 'PASS' : 'FAIL'} ${id} (${(result.durationMs / 1000).toFixed(1)}s)${result.passed ? '' : ` — ${log}`}`)
}
if (instrumented) {
  const completed = new Set(results.map(result => result.id))
  const fullDefault = defaultGroups.every(group => groups[group].every(name => completed.has(`${group}/${name}`)))
  await coverageTools.reportCoverage(output, instrumented, results, fullDefault)
}
const passed = results.filter(result => result.passed).length
print(`${passed}/${results.length} Electron scenarios passed`)
process.exitCode = interrupted ?? (passed === results.length ? 0 : 1)
