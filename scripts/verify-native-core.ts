#!/usr/bin/env node --experimental-strip-types
/* eslint-disable no-console */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface VerifyOptions {
  tsOnly: boolean
  rustOnly: boolean
  noBench: boolean
  noWindow: boolean
}

interface VerifyStep {
  label: string
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  group: 'ts' | 'rust' | 'bench'
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultCargoTargetDir = path.join(repoRoot, '.codex-tmp', 'native-cargo-target')

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`native verify failed: ${message}`)
  process.exitCode = 1
})

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp()
    return
  }

  if (options.tsOnly && options.rustOnly) {
    throw new Error('Use only one of --ts-only or --rust-only.')
  }

  const steps = createVerifySteps(options)

  console.log(`Qua native verification: ${steps.length} step(s)`)
  console.log(`repo: ${repoRoot}`)
  console.log(`cargo target: ${process.env.CARGO_TARGET_DIR || defaultCargoTargetDir}`)

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    console.log(`\n[${index + 1}/${steps.length}] ${step.label}`)
    console.log(`$ ${formatCommand(step.command, step.args)}`)
    await runStep(step)
  }

  console.log('\nQua native verification passed.')
}

function parseArgs(argv: string[]): VerifyOptions {
  const flags = new Set(argv.filter(arg => arg.startsWith('-')))

  return {
    tsOnly: flags.has('--ts-only'),
    rustOnly: flags.has('--rust-only'),
    noBench: flags.has('--no-bench'),
    noWindow: flags.has('--no-window'),
  }
}

function createVerifySteps(options: VerifyOptions): VerifyStep[] {
  const steps: VerifyStep[] = []

  if (!options.rustOnly) {
    steps.push(...createTypeScriptSteps(options))
  }

  if (!options.tsOnly) {
    steps.push(...createRustSteps(options))
  }

  return steps
}

function createTypeScriptSteps(options: VerifyOptions): VerifyStep[] {
  const steps: VerifyStep[] = [
    pnpmFilterStep('native-contracts tests', '@quajs/native-contracts', ['test', '--', '--run'], 'ts'),
    pnpmFilterStep('engine-native tests', '@quajs/engine-native', ['test', '--', '--run'], 'ts'),
    pnpmFilterStep('assets-native tests', '@quajs/assets-native', ['test', '--', '--run'], 'ts'),
    pnpmFilterStep('store-native tests', '@quajs/store-native', ['test', '--', '--run'], 'ts'),
    pnpmFilterStep('native-ui-compiler tests', '@quajs/native-ui-compiler', ['test', '--', '--run'], 'ts'),
    pnpmFilterStep('native-language-server tests', '@quajs/native-language-server', ['test', '--', '--run'], 'ts'),
    pnpmPackageStep('native-vscode tests', 'packages/native/vscode', ['test', '--', '--run'], 'ts'),
    pnpmPackageStep('native-contracts typecheck', 'packages/native/contracts', ['typecheck'], 'ts'),
    pnpmPackageStep('engine-native typecheck', 'packages/native/engine-native', ['typecheck'], 'ts'),
    pnpmPackageStep('assets-native typecheck', 'packages/native/assets-native', ['typecheck'], 'ts'),
    pnpmPackageStep('store-native typecheck', 'packages/native/store-native', ['typecheck'], 'ts'),
    pnpmPackageStep('native-ui-compiler typecheck', 'packages/native/ui-compiler', ['typecheck'], 'ts'),
    pnpmPackageStep('native-language-server typecheck', 'packages/native/language-server', ['typecheck'], 'ts'),
    pnpmPackageStep('native-vscode typecheck', 'packages/native/vscode', ['typecheck'], 'ts'),
  ]

  if (!options.noBench) {
    steps.push(
      pnpmPackageStep('native-benchmarks typecheck', 'packages/native/benchmarks', ['typecheck'], 'bench'),
      pnpmPackageStep('native-benchmarks tests', 'packages/native/benchmarks', ['test'], 'bench'),
      pnpmFilterStep('native-benchmarks smoke', '@quajs/native-benchmarks', ['bench:smoke'], 'bench'),
    )
  }

  return steps
}

function createRustSteps(options: VerifyOptions): VerifyStep[] {
  const cargoEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || defaultCargoTargetDir,
  }

  const steps: VerifyStep[] = [
    cargoStep('cargo fmt native workspace', ['fmt', '--manifest-path', 'packages/native/Cargo.toml', '--all', '--check'], cargoEnv),
    cargoStep('quajs_wgpu_renderer tests', ['test', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_wgpu_renderer'], cargoEnv),
    cargoStep('quajs_wgpu_renderer real-wgpu-noop tests', ['test', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_wgpu_renderer', '--features', 'real-wgpu-noop', 'real_device', '--', '--nocapture'], cargoEnv),
    cargoStep('quajs_native_runtime tests', ['test', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_native_runtime'], cargoEnv),
    cargoStep('quajs_native_app tests', ['test', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_native_app'], cargoEnv),
  ]

  if (!options.noBench) {
    steps.push(
      cargoStep('quajs_wgpu_renderer bench smoke tests', ['test', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_wgpu_renderer', '--features', 'bench-smoke', 'bench_smoke', '--', '--nocapture'], cargoEnv),
    )
  }

  if (!options.noWindow) {
    steps.push(
      cargoStep('quajs_native_app native-window smoke tests', ['test', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_native_app', '--features', 'native-window', 'window_smoke', '--', '--nocapture'], cargoEnv),
    )
  }

  return steps
}

function pnpmFilterStep(label: string, filter: string, scriptArgs: string[], group: VerifyStep['group']): VerifyStep {
  return {
    label,
    command: pnpmCommand(),
    args: ['--filter', filter, ...scriptArgs],
    cwd: repoRoot,
    group,
  }
}

function pnpmPackageStep(label: string, packageDir: string, scriptArgs: string[], group: VerifyStep['group']): VerifyStep {
  return {
    label,
    command: pnpmCommand(),
    args: ['-C', packageDir, ...scriptArgs],
    cwd: repoRoot,
    group,
  }
}

function cargoStep(label: string, args: string[], env: NodeJS.ProcessEnv): VerifyStep {
  return {
    label,
    command: cargoCommand(),
    args,
    cwd: repoRoot,
    env,
    group: 'rust',
  }
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

function cargoCommand(): string {
  return process.platform === 'win32' ? 'cargo.exe' : 'cargo'
}

function runStep(step: VerifyStep): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd || repoRoot,
      env: step.env || process.env,
      stdio: 'inherit',
      shell: false,
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${step.label} exited with code ${code ?? 'unknown'}.`))
    })
  })
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args.map(formatArg)].join(' ')
}

function formatArg(arg: string): string {
  if (/^[A-Za-z0-9_./:@=+-]+$/.test(arg)) {
    return arg
  }

  return JSON.stringify(arg)
}

function printHelp(): void {
  console.log(`
Qua native verifier

Usage:
  pnpm native:verify [options]

Options:
  --ts-only     Run only TypeScript native package checks.
  --rust-only   Run only Rust native crate checks.
  --no-bench    Skip native benchmark package and smoke checks.
  --no-window   Skip the native-window Cargo smoke test.
  -h, --help    Show this help.
`)
}
