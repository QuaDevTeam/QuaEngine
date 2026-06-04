#!/usr/bin/env node --experimental-strip-types
/* eslint-disable no-console */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type ReleaseKind
  = | 'major'
    | 'minor'
    | 'patch'
    | 'premajor'
    | 'preminor'
    | 'prepatch'
    | 'prerelease'

type DependencyBlock
  = | 'dependencies'
    | 'devDependencies'
    | 'peerDependencies'
    | 'optionalDependencies'

interface PackageJson {
  name?: string
  version?: string
  private?: boolean
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

interface WorkspacePackage {
  name: string
  version: string
  path: string
  relativePath: string
  private: boolean
  packageJsonPath: string
  packageJson: PackageJson
}

interface CliOptions {
  command: string
  positionals: string[]
  values: Map<string, string[]>
  flags: Set<string>
  negated: Set<string>
}

interface PackManifest {
  generatedAt: string
  registry?: string
  packageCount: number
  packages: PackManifestEntry[]
}

interface PackManifestEntry {
  name: string
  version: string
  packagePath: string
  tarball: string
}

const dependencyBlocks: DependencyBlock[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootPackageJsonPath = path.join(repoRoot, 'package.json')

function main(): void {
  try {
    const cli = parseCli(process.argv.slice(2))

    switch (cli.command) {
      case 'list':
        listPackages(cli)
        break
      case 'bump':
        bumpPackages(cli)
        break
      case 'pack':
        packPackages(cli)
        break
      case 'publish-local':
        publishLocal(cli)
        break
      case 'help':
      case '--help':
      case '-h':
        printHelp()
        break
      default:
        throw new Error(`Unknown command: ${cli.command}`)
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error: ${message}`)
    process.exitCode = 1
  }
}

function parseCli(argv: string[]): CliOptions {
  const [command = 'help', ...rest] = argv
  const values = new Map<string, string[]>()
  const flags = new Set<string>()
  const negated = new Set<string>()
  const positionals: string[] = []

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]

    if (token === '--') {
      continue
    }

    if (!token.startsWith('-') || token === '-') {
      positionals.push(token)
      continue
    }

    if (token.startsWith('--no-')) {
      const name = token.slice(5)
      negated.add(name)
      values.set(name, ['false'])
      continue
    }

    const normalized = normalizeOptionName(token)
    const [name, inlineValue] = normalized.split('=', 2)

    if (inlineValue !== undefined) {
      addValue(values, name, inlineValue)
      continue
    }

    const next = rest[index + 1]
    if (next !== undefined && !next.startsWith('-')) {
      addValue(values, name, next)
      index += 1
    }
    else {
      flags.add(name)
      addValue(values, name, 'true')
    }
  }

  return { command, positionals, values, flags, negated }
}

function normalizeOptionName(token: string): string {
  if (token.startsWith('--')) {
    return token.slice(2)
  }

  const aliases: Record<string, string> = {
    f: 'filter',
    x: 'exclude',
    o: 'out',
    r: 'registry',
  }

  const alias = token.slice(1)
  return aliases[alias] ?? alias
}

function addValue(values: Map<string, string[]>, name: string, value: string): void {
  const existing = values.get(name) ?? []
  existing.push(value)
  values.set(name, existing)
}

function getOption(cli: CliOptions, name: string, fallback?: string): string | undefined {
  return cli.values.get(name)?.at(-1) ?? fallback
}

function getFlag(cli: CliOptions, name: string): boolean {
  if (cli.negated.has(name)) {
    return false
  }

  const value = getOption(cli, name)

  if (value === undefined) {
    return false
  }

  return value !== 'false'
}

function getList(cli: CliOptions, name: string): string[] {
  return (cli.values.get(name) ?? [])
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)
}

function listPackages(cli: CliOptions): void {
  const packages = selectPackages(discoverWorkspacePackages(), cli, {
    includePrivate: getFlag(cli, 'include-private'),
  })

  if (getFlag(cli, 'json')) {
    console.log(JSON.stringify(packages.map(toPackageSummary), null, 2))
    return
  }

  for (const pkg of packages) {
    console.log(`${pkg.name}\t${pkg.version}\t${pkg.private ? 'private' : 'public'}\t${pkg.relativePath}`)
  }
}

function bumpPackages(cli: CliOptions): void {
  const release = getOption(cli, 'to') ?? cli.positionals[0]

  if (!release) {
    throw new Error('Missing release kind or exact version. Example: pnpm npm:bump patch')
  }

  const dryRun = getFlag(cli, 'dry-run')
  const filters = getList(cli, 'filter')
  const excludes = getList(cli, 'exclude')
  const allPackages = discoverWorkspacePackages()
  const packages = selectPackages(allPackages, cli, { includePrivate: false })
  const rootPackageJson = readJsonFile<PackageJson>(rootPackageJsonPath)
  const currentVersion = rootPackageJson.version ?? packages[0]?.version

  if (!currentVersion) {
    throw new Error('Could not determine current version from the root package or workspace packages')
  }

  const nextVersion = resolveNextVersion(currentVersion, release, getOption(cli, 'preid', 'alpha') ?? 'alpha')
  const rangeSpec = versionRange(nextVersion, getOption(cli, 'range', 'caret') ?? 'caret')
  const includeRoot = getFlag(cli, 'include-root') || (filters.length === 0 && excludes.length === 0)
  const updateRoot = includeRoot && !cli.negated.has('root')
  const packageNames = new Set(packages.map(pkg => pkg.name))

  printPackageSelection('Bumping', packages)
  console.log(`Current base version: ${currentVersion}`)
  console.log(`Next version: ${nextVersion}`)
  console.log(`External dependency range: ${rangeSpec}`)

  if (dryRun) {
    if (updateRoot) {
      console.log(`Would update root package version: ${rootPackageJson.version ?? '(none)'} -> ${nextVersion}`)
    }

    for (const pkg of packages) {
      console.log(`Would update ${pkg.name}: ${pkg.version} -> ${nextVersion}`)
    }

    console.log('Would sync matching @quajs catalog entries, lockfile catalog entries, and create-qua-game templates.')
    return
  }

  if (updateRoot) {
    updatePackageJsonVersion(rootPackageJsonPath, nextVersion)
  }

  for (const pkg of packages) {
    updatePackageJsonVersion(pkg.packageJsonPath, nextVersion)
  }

  const workspaceChanged = syncPnpmWorkspaceCatalog(packageNames, rangeSpec)
  const lockChanged = syncPnpmLockCatalog(packageNames, rangeSpec, nextVersion)
  const templateChanges = syncCreateQuaGameTemplates(packageNames, rangeSpec)

  console.log(`Updated ${packages.length} package version(s).`)

  if (updateRoot) {
    console.log('Updated root package version.')
  }

  if (workspaceChanged) {
    console.log('Updated pnpm workspace catalog entries.')
  }

  if (lockChanged) {
    console.log('Updated pnpm lockfile catalog entries.')
  }

  if (templateChanges > 0) {
    console.log(`Updated ${templateChanges} create-qua-game template dependency spec(s).`)
  }
}

function packPackages(cli: CliOptions): void {
  const dryRun = getFlag(cli, 'dry-run')
  const build = !cli.negated.has('build')
  const clean = getFlag(cli, 'clean')
  const outDir = path.resolve(repoRoot, getOption(cli, 'out', '.local/npm-packages') ?? '.local/npm-packages')
  const packages = topologicalSort(selectPackages(discoverWorkspacePackages(), cli, { includePrivate: false }))

  printPackageSelection('Packing', packages)
  console.log(`Pack destination: ${path.relative(repoRoot, outDir)}`)

  if (dryRun) {
    console.log(build ? 'Would build selected packages before packing.' : 'Build step disabled.')
    console.log('Would create package tarballs and quaengine-local-pack-manifest.json.')
    return
  }

  if (build) {
    buildPackages(packages)
  }

  fs.mkdirSync(outDir, { recursive: true })

  if (clean) {
    cleanPackDestination(outDir)
  }

  const manifest: PackManifest = {
    generatedAt: new Date().toISOString(),
    packageCount: packages.length,
    packages: [],
  }

  for (const pkg of packages) {
    const stdout = runCommand('pnpm', [
      '-C',
      pkg.path,
      'pack',
      '--json',
      '--pack-destination',
      outDir,
    ], { cwd: repoRoot, capture: true })
    const packed = parseJsonOutput<{ filename: string, name: string, version: string }>(stdout)

    manifest.packages.push({
      name: packed.name,
      version: packed.version,
      packagePath: pkg.relativePath,
      tarball: path.relative(repoRoot, packed.filename).replaceAll(path.sep, '/'),
    })
  }

  const manifestPath = path.join(outDir, 'quaengine-local-pack-manifest.json')
  writeJsonFile(manifestPath, manifest)
  console.log(`Wrote ${path.relative(repoRoot, manifestPath)}.`)
}

function publishLocal(cli: CliOptions): void {
  const dryRun = getFlag(cli, 'dry-run')
  const build = !cli.negated.has('build')
  const registry = getOption(cli, 'registry', 'http://localhost:4873') ?? 'http://localhost:4873'
  const tag = getOption(cli, 'tag', 'latest') ?? 'latest'
  const access = getOption(cli, 'access', 'public') ?? 'public'
  const manifestPath = getOption(cli, 'from-manifest')

  if (manifestPath) {
    publishFromManifest(cli, path.resolve(repoRoot, manifestPath), registry, tag, access, dryRun)
    return
  }

  const packages = topologicalSort(selectPackages(discoverWorkspacePackages(), cli, { includePrivate: false }))

  printPackageSelection('Publishing locally', packages)
  console.log(`Registry: ${registry}`)
  console.log(`Dist tag: ${tag}`)

  if (build && !dryRun) {
    buildPackages(packages)
  }
  else if (build) {
    console.log('Dry run: skipping build. Pass --no-build to silence this message.')
  }

  for (const pkg of packages) {
    const args = ['publish', '--tag', tag, '--registry', registry, '--no-git-checks']

    if (pkg.name.startsWith('@')) {
      args.push('--access', access)
    }

    if (dryRun) {
      args.push('--dry-run')
    }

    if (getFlag(cli, 'force')) {
      args.push('--force')
    }

    if (getFlag(cli, 'ignore-scripts')) {
      args.push('--ignore-scripts')
    }

    runCommand('pnpm', args, {
      cwd: pkg.path,
      env: process.env,
    })
  }
}

function publishFromManifest(
  cli: CliOptions,
  manifestPath: string,
  registry: string,
  tag: string,
  access: string,
  dryRun: boolean,
): void {
  const manifest = readJsonFile<PackManifest>(manifestPath)
  const allPackages = discoverWorkspacePackages()
  const packageByName = new Map(allPackages.map(pkg => [pkg.name, pkg]))
  const filters = getList(cli, 'filter')
  const excludes = getList(cli, 'exclude')
  const entries = manifest.packages.filter((entry) => {
    const pkg = packageByName.get(entry.name)
    const pseudoPackage = pkg ?? {
      name: entry.name,
      relativePath: entry.packagePath,
      version: entry.version,
      private: false,
      path: path.join(repoRoot, entry.packagePath),
      packageJsonPath: '',
      packageJson: {},
    }

    return matchesSelection(pseudoPackage, filters, excludes)
  })

  if (entries.length === 0) {
    throw new Error('No package tarballs selected from manifest')
  }

  console.log(`Publishing ${entries.length} local tarball(s) to ${registry}.`)

  for (const entry of entries) {
    const tarballPath = path.resolve(repoRoot, entry.tarball)
    const args = ['publish', tarballPath, '--tag', tag, '--registry', registry, '--no-git-checks']

    if (entry.name.startsWith('@')) {
      args.push('--access', access)
    }

    if (dryRun) {
      args.push('--dry-run')
    }

    if (getFlag(cli, 'force')) {
      args.push('--force')
    }

    if (getFlag(cli, 'ignore-scripts')) {
      args.push('--ignore-scripts')
    }

    runCommand('pnpm', args, {
      cwd: repoRoot,
      env: process.env,
    })
  }
}

function discoverWorkspacePackages(): WorkspacePackage[] {
  const stdout = runCommand('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
    cwd: repoRoot,
    capture: true,
    silent: true,
  })
  const rawPackages = parseJsonOutput<Array<{ name?: string, version?: string, path: string, private?: boolean }>>(stdout)

  return rawPackages
    .filter(rawPackage => rawPackage.name && rawPackage.version)
    .map((rawPackage) => {
      const packageJsonPath = path.join(rawPackage.path, 'package.json')
      const packageJson = readJsonFile<PackageJson>(packageJsonPath)

      return {
        name: rawPackage.name!,
        version: rawPackage.version!,
        path: rawPackage.path,
        relativePath: path.relative(repoRoot, rawPackage.path).replaceAll(path.sep, '/'),
        private: rawPackage.private === true || packageJson.private === true,
        packageJsonPath,
        packageJson,
      }
    })
    .sort(comparePackages)
}

function selectPackages(
  packages: WorkspacePackage[],
  cli: CliOptions,
  options: { includePrivate: boolean },
): WorkspacePackage[] {
  const filters = getList(cli, 'filter')
  const excludes = getList(cli, 'exclude')
  const selected = packages
    .filter(pkg => options.includePrivate || (!pkg.private && pkg.path !== repoRoot))
    .filter(pkg => matchesSelection(pkg, filters, excludes))
    .sort(comparePackages)

  if (selected.length === 0) {
    throw new Error('No workspace packages matched the requested selection')
  }

  return selected
}

function matchesSelection(pkg: Pick<WorkspacePackage, 'name' | 'relativePath'>, filters: string[], excludes: string[]): boolean {
  const included = filters.length === 0 || filters.some(filter => matchesPackagePattern(pkg, filter))
  const excluded = excludes.some(exclude => matchesPackagePattern(pkg, exclude))
  return included && !excluded
}

function matchesPackagePattern(pkg: Pick<WorkspacePackage, 'name' | 'relativePath'>, pattern: string): boolean {
  return [pkg.name, pkg.relativePath].some((candidate) => {
    if (pattern.includes('*') || pattern.includes('?')) {
      return globToRegExp(pattern).test(candidate)
    }

    return candidate === pattern || candidate.includes(pattern)
  })
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '.*')
    .replaceAll('?', '.')

  return new RegExp(`^${escaped}$`)
}

function comparePackages(left: WorkspacePackage, right: WorkspacePackage): number {
  return left.relativePath.localeCompare(right.relativePath)
}

function topologicalSort(packages: WorkspacePackage[]): WorkspacePackage[] {
  const allPackages = discoverWorkspacePackages()
  const allByName = new Map(allPackages.map(pkg => [pkg.name, pkg]))
  const selectedByName = new Map(packages.map(pkg => [pkg.name, pkg]))
  const sorted: WorkspacePackage[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()

  function visit(pkg: WorkspacePackage): void {
    if (visited.has(pkg.name)) {
      return
    }

    if (visiting.has(pkg.name)) {
      throw new Error(`Workspace dependency cycle detected at ${pkg.name}`)
    }

    visiting.add(pkg.name)

    for (const dependencyName of workspaceDependencyNames(pkg.packageJson, allByName)) {
      const selectedDependency = selectedByName.get(dependencyName)

      if (selectedDependency) {
        visit(selectedDependency)
      }
    }

    visiting.delete(pkg.name)
    visited.add(pkg.name)
    sorted.push(pkg)
  }

  for (const pkg of packages) {
    visit(pkg)
  }

  return sorted
}

function workspaceDependencyNames(packageJson: PackageJson, allByName: Map<string, WorkspacePackage>): string[] {
  const names = new Set<string>()

  for (const block of dependencyBlocks) {
    for (const name of Object.keys(packageJson[block] ?? {})) {
      if (allByName.has(name)) {
        names.add(name)
      }
    }
  }

  return [...names].sort()
}

function resolveNextVersion(currentVersion: string, release: string, preid: string): string {
  if (isSemver(release)) {
    return release
  }

  if (!isReleaseKind(release)) {
    throw new Error(`Unsupported release kind: ${release}`)
  }

  return bumpSemver(currentVersion, release, preid)
}

function isReleaseKind(value: string): value is ReleaseKind {
  return [
    'major',
    'minor',
    'patch',
    'premajor',
    'preminor',
    'prepatch',
    'prerelease',
  ].includes(value)
}

function isSemver(value: string): boolean {
  return parseSemver(value) !== undefined
}

function bumpSemver(version: string, release: ReleaseKind, preid: string): string {
  const parsed = parseSemver(version)

  if (!parsed) {
    throw new Error(`Invalid current semver version: ${version}`)
  }

  switch (release) {
    case 'major':
      return `${parsed.major + 1}.0.0`
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`
    case 'patch':
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
    case 'premajor':
      return `${parsed.major + 1}.0.0-${preid}.0`
    case 'preminor':
      return `${parsed.major}.${parsed.minor + 1}.0-${preid}.0`
    case 'prepatch':
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-${preid}.0`
    case 'prerelease':
      if (parsed.prerelease) {
        return `${parsed.major}.${parsed.minor}.${parsed.patch}-${incrementPrerelease(parsed.prerelease, preid)}`
      }

      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-${preid}.0`
  }
}

function parseSemver(version: string): { major: number, minor: number, patch: number, prerelease?: string } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Z.-]+))?(?:\+[0-9A-Z.-]+)?$/i.exec(version)

  if (!match) {
    return undefined
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  }
}

