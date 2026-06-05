import type { PackageManager } from './package-manager'
import type { TemplateName } from './templates'
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { detectPackageManager, getInstallCommand, getRunScriptCommand } from './package-manager'
import { DEFAULT_TEMPLATE_NAME, getTemplate } from './templates'

export interface TemplateVariables {
  projectBundleId: string
  projectName: string
  projectTitle: string
}

export interface ScaffoldProjectOptions {
  projectName: string
  targetDirectory?: string
  template?: TemplateName | string
  install?: boolean
  packageManager?: PackageManager
  force?: boolean
  dryRun?: boolean
  cwd?: string
  stdout?: Pick<typeof console, 'log'>
  stderr?: Pick<typeof console, 'error'>
  runCommand?: (command: string, args: readonly string[], options: { cwd: string }) => Promise<void>
}

export interface ScaffoldProjectResult {
  projectName: string
  projectTitle: string
  targetDirectory: string
  template: string
  packageManager: PackageManager
  installed: boolean
  dryRun: boolean
  files: string[]
}

export interface CreateQuaGameOptions extends Omit<ScaffoldProjectOptions, 'projectName'> {
  projectName?: string
}

interface TemplateFile {
  source: string
  destination: string
}

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.qs',
  '.scss',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.yaml',
  '.yml',
])

export async function createQuaGame(options: CreateQuaGameOptions): Promise<ScaffoldProjectResult> {
  if (!options.projectName) {
    throw new Error('Project name is required. Pass a name or use the interactive CLI.')
  }
  return await scaffoldProject({
    ...options,
    projectName: options.projectName,
  })
}

export async function scaffoldProject(options: ScaffoldProjectOptions): Promise<ScaffoldProjectResult> {
  const cwd = resolve(options.cwd || process.cwd())
  const projectName = normalizeProjectName(options.projectName)
  const projectTitle = createProjectTitle(projectName)
  const template = getTemplate(options.template || DEFAULT_TEMPLATE_NAME)
  const packageManager = options.packageManager || detectPackageManager()
  const targetDirectory = resolve(cwd, options.targetDirectory || projectName)
  const stdout = options.stdout || console
  const stderr = options.stderr || console
  const variables = createTemplateVariables(projectName, projectTitle)
  const files = await collectTemplateFiles(template.directory, targetDirectory)

  await validateTargetDirectory(targetDirectory, Boolean(options.force))

  if (options.dryRun) {
    stdout.log(`Dry run: would create ${projectTitle} in ${targetDirectory}`)
    files.forEach(file => stdout.log(`  create ${relative(targetDirectory, file.destination)}`))
  }
  else {
    await mkdir(targetDirectory, { recursive: true })
    await copyTemplateFiles(files, variables)
  }

  let installed = false
  if (options.install && !options.dryRun) {
    const [command, ...args] = getInstallCommand(packageManager)
    try {
      await (options.runCommand || runCommand)(command, args, { cwd: targetDirectory })
      installed = true
    }
    catch (error) {
      stderr.error(`Dependency installation failed. You can run "${[command, ...args].join(' ')}" manually in ${targetDirectory}.`)
      stderr.error(error instanceof Error ? error.message : String(error))
    }
  }

  printSuccess(stdout, {
    cwd,
    projectTitle,
    targetDirectory,
    packageManager,
    installed,
    dryRun: Boolean(options.dryRun),
  })

  return {
    projectName,
    projectTitle,
    targetDirectory,
    template: template.name,
    packageManager,
    installed,
    dryRun: Boolean(options.dryRun),
    files: files.map(file => file.destination),
  }
}

export function normalizeProjectName(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('@') && trimmed.includes('/')) {
    const [scopePart, namePart] = trimmed.split('/', 2)
    const scope = normalizeProjectNamePart(scopePart.replace(/^@/, ''))
    const name = normalizeProjectNamePart(namePart)
    return `@${scope}/${name}`
  }

  return normalizeProjectNamePart(trimmed)
}

function normalizeProjectNamePart(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/-{2,}/g, '-')

  if (!normalized) {
    throw new Error('Project name must contain at least one letter or number.')
  }
  if (!/^[a-z0-9._~-]+$/.test(normalized)) {
    throw new Error(`Unable to normalize project name "${input}".`)
  }
  return normalized
}

