import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJsonPath = resolve(packageDir, 'package.json')
const repoRoot = resolve(packageDir, '../../..')
const workspacePath = resolve(repoRoot, 'pnpm-workspace.yaml')
const packageLicensePath = resolve(packageDir, 'LICENSE')
const repoLicensePath = resolve(repoRoot, 'LICENSE')

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

function readCatalog() {
  const catalog = new Map()
  const workspace = readFileSync(workspacePath, 'utf8')
  let inCatalog = false

  for (const line of workspace.split(/\r?\n/)) {
    if (line === 'catalog:') {
      inCatalog = true
      continue
    }

    if (!inCatalog) {
      continue
    }

    if (/^\S/.test(line)) {
      break
    }

    const trimmed = line.trim()
    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex === -1) {
      continue
    }

    const name = trimmed.slice(0, separatorIndex).replace(/^['"]|['"]$/g, '')
    const version = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    catalog.set(name, version)
  }

  return catalog
}

function findWorkspacePackageVersion(packageName) {
  const packagesDir = resolve(repoRoot, 'packages')
  const candidates = [packagesDir]

  for (let index = 0; index < candidates.length; index += 1) {
    const currentDir = candidates[index]
    for (const entry of readdirSync(currentDir)) {
      const entryPath = resolve(currentDir, entry)
      if (!statSync(entryPath).isDirectory()) {
        continue
      }

      const packageJson = resolve(entryPath, 'package.json')
      if (existsSync(packageJson)) {
        const manifest = JSON.parse(readFileSync(packageJson, 'utf8'))
        if (manifest.name === packageName) {
          return manifest.version
        }
      }

      if (entryPath.split('/').length - packagesDir.split('/').length < 2) {
        candidates.push(entryPath)
      }
    }
  }

  return undefined
}

function resolveDependencySpec(name, specifier, catalog) {
  if (specifier === 'catalog:' || specifier.startsWith('catalog:')) {
    const catalogName = specifier === 'catalog:' ? name : specifier.slice('catalog:'.length)
    const version = catalog.get(catalogName)
    if (!version) {
      throw new Error(`Missing catalog entry for ${catalogName}`)
    }
    return version
  }

  if (specifier.startsWith('workspace:')) {
    const version = findWorkspacePackageVersion(name)
    if (!version) {
      throw new Error(`Missing workspace package for ${name}`)
    }
    return version
  }

  return specifier
}

function createVsceManifest(originalManifest) {
  const catalog = readCatalog()
  const manifest = structuredClone(originalManifest)

  for (const field of dependencyFields) {
    if (!manifest[field]) {
      continue
    }

    manifest[field] = Object.fromEntries(
      Object.entries(manifest[field]).map(([name, specifier]) => [
        name,
        resolveDependencySpec(name, specifier, catalog),
      ]),
    )
  }

  return manifest
}

const originalPackageJson = readFileSync(packageJsonPath, 'utf8')
const manifest = createVsceManifest(JSON.parse(originalPackageJson))
const hadPackageLicense = existsSync(packageLicensePath)
let result

try {
  writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`)
  if (!hadPackageLicense && existsSync(repoLicensePath)) {
    copyFileSync(repoLicensePath, packageLicensePath)
  }
  result = spawnSync('pnpm', ['exec', 'vsce', ...process.argv.slice(2)], {
    cwd: packageDir,
    stdio: 'inherit',
  })
}
finally {
  writeFileSync(packageJsonPath, originalPackageJson)
  if (!hadPackageLicense && existsSync(packageLicensePath)) {
    rmSync(packageLicensePath)
  }
}

if (result?.error) {
  throw result.error
}

if (typeof result?.status === 'number') {
  process.exit(result.status)
}

if (result?.signal) {
  process.kill(process.pid, result.signal)
}
