#!/usr/bin/env node --experimental-strip-types

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { parseArgs } from 'node:util'

interface TestRunnerOptions {
  coverage?: boolean
  watch?: boolean
  ui?: boolean
  package?: string
  verbose?: boolean
  reporter?: string
  threads?: boolean
  bail?: number
}

const PACKAGES_WITH_TESTS = [
  'assets',
  'pipeline',
  'quack'
]

const TEST_CATEGORIES = {
  unit: 'Run unit tests only (package-specific tests)',
  integration: 'Run integration tests only (workspace-level tests)',
  all: 'Run all tests (default)'
}

async function runVitest(args: string[], cwd?: string): Promise<number> {
  return new Promise((resolve) => {
    const workingDir = cwd || process.cwd()
    console.log(`🔧 Running: pnpm exec vitest ${args.join(' ')}`)
    console.log(`📁 Working directory: ${workingDir}`)
    
    const vitestProcess = spawn('pnpm', ['exec', 'vitest', ...args], {
      cwd: workingDir,
      stdio: 'inherit',
      shell: true
    })

    vitestProcess.on('close', (code) => {
      console.log(`📊 Process exited with code: ${code}`)
      resolve(code || 0)
    })

    vitestProcess.on('error', (error) => {
      console.error('Failed to start vitest:', error.message)
      resolve(1)
    })
  })
}

async function packageExists(packageName: string): Promise<boolean> {
  try {
    const packagePath = join(process.cwd(), 'packages', packageName)
    await stat(packagePath)
    return true
  } catch {
    return false
  }
}

async function hasTestFiles(packageName: string): Promise<boolean> {
  try {
    const testPath = join(process.cwd(), 'packages', packageName, 'test')
    await stat(testPath)
    return true
  } catch {
    return false
  }
}

function buildVitestArgs(options: TestRunnerOptions): string[] {
  const args: string[] = []

  if (options.coverage) {
    args.push('--coverage')
  }

  if (options.watch) {
    args.push('--watch')
  }

  if (options.ui) {
    args.push('--ui')
  }

  if (options.verbose) {
    args.push('--verbose')
  }

  if (options.reporter) {
    args.push('--reporter', options.reporter)
  }

  if (options.threads === false) {
    args.push('--no-threads')
  }

  if (options.bail && options.bail > 0) {
    args.push('--bail', options.bail.toString())
  }

  return args
}

async function runPackageTests(packageName: string, options: TestRunnerOptions): Promise<number> {
  console.log(`\n🧪 Running tests for package: ${packageName}`)
  console.log('─'.repeat(50))

  if (!(await packageExists(packageName))) {
    console.error(`❌ Package '${packageName}' does not exist`)
    return 1
  }

  if (!(await hasTestFiles(packageName))) {
    console.log(`⚠️  No test files found for package '${packageName}'`)
    return 0
  }

  const packagePath = join(process.cwd(), 'packages', packageName)
  const args = buildVitestArgs(options)
  
  // Add 'run' command if not in watch mode to avoid hanging
  if (!options.watch && !options.ui) {
    args.unshift('run')
  }

  return await runVitest(args, packagePath)
}

async function runIntegrationTests(options: TestRunnerOptions): Promise<number> {
  console.log('\n🔗 Running integration tests')
  console.log('─'.repeat(50))

  const args = [
    ...buildVitestArgs(options),
    'test/**/*.test.ts'
  ]
  
  // Add 'run' command if not in watch mode to avoid hanging
  if (!options.watch && !options.ui) {
    args.unshift('run')
  }

  return await runVitest(args)
}

async function runAllTests(options: TestRunnerOptions): Promise<number> {
  console.log('\n🚀 Running all tests')
  console.log('═'.repeat(50))

  let totalExitCode = 0

  // Run package-specific unit tests
  for (const pkg of PACKAGES_WITH_TESTS) {
    if (await hasTestFiles(pkg)) {
      const exitCode = await runPackageTests(pkg, options)
      if (exitCode !== 0) {
        totalExitCode = exitCode
        if (options.bail && options.bail > 0) {
          console.log(`\n💀 Test run stopped due to failure in ${pkg} package`)
          return totalExitCode
        }
      }
    }
  }

  // Run integration tests
  const integrationExitCode = await runIntegrationTests(options)
  if (integrationExitCode !== 0) {
    totalExitCode = integrationExitCode
  }

  return totalExitCode
}