export function inferProjectName(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('@') && trimmed.includes('/')) {
    return normalizeProjectName(trimmed)
  }
  return normalizeProjectName(basename(resolve(trimmed || '.')))
}

export function createTemplateVariables(projectName: string, projectTitle = createProjectTitle(projectName)): TemplateVariables {
  return {
    projectBundleId: createProjectBundleId(projectName),
    projectName,
    projectTitle,
  }
}

async function validateTargetDirectory(targetDirectory: string, force: boolean): Promise<void> {
  try {
    await access(targetDirectory, constants.F_OK)
  }
  catch {
    return
  }

  const target = await stat(targetDirectory)
  if (!target.isDirectory()) {
    throw new Error(`Target path exists and is not a directory: ${targetDirectory}`)
  }

  const entries = await readdir(targetDirectory)
  if (entries.length > 0 && !force) {
    throw new Error(`Target directory is not empty: ${targetDirectory}. Use --force to write into it.`)
  }
}

async function collectTemplateFiles(templateDirectory: string, targetDirectory: string): Promise<TemplateFile[]> {
  const files: TemplateFile[] = []

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const source = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(source)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      const relativePath = relative(templateDirectory, source)
        .split(/[\\/]/)
        .map(part => part === '_gitignore' ? '.gitignore' : part)
        .join('/')
      files.push({
        source,
        destination: join(targetDirectory, relativePath),
      })
    }
  }

  await visit(templateDirectory)
  return files.sort((a, b) => a.destination.localeCompare(b.destination))
}

async function copyTemplateFiles(files: readonly TemplateFile[], variables: TemplateVariables): Promise<void> {
  for (const file of files) {
    await mkdir(dirname(file.destination), { recursive: true })
    if (isTextFile(file.source)) {
      const content = await readFile(file.source, 'utf8')
      await writeFile(file.destination, renderTemplate(content, variables), 'utf8')
    }
    else {
      await copyFile(file.source, file.destination)
    }
  }
}

function renderTemplate(content: string, variables: TemplateVariables): string {
  return content
    .replaceAll('__PROJECT_BUNDLE_ID__', variables.projectBundleId)
    .replaceAll('__PROJECT_NAME__', variables.projectName)
    .replaceAll('__PROJECT_TITLE__', variables.projectTitle)
}

function isTextFile(path: string): boolean {
  const index = path.lastIndexOf('.')
  return index === -1 || TEXT_EXTENSIONS.has(path.slice(index).toLowerCase())
}

function createProjectTitle(input: string): string {
  const clean = basename(input.trim().replace(/[\\/]+$/g, '')) || input
  return clean
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, value => value.toUpperCase())
}

function createProjectBundleId(input: string): string {
  const packageName = input.includes('/') ? input.split('/').at(-1) || input : input
  const segments = packageName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(segment => /^[a-z]/.test(segment) ? segment : `game${segment}`)

  return `com.example.${segments.length > 0 ? segments.join('.') : 'game'}`
}

function runCommand(command: string, args: readonly string[], options: { cwd: string }): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
      }
      else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      }
    })
  })
}

function printSuccess(
  stdout: Pick<typeof console, 'log'>,
  result: {
    cwd: string
    projectTitle: string
    targetDirectory: string
    packageManager: PackageManager
    installed: boolean
    dryRun: boolean
  },
): void {
  const relativeTarget = relative(result.cwd, result.targetDirectory) || '.'
  const devCommand = getRunScriptCommand(result.packageManager, 'dev').join(' ')
  const assetsBuildCommand = `${result.packageManager} run assets:build`
  stdout.log('')
  stdout.log(`${result.dryRun ? 'Planned' : 'Created'} ${result.projectTitle} at ${result.targetDirectory}`)
  stdout.log('')
  stdout.log('Next steps:')
  stdout.log(`  cd ${relativeTarget.startsWith('..') ? result.targetDirectory : relativeTarget}`)
  if (!result.installed && !result.dryRun) {
    stdout.log(`  ${getInstallCommand(result.packageManager).join(' ')}`)
  }
  stdout.log(`  ${devCommand}`)
  stdout.log(`  ${assetsBuildCommand}`)
  stdout.log('')
  stdout.log('Tip: install the QuaScript VS Code extension for .qs diagnostics, completions, and story inspection.')
}