function incrementPrerelease(prerelease: string, preid: string): string {
  const parts = prerelease.split('.')
  const last = parts.at(-1)

  if (last !== undefined && /^\d+$/.test(last)) {
    parts[parts.length - 1] = String(Number(last) + 1)
    return parts.join('.')
  }

  return `${preid}.0`
}

function versionRange(version: string, range: string): string {
  switch (range) {
    case 'exact':
    case 'none':
      return version
    case 'tilde':
    case '~':
      return `~${version}`
    case 'caret':
    case '^':
      return `^${version}`
    default:
      throw new Error(`Unsupported range mode: ${range}`)
  }
}

function syncPnpmWorkspaceCatalog(packageNames: Set<string>, rangeSpec: string): boolean {
  const workspacePath = path.join(repoRoot, 'pnpm-workspace.yaml')

  if (!fs.existsSync(workspacePath)) {
    return false
  }

  const original = fs.readFileSync(workspacePath, 'utf8')
  const updated = original
    .split('\n')
    .map((line) => {
      const match = /^(\s{2})(['"]?)(@quajs\/[^'":]+)\2:/u.exec(line)

      if (!match || !packageNames.has(match[3])) {
        return line
      }

      return `${match[1]}${match[2]}${match[3]}${match[2]}: ${rangeSpec}`
    })
    .join('\n')

  if (updated === original) {
    return false
  }

  fs.writeFileSync(workspacePath, updated)
  return true
}

function syncPnpmLockCatalog(packageNames: Set<string>, rangeSpec: string, exactVersion: string): boolean {
  const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml')

  if (!fs.existsSync(lockfilePath)) {
    return false
  }

  const original = fs.readFileSync(lockfilePath, 'utf8')
  const lines = original.split('\n')
  let activeCatalogPackage: string | undefined
  let changed = false

  for (let index = 0; index < lines.length; index += 1) {
    const packageMatch = /^ {4}['"]?(@quajs\/[^'":]+)['"]?:\s*$/.exec(lines[index])

    if (packageMatch) {
      activeCatalogPackage = packageMatch[1]
      continue
    }

    if (/^\S/.test(lines[index]) || /^ {2}\S/.test(lines[index])) {
      activeCatalogPackage = undefined
      continue
    }

    if (!activeCatalogPackage || !packageNames.has(activeCatalogPackage)) {
      continue
    }

    if (/^ {6}specifier:\s+/.test(lines[index])) {
      const nextLine = `      specifier: ${rangeSpec}`
      changed ||= lines[index] !== nextLine
      lines[index] = nextLine
    }
    else if (/^ {6}version:\s+/.test(lines[index])) {
      const nextLine = `      version: ${exactVersion}`
      changed ||= lines[index] !== nextLine
      lines[index] = nextLine
    }
  }

  if (!changed) {
    return false
  }

  fs.writeFileSync(lockfilePath, lines.join('\n'))
  return true
}

function syncCreateQuaGameTemplates(packageNames: Set<string>, rangeSpec: string): number {
  const templatesDir = path.join(repoRoot, 'packages/build/create-qua-game/templates')

  if (!fs.existsSync(templatesDir)) {
    return 0
  }

  let changeCount = 0

  for (const packageJsonPath of findPackageJsonFiles(templatesDir)) {
    changeCount += updatePackageJsonDependencySpecs(packageJsonPath, packageNames, rangeSpec)
  }

  return changeCount
}

function updatePackageJsonVersion(packageJsonPath: string, nextVersion: string): boolean {
  const original = fs.readFileSync(packageJsonPath, 'utf8')
  const updated = original.replace(/^(\s*"version"\s*:\s*)"[^"]+"/mu, `$1"${nextVersion}"`)

  if (updated === original) {
    return false
  }

  fs.writeFileSync(packageJsonPath, updated)
  return true
}

function updatePackageJsonDependencySpecs(
  packageJsonPath: string,
  packageNames: Set<string>,
  rangeSpec: string,
): number {
  const original = fs.readFileSync(packageJsonPath, 'utf8')
  let changeCount = 0
  const updated = original
    .split('\n')
    .map((line) => {
      const match = /^(\s*)"(@quajs\/[^"]+)"\s*:\s*"([^"]+)"(,?)$/u.exec(line)

      if (!match || !packageNames.has(match[2]) || match[3] === rangeSpec) {
        return line
      }

      changeCount += 1
      return `${match[1]}"${match[2]}": "${rangeSpec}"${match[4]}`
    })
    .join('\n')

  if (changeCount > 0) {
    fs.writeFileSync(packageJsonPath, updated)
  }

  return changeCount
}

function findPackageJsonFiles(rootDir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue
      }

      results.push(...findPackageJsonFiles(entryPath))
    }
    else if (entry.isFile() && entry.name === 'package.json') {
      results.push(entryPath)
    }
  }

  return results.sort()
}

