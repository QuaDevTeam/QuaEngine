import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const exec = promisify(execFile)
const workspaces = ['.', 'docs', 'packages/editor/release']

async function runPnpm(args, cwd) {
  try {
    const result = await exec('pnpm', args, { cwd, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 })
    return { code: 0, ...result }
  }
  catch (error) {
    return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || error.message }
  }
}

// outdated and audit return 1 for findings as well as operational failures.
// Only a valid response of the expected shape can count as a completed check.
export async function collectWorkspace(directory, run = runPnpm) {
  const commands = [
    ['outdated', ['outdated', ...(directory === '.' ? ['--recursive'] : []), '--format', 'json']],
    ['audit', ['audit', '--json']],
  ]
  const checks = {}
  for (const [name, args] of commands) {
    const result = await run(args, resolve(root, directory))
    try {
      const data = JSON.parse(result.stdout)
      if (![0, 1].includes(result.code) || !data || Array.isArray(data) || typeof data !== 'object' || data.error)
        throw new Error(data?.error?.message || result.stderr || `Exit ${result.code}`)
      if (name === 'audit' && (!data.metadata?.vulnerabilities || !data.advisories || typeof data.advisories !== 'object'))
        throw new Error('Missing audit metadata/advisories')
      if (name === 'audit' && ['high', 'critical'].some(level => !Number.isInteger(data.metadata.vulnerabilities[level]) || data.metadata.vulnerabilities[level] < 0))
        throw new Error('Missing or invalid audit severity counts')
      if (name === 'outdated' && Object.values(data).some(value => !value || typeof value !== 'object' || typeof value.latest !== 'string'))
        throw new Error('Invalid outdated dependency records')
      checks[name] = { data }
    }
    catch (error) {
      checks[name] = { error: `${name}: ${error.message}` }
    }
  }
  return { directory, ...checks }
}

export function summarize(report) {
  const lines = [`# Dependency report`, '', `Generated: ${report.generatedAt}`, '', 'npm registry findings; Cargo and native SDK validation are separate.', '']
  let failed = false
  for (const workspace of report.workspaces) {
    lines.push(`## ${workspace.directory}`, '')
    for (const name of ['outdated', 'audit']) {
      if (workspace[name].error) {
        failed = true
        lines.push(`CHECK FAILED: ${workspace[name].error.replaceAll('\n', ' ')}`, '')
      }
    }
    if (workspace.outdated.data) {
      lines.push('Package | Installed | Latest | Status', '--- | --- | --- | ---')
      for (const [name, value] of Object.entries(workspace.outdated.data).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`${name} | ${value.current ?? 'missing'} | ${value.latest} | ${value.isDeprecated ? 'DEPRECATED' : 'update available'}`)
      }
      lines.push('')
    }
    if (workspace.audit.data) {
      const data = workspace.audit.data
      const counts = data.metadata.vulnerabilities
      failed ||= counts.high > 0 || counts.critical > 0
      lines.push(`Audit: ${JSON.stringify(counts)}`, '')
      const advisories = Object.values(data.advisories)
      for (const severity of ['critical', 'high', 'moderate', 'low', 'info']) {
        for (const advisory of advisories.filter(value => value.severity === severity)) {
          lines.push(`- ${severity}: ${advisory.module_name} — ${advisory.title} (${advisory.url})`)
        }
      }
      lines.push('')
    }
  }
  return { markdown: `${lines.join('\n')}\n`, failed }
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), workspaces: [] }
  for (const directory of workspaces) {
    process.stdout.write(`Checking dependencies: ${directory}\n`)
    report.workspaces.push(await collectWorkspace(directory))
  }
  const { markdown, failed } = summarize(report)
  const output = resolve(root, '.local/dependencies')
  await mkdir(output, { recursive: true })
  await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(resolve(output, 'report.md'), markdown)
  process.stdout.write(`Reports: ${output}/report.{json,md}\n`)
  process.stdout.write(`${failed ? 'Dependency checks failed: high/critical advisories or incomplete registry checks.' : 'No high/critical npm advisories. Review updates and lower-severity findings in the report.'}\n`)
  process.exitCode = failed ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
