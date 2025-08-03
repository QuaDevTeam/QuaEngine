#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import inquirer from 'inquirer'

interface PackageInfo {
  name: string
  path: string
  hasTests: boolean
  environment: 'node' | 'browser' | 'both'
}

interface PackageJson {
  name: string
  scripts?: Record<string, string>
  devDependencies?: Record<string, string>
}

interface ProjectJson {
  targets?: Record<string, {
    executor: string
    options: {
      command: string
      cwd: string
    }
  }>
}

function detectEnvironment(packagePath: string): 'node' | 'browser' | 'both' {
  try {
    const tsConfigPath = path.join(packagePath, 'tsconfig.json')
    if (fs.existsSync(tsConfigPath)) {
      const tsConfig: any = JSON.parse(fs.readFileSync(tsConfigPath, 'utf-8'))
      const lib: string[] = tsConfig.compilerOptions?.lib || []

      const hasDOM = lib.some((l: string) => l.toLowerCase().includes('dom'))
      const hasNodeTypes = lib.some((l: string) => l.toLowerCase().includes('es2022'))

      if (hasDOM && hasNodeTypes) return 'both'
      if (hasDOM) return 'browser'
      if (hasNodeTypes) return 'node'
    }
  } catch (error) {
    // Fallback detection logic
  }

  // Default to 'both' if we can't determine
  return 'both'
}

function scanPackages(): PackageInfo[] {
  const packagesDir = 'packages'
  if (!fs.existsSync(packagesDir)) {
    console.log('❌ No packages directory found')
    return []
  }

  const packages: PackageInfo[] = []
  const packageDirs = fs.readdirSync(packagesDir)

  for (const dirName of packageDirs) {
    const packagePath = path.join(packagesDir, dirName)
    const packageJsonPath = path.join(packagePath, 'package.json')

    if (!fs.existsSync(packageJsonPath)) continue

    try {
      const packageJson: PackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const hasTests = !!(packageJson.scripts?.test || packageJson.devDependencies?.vitest)
      const environment = detectEnvironment(packagePath)

      packages.push({
        name: packageJson.name,
        path: packagePath,
        hasTests,
        environment
      })
    } catch (error) {
      console.warn(`⚠️  Could not read package.json for ${dirName}`)
    }
  }

  return packages
}

async function selectPackages(packages: PackageInfo[]): Promise<PackageInfo[]> {
  const packagesWithoutTests = packages.filter(pkg => !pkg.hasTests)

  if (packagesWithoutTests.length === 0) {
    console.log('✅ All packages already have test frameworks configured!')
    return []
  }

  console.log('📦 Found packages without test framework:\n')
  packagesWithoutTests.forEach(pkg => {
    console.log(`  • ${pkg.name} (${pkg.environment})`)
  })
  console.log()

  const { selectedPackages } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedPackages',
    message: 'Select packages to add test framework:',
    choices: packagesWithoutTests.map(pkg => ({
      name: `${pkg.name} (${pkg.environment})`,
      value: pkg,
      checked: true
    })),
    validate: (answer: readonly unknown[]) => {
      if (answer.length === 0) {
        return 'Please select at least one package'
      }
      return true
    }
  })

  return selectedPackages
}

function createTestContent(packageName: string): string {
  const cleanName = packageName.replace('@quajs/', '')
  return `import { describe, it, expect } from 'vitest'
// Import your package functions here
// import { hello } from '../src/index'

describe('${cleanName}', () => {
  it('should have basic functionality', () => {
    // Add your tests here
    expect(true).toBe(true)
  })
})
`
}

function createVitestConfig(packageName: string, environment: 'node' | 'browser' | 'both'): string {
  return `/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: '${environment === 'node' ? 'node' : 'happy-dom'}',
    watch: false,
    include: [
      'test/**/*.test.{js,ts}',
      '__tests__/**/*.test.{js,ts}'
    ],
    exclude: [
      'node_modules',
      'dist'
    ],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '__tests__/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src')
    }
  }
})
`
}