function buildPackages(packages: WorkspacePackage[]): void {
  const args = ['turbo', 'build', ...packages.map(pkg => `--filter=${pkg.name}`)]
  runCommand('pnpm', args, { cwd: repoRoot })
}

function cleanPackDestination(outDir: string): void {
  if (!fs.existsSync(outDir)) {
    return
  }

  for (const entry of fs.readdirSync(outDir)) {
    if (entry.endsWith('.tgz') || entry === 'quaengine-local-pack-manifest.json') {
      fs.rmSync(path.join(outDir, entry), { force: true })
    }
  }
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string, capture?: boolean, silent?: boolean, env?: NodeJS.ProcessEnv },
): string {
  if (!options.silent) {
    console.log(`$ ${[command, ...args].map(shellQuote).join(' ')}`)
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${command} ${args.join(' ')}`)
  }

  return result.stdout ?? ''
}

function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim()
  const jsonStart = Math.min(
    ...['{', '[']
      .map(char => trimmed.indexOf(char))
      .filter(index => index >= 0),
  )

  if (!Number.isFinite(jsonStart)) {
    throw new TypeError(`Command did not return JSON output: ${trimmed}`)
  }

  return JSON.parse(trimmed.slice(jsonStart)) as T
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function shellQuote(value: string): string {
  if (/^[\w@%+=:,./-]+$/.test(value)) {
    return value
  }

  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

function toPackageSummary(pkg: WorkspacePackage): Record<string, string | boolean> {
  return {
    name: pkg.name,
    version: pkg.version,
    private: pkg.private,
    path: pkg.relativePath,
  }
}

function printPackageSelection(action: string, packages: WorkspacePackage[]): void {
  console.log(`${action} ${packages.length} package(s):`)

  for (const pkg of packages) {
    console.log(`  - ${pkg.name}@${pkg.version} (${pkg.relativePath})`)
  }
}

function printHelp(): void {
  console.log(`
QuaEngine npm package helper

Usage:
  node --experimental-strip-types scripts/npm-packages.ts <command> [options]

Commands:
  list                         List publishable workspace packages
  bump <kind|version>          Bump public package versions and sync external specs
  pack                         Build and pack public packages into local tarballs
  publish-local                Publish public packages or packed tarballs to a local registry

Bump examples:
  pnpm npm:bump patch
  pnpm npm:bump minor --dry-run
  pnpm npm:bump 0.2.0 --range caret
  pnpm npm:bump prerelease --preid beta

Pack examples:
  pnpm npm:pack
  pnpm npm:pack --filter @quajs/renderer-* --out .local/renderer-packages --clean
  pnpm npm:pack --filter @quajs/quack --no-build

Local publish examples:
  pnpm npm:publish:local --registry http://localhost:4873
  pnpm npm:publish:local --from-manifest .local/npm-packages/quaengine-local-pack-manifest.json
  pnpm npm:publish:local --filter @quajs/quack --dry-run --no-build

Shared options:
  --filter, -f <pattern>       Include package name/path patterns. Repeat or comma-separate.
  --exclude, -x <pattern>      Exclude package name/path patterns. Repeat or comma-separate.
  --dry-run                    Print intended work without writing or publishing.

Bump options:
  --to <version>               Exact target version, alternative to positional version.
  --preid <id>                 Prerelease id. Default: alpha.
  --range <mode>               External range: caret, tilde, exact. Default: caret.
  --include-root               Update the private root package version.
  --no-root                    Do not update the private root package version.

Pack options:
  --out, -o <dir>              Tarball destination. Default: .local/npm-packages.
  --no-build                   Skip turbo build before packing.
  --clean                      Remove old .tgz files and manifest from the destination first.

Publish-local options:
  --registry, -r <url>         Local registry URL. Default: http://localhost:4873.
  --tag <tag>                  Dist tag. Default: latest.
  --from-manifest <file>       Publish tarballs from a pack manifest instead of package directories.
  --no-build                   Skip turbo build before publishing package directories.
  --force                      Pass --force to pnpm publish.
  --ignore-scripts             Pass --ignore-scripts to pnpm publish.
`)
}

main()