function printHelp() {
  console.log(`
QuaEngine Test Runner

USAGE:
  node --experimental-strip-types scripts/run-tests.ts [OPTIONS] [TEST_TYPE|PACKAGE_NAME]

TEST TYPES:
  unit                     ${TEST_CATEGORIES.unit}
  integration              ${TEST_CATEGORIES.integration}
  all                      ${TEST_CATEGORIES.all}

PACKAGE NAMES:
${PACKAGES_WITH_TESTS.map(pkg => `  ${pkg}                     Run tests for ${pkg} package only`).join('\n')}

OPTIONS:
  --package, -p <name>     Run tests for specific package only
  --coverage, -c           Generate coverage report
  --watch, -w              Run tests in watch mode  
  --ui                     Open Vitest UI
  --verbose, -v            Enable verbose output
  --reporter <type>        Specify test reporter (default, verbose, json, etc.)
  --no-threads             Disable multi-threading
  --bail <number>          Stop after N test failures
  --help, -h               Show this help message

EXAMPLES:
  node --experimental-strip-types scripts/run-tests.ts                    # Run all tests
  node --experimental-strip-types scripts/run-tests.ts pipeline           # Run pipeline package tests
  node --experimental-strip-types scripts/run-tests.ts assets             # Run assets package tests
  node --experimental-strip-types scripts/run-tests.ts unit               # Run unit tests only
  node --experimental-strip-types scripts/run-tests.ts integration        # Run integration tests only
  node --experimental-strip-types scripts/run-tests.ts --package assets   # Run tests for assets package only
  node --experimental-strip-types scripts/run-tests.ts --coverage         # Run all tests with coverage
  node --experimental-strip-types scripts/run-tests.ts --watch            # Run tests in watch mode
  node --experimental-strip-types scripts/run-tests.ts --ui               # Open Vitest UI

PACKAGES WITH TESTS:
${PACKAGES_WITH_TESTS.map(pkg => `  - ${pkg}`).join('\n')}
`)
}

async function main() {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        package: { type: 'string', short: 'p' },
        coverage: { type: 'boolean', short: 'c' },
        watch: { type: 'boolean', short: 'w' },
        ui: { type: 'boolean' },
        verbose: { type: 'boolean', short: 'v' },
        reporter: { type: 'string' },
        'no-threads': { type: 'boolean' },
        bail: { type: 'string' },
        help: { type: 'boolean', short: 'h' }
      },
      allowPositionals: true
    })

    if (values.help) {
      printHelp()
      return
    }

    const options: TestRunnerOptions = {
      coverage: values.coverage,
      watch: values.watch,
      ui: values.ui,
      package: values.package,
      verbose: values.verbose,
      reporter: values.reporter,
      threads: !values['no-threads'],
      bail: values.bail ? parseInt(values.bail, 10) : undefined
    }

    const firstPositional = positionals[0]
    let exitCode = 0

    // Check if first positional is a package name
    if (firstPositional && PACKAGES_WITH_TESTS.includes(firstPositional)) {
      // Run tests for specific package (e.g., "pnpm test pipeline")
      exitCode = await runPackageTests(firstPositional, options)
    } else if (options.package) {
      // Run tests for specific package via --package flag
      exitCode = await runPackageTests(options.package, options)
    } else {
      // Run tests based on type or default to 'all'
      const testType = firstPositional || 'all'
      
      switch (testType) {
        case 'unit':
          console.log('🔬 Running unit tests for all packages')
          for (const pkg of PACKAGES_WITH_TESTS) {
            if (await hasTestFiles(pkg)) {
              const pkgExitCode = await runPackageTests(pkg, options)
              if (pkgExitCode !== 0) {
                exitCode = pkgExitCode
                if (options.bail && options.bail > 0) {
                  break
                }
              }
            }
          }
          break

        case 'integration':
          exitCode = await runIntegrationTests(options)
          break

        case 'all':
          exitCode = await runAllTests(options)
          break

        default:
          console.error(`❌ Unknown test type or package: ${testType}`)
          console.error('Valid types: unit, integration, all')
          console.error(`Valid packages: ${PACKAGES_WITH_TESTS.join(', ')}`)
          exitCode = 1
      }
    }

    // Print summary
    if (exitCode === 0) {
      console.log('\n✅ All tests passed!')
    } else {
      console.log('\n❌ Some tests failed!')
    }

    process.exit(exitCode)

  } catch (error) {
    console.error('❌ Test runner failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}