async function addTestsToPackage(pkg: PackageInfo): Promise<void> {
  console.log(`\n🔧 Adding tests to ${pkg.name}...`)

  // 1. Create test directory
  const testDir = path.join(pkg.path, 'test')
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true })
    console.log(`  ✅ Created test directory`)
  }

  // 2. Create vitest.config.ts
  const vitestConfigPath = path.join(pkg.path, 'vitest.config.ts')
  if (!fs.existsSync(vitestConfigPath)) {
    const vitestConfig = createVitestConfig(pkg.name, pkg.environment)
    fs.writeFileSync(vitestConfigPath, vitestConfig)
    console.log(`  ✅ Created vitest.config.ts`)
  }

  // 3. Create basic test file
  const cleanName = pkg.name.replace('@quajs/', '')
  const testFilePath = path.join(testDir, `${cleanName}.test.ts`)
  if (!fs.existsSync(testFilePath)) {
    const testContent = createTestContent(pkg.name)
    fs.writeFileSync(testFilePath, testContent)
    console.log(`  ✅ Created test file`)
  }

  // 4. Update package.json
  const packageJsonPath = path.join(pkg.path, 'package.json')
  const packageJson: PackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

  let updated = false

  // Add test scripts
  if (!packageJson.scripts) packageJson.scripts = {}
  if (!packageJson.scripts.test) {
    packageJson.scripts.test = 'vitest'
    updated = true
  }
  if ((pkg.environment === 'browser' || pkg.environment === 'both') && !packageJson.scripts['test:ui']) {
    packageJson.scripts['test:ui'] = 'vitest --ui'
    updated = true
  }

  // Add vitest dependencies
  if (!packageJson.devDependencies) packageJson.devDependencies = {}
  if (!packageJson.devDependencies.vitest) {
    packageJson.devDependencies.vitest = '^3.2.4'
    updated = true
  }
  if ((pkg.environment === 'browser' || pkg.environment === 'both') && !packageJson.devDependencies['@vitest/ui']) {
    packageJson.devDependencies['@vitest/ui'] = '^3.2.4'
    updated = true
  }

  if (updated) {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    console.log(`  ✅ Updated package.json`)
  }

  // 5. Update project.json (Nx configuration)
  const projectJsonPath = path.join(pkg.path, 'project.json')
  if (fs.existsSync(projectJsonPath)) {
    const projectJson: ProjectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'))

    if (!projectJson.targets) projectJson.targets = {}
    if (!projectJson.targets.test) {
      projectJson.targets.test = {
        executor: 'nx:run-commands',
        options: {
          command: 'vitest',
          cwd: pkg.path
        }
      }

      fs.writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2))
      console.log(`  ✅ Updated project.json`)
    }
  }

  console.log(`✅ Successfully added test framework to ${pkg.name}`)
}

async function main(): Promise<void> {
  console.log('🧪 QuaEngine Test Framework Setup\n')

  try {
    // Scan for packages
    console.log('🔍 Scanning packages...')
    const packages = scanPackages()

    if (packages.length === 0) {
      console.log('❌ No packages found in packages directory')
      return
    }

    console.log(`Found ${packages.length} packages total`)

    // Select packages to add tests to
    const selectedPackages = await selectPackages(packages)

    if (selectedPackages.length === 0) {
      console.log('👋 No packages selected. Exiting.')
      return
    }

    // Confirm action
    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: `Add test framework to ${selectedPackages.length} package(s)?`,
      default: true
    })

    if (!confirm) {
      console.log('❌ Operation cancelled.')
      return
    }

    // Add tests to selected packages
    for (const pkg of selectedPackages) {
      await addTestsToPackage(pkg)
    }

    console.log(`\n🎉 Successfully added test framework to ${selectedPackages.length} package(s)!`)
    console.log('\n📝 Next steps:')
    console.log('  1. Run "pnpm install" to install new dependencies')
    console.log('  2. Write your tests in the test/ directories')
    console.log('  3. Run "pnpm test" or "nx test <package-name>" to run tests')

  } catch (error) {
    console.error('❌ Error:', (error as Error).message)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})