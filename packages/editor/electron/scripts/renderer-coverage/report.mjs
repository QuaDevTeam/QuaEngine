import { appendFile, cp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import libCoverage from 'istanbul-lib-coverage'
import libInstrument from 'istanbul-lib-instrument'
import { build } from 'vite'

const editor = fileURLToPath(new URL('../../', import.meta.url))
const ui = resolve(editor, '../ui')
const source = join(ui, 'src') + sep
const repository = resolve(editor, '../../..')
const helper = name => fileURLToPath(new URL(name, import.meta.url))

export async function prepareCoverage(output) {
  const app = join(output, 'instrumented-app')
  const dist = join(app, 'dist')
  await mkdir(dist, { recursive: true })
  await cp(join(editor, 'dist'), dist, { recursive: true, filter: path => path !== join(editor, 'dist/ui') })
  await symlink(join(editor, 'node_modules'), join(app, 'node_modules'), 'junction')
  const manifest = JSON.parse(await readFile(join(editor, 'package.json'), 'utf8'))
  await writeFile(join(app, 'package.json'), JSON.stringify({ ...manifest, main: 'coverage-main.mjs' }))
  await cp(helper('main.mjs'), join(app, 'coverage-main.mjs'))
  await appendFile(join(dist, 'preload.cjs'), `\n${await readFile(helper('preload.cjs'), 'utf8')}`)

  const instrumenter = libInstrument.createInstrumenter({
    esModules: true,
    parserPlugins: ['typescript', 'decorators-legacy'],
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
    produceSourceMap: true,
  })
  const coverage = libCoverage.createCoverageMap({})
  const instrument = (code, id) => {
    const path = relative(repository, id).split(sep).join('/')
    const transformed = instrumenter.instrumentSync(code, path)
    coverage.addFileCoverage(instrumenter.lastFileCoverage())
    return { code: transformed, map: instrumenter.lastSourceMap() }
  }
  // Prepopulate every source file so unused entrypoints cannot disappear from the denominator.
  for (const path of await readdir(source, { recursive: true })) {
    if (path.endsWith('.ts') && !path.endsWith('.d.ts'))
      instrument(await readFile(join(source, path), 'utf8'), join(source, path))
  }
  const outDir = join(dist, 'ui')
  await build({
    root: ui,
    configFile: join(ui, 'vite.config.ts'),
    logLevel: 'warn',
    plugins: [{
      name: 'editor-e2e-instrument',
      enforce: 'pre',
      transform(code, id) {
        const path = resolve(id)
        if (path.startsWith(source) && path.endsWith('.ts') && !path.endsWith('.d.ts'))
          return instrument(code, path)
      },
      transformIndexHtml() {
        return [{ tag: 'script', attrs: { src: './capture.js', defer: true }, injectTo: 'head' }]
      },
    }],
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: ['index.html', 'asset.html', 'preview.html'].map(name => join(ui, name)) },
    },
  })
  await cp(helper('capture.js'), join(outDir, 'capture.js'))
  return { app, coverage }
}

export async function reportCoverage(output, prepared, results, fullDefault = false) {
  const { coverage } = prepared
  const documents = []
  const missing = []
  const excludedFailures = results.filter(result => !result.passed).map(result => result.id)
  for (const result of results.filter(result => result.passed)) {
    const snapshots = join(output, 'snapshots', ...result.id.split('/'))
    const names = await readdir(snapshots)
    // The network transport scenario launches its own headless Electron entry.
    if (result.id !== 'tools/network' && !names.length)
      missing.push(result.id)
    for (const name of names) {
      const { final, files } = JSON.parse(await readFile(join(snapshots, name), 'utf8'))
      for (const [path, hits] of Object.entries(files)) {
        const baseline = coverage.fileCoverageFor(path).toJSON()
        coverage.addFileCoverage({ ...baseline, ...hits })
      }
      documents.push({ scenario: result.id, document: name, finalSnapshot: final })
    }
  }
  const summary = coverage.getCoverageSummary().toJSON()
  const files = Object.fromEntries(coverage.files().sort().map(path => [path, coverage.fileCoverageFor(path).toSummary().toJSON()]))
  const minimums = { lines: 84, functions: 80, branches: 72 }
  const below = fullDefault ? Object.keys(minimums).filter(key => summary[key].pct < minimums[key]) : []
  const gate = { applied: fullDefault, minimums, below }
  await writeFile(join(output, 'renderer-coverage-final.json'), JSON.stringify(coverage))
  await writeFile(join(output, 'renderer-coverage-summary.json'), JSON.stringify({ summary, files, documents, missing, excludedFailures, gate }, null, 2))
  await rm(prepared.app, { recursive: true, force: true })
  for (const key of ['lines', 'branches', 'functions']) {
    const { covered, total, pct } = summary[key]
    process.stdout.write(`Renderer ${key}: ${covered}/${total} (${pct}%)\n`)
  }
  if (missing.length)
    throw new Error(`No renderer snapshots for ${missing.join(', ')}`)
  if (below.length)
    throw new Error(`Renderer coverage below minimum: ${below.map(key => `${key} ${summary[key].pct}% < ${minimums[key]}%`).join(', ')}`)
}
