#!/usr/bin/env node

/* eslint-disable no-console */

import type { PackageManager } from './package-manager'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { detectPackageManager, isPackageManager } from './package-manager'
import { inferProjectName, scaffoldProject } from './scaffold'
import { DEFAULT_TEMPLATE_NAME, listTemplates } from './templates'

interface ParsedArgs {
  projectTarget?: string
  template?: string
  install?: boolean
  packageManager?: PackageManager
  force?: boolean
  yes?: boolean
  dryRun?: boolean
  help?: boolean
  version?: boolean
}

const VERSION = '0.1.0'

interface ResolvedOptions {
  projectName: string
  targetDirectory: string
  template: string
  install: boolean
  packageManager: PackageManager
  force: boolean
  dryRun: boolean
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    showHelp()
    return
  }
  if (options.version) {
    console.log(VERSION)
    return
  }

  const resolved = await resolveInteractiveOptions(options)
  await scaffoldProject({
    projectName: resolved.projectName,
    targetDirectory: resolved.targetDirectory,
    template: resolved.template,
    install: resolved.install,
    packageManager: resolved.packageManager,
    force: resolved.force,
    dryRun: resolved.dryRun,
  })
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const options: ParsedArgs = {}
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    switch (arg) {
      case '-h':
      case '--help':
        options.help = true
        break
      case '-v':
      case '--version':
        options.version = true
        break
      case '--template':
        options.template = readOptionValue(args, ++index, arg)
        break
      case '--install':
        options.install = true
        break
      case '--no-install':
        options.install = false
        break
      case '--package-manager': {
        const packageManager = readOptionValue(args, ++index, arg)
        if (!isPackageManager(packageManager)) {
          throw new Error(`Unsupported package manager "${packageManager}". Expected pnpm, npm, or yarn.`)
        }
        options.packageManager = packageManager
        break
      }
      case '--force':
        options.force = true
        break
      case '--yes':
      case '-y':
        options.yes = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option ${arg}`)
        }
        if (!options.projectTarget) {
          options.projectTarget = arg
        }
        else {
          throw new Error(`Unexpected argument ${arg}`)
        }
    }
  }
  return options
}

async function resolveInteractiveOptions(options: ParsedArgs): Promise<ResolvedOptions> {
  const detectedPackageManager = options.packageManager || detectPackageManager()
  if (options.yes) {
    const targetDirectory = options.projectTarget || '.'
    const projectName = inferProjectName(options.projectTarget || process.cwd())
    return {
      projectName,
      targetDirectory,
      template: options.template || DEFAULT_TEMPLATE_NAME,
      install: options.dryRun ? false : options.install ?? true,
      packageManager: detectedPackageManager,
      force: options.force || false,
      dryRun: options.dryRun || false,
    }
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    const projectTarget = options.projectTarget || await askRequired(rl, 'Project name: ')
    const projectName = inferProjectName(projectTarget)
    const targetDirectory = options.projectTarget
      ? projectTarget
      : await askDefault(rl, 'Target directory', projectName)
    const install = options.dryRun
      ? false
      : options.install ?? await askBoolean(rl, `Install dependencies with ${detectedPackageManager}?`, true)
    return {
      projectName,
      targetDirectory,
      template: options.template || DEFAULT_TEMPLATE_NAME,
      install,
      packageManager: detectedPackageManager,
      force: options.force || false,
      dryRun: options.dryRun || false,
    }
  }
  finally {
    rl.close()
  }
}

async function askDefault(rl: ReturnType<typeof createInterface>, question: string, defaultValue: string): Promise<string> {
  const answer = (await rl.question(`${question} (${defaultValue}): `)).trim()
  return answer || defaultValue
}

async function askRequired(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  while (true) {
    const answer = (await rl.question(question)).trim()
    if (answer) {
      return answer
    }
    console.log('Please enter a project name.')
  }
}

async function askBoolean(rl: ReturnType<typeof createInterface>, question: string, defaultValue: boolean): Promise<boolean> {
  const suffix = defaultValue ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`${question} (${suffix}) `)).trim().toLowerCase()
  if (!answer) {
    return defaultValue
  }
  return answer === 'y' || answer === 'yes'
}

function readOptionValue(args: readonly string[], index: number, option: string): string {
  const value = args[index]
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${option}`)
  }
  return value
}

function showHelp(): void {
  const templates = listTemplates().map(template => `  ${template.name} - ${template.description}`).join('\n')
  console.log(`
create-qua-game

Usage:
  create-qua-game [project-name] [options]

Options:
  --template <name>              Template to use. Default: ${DEFAULT_TEMPLATE_NAME}
  --install                      Install dependencies after scaffolding
  --no-install                   Skip dependency installation
  --package-manager <pm>         pnpm, npm, or yarn. Default: detected user agent or pnpm
  --force                        Write into a non-empty directory
  --yes, -y                      Use defaults and skip prompts
  --dry-run                      Print files without writing them
  --help, -h                     Show help
  --version, -v                  Show version

Templates:
${templates}
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
