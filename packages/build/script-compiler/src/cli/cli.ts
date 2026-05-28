#!/usr/bin/env node

import type {
  DecoratorMapping,
  QuaScriptDiagnostic,
  QuaScriptLintResult,
  QuaScriptTextEdit,
  QuaScriptToolingConfig,
} from '../core/types'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadQuaScriptToolingConfig } from '../core/config'
import { generateQuaScriptModuleDeclaration } from '../core/declaration'
import { applyQuaScriptTextEdits } from '../core/diagnostics'
import { resolveQuaScriptFiles } from '../core/files'
import { formatQuaScriptDocument } from '../core/format'
import { getQuaScriptFixAllEdits, lintQuaScriptSource } from '../core/lint'
import { createPluginAwareTransformerAsync } from '../integrations/plugin-aware-transformer'

const currentFile = fileURLToPath(import.meta.url)
const languageServerPackage = '@quajs/language-server'

interface CompileOptions {
  autoCollectDecorators?: boolean
  command: 'compile'
  declaration?: boolean
  declarationOnly?: boolean
  decoratorMappings?: string
  help?: boolean
  input: string
  output?: string
  version?: boolean
}

interface LintOptions {
  command: 'lint'
  files: string[]
  fix?: boolean
  help?: boolean
  json?: boolean
  maxWarnings?: number
  version?: boolean
}

interface FormatOptions {
  check?: boolean
  command: 'format'
  files: string[]
  help?: boolean
  version?: boolean
  write?: boolean
}

type CLIOptions = CompileOptions | LintOptions | FormatOptions

interface LintFileResult extends QuaScriptLintResult {
  filePath: string
  fixed: boolean
  fixedCount: number
}

type ProjectLintFunction = (
  source: string,
  options: { filePath: string, projectRoot: string, toolingConfig: QuaScriptToolingConfig },
) => Promise<QuaScriptLintResult>

const projectLintFunctions = new Map<string, ProjectLintFunction | null>()
let projectLintWarningShown = false

function parseArgs(argv = process.argv.slice(2)): CLIOptions {
  const first = argv[0]
  if (!first || first === '-h' || first === '--help') {
    return { command: 'compile', input: '', help: true }
  }
  if (first === '-v' || first === '--version') {
    return { command: 'compile', input: '', version: true }
  }
  if (first === 'lint') {
    return parseLintArgs(argv.slice(1))
  }
  if (first === 'format') {
    return parseFormatArgs(argv.slice(1))
  }
  if (first === 'compile') {
    return parseCompileArgs(argv.slice(1))
  }
  throw new Error(`Unknown command ${first}. Use "compile", "lint", or "format".`)
}

function parseCompileArgs(args: string[]): CompileOptions {
  const options: CompileOptions = {
    command: 'compile',
    input: '',
  }

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
      case '-i':
      case '--input':
        options.input = readOptionValue(args, ++index, arg)
        break
      case '-o':
      case '--output':
        options.output = readOptionValue(args, ++index, arg)
        break
      case '--decorator-mappings':
        options.decoratorMappings = readOptionValue(args, ++index, arg)
        break
      case '--no-auto-collect-decorators':
        options.autoCollectDecorators = false
        break
      case '--declaration':
        options.declaration = true
        break
      case '--declaration-only':
        options.declarationOnly = true
        options.declaration = true
        break
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option ${arg}`)
        }
        if (!options.input) {
          options.input = arg
          break
        }
        throw new Error(`Unexpected argument ${arg}`)
    }
  }

  return options
}

function parseLintArgs(args: string[]): LintOptions {
  const options: LintOptions = {
    command: 'lint',
    files: [],
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '-h' || arg === '--help') {
      options.help = true
      continue
    }
    if (arg === '-v' || arg === '--version') {
      options.version = true
      continue
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--fix') {
      options.fix = true
      continue
    }
    if (arg === '--max-warnings') {
      options.maxWarnings = Number.parseInt(readOptionValue(args, ++index, arg), 10)
      continue
    }
    if (arg.startsWith('--max-warnings=')) {
      options.maxWarnings = Number.parseInt(arg.slice('--max-warnings='.length), 10)
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}`)
    }
    options.files.push(arg)
  }

  if (options.maxWarnings !== undefined && !Number.isFinite(options.maxWarnings)) {
    throw new Error('--max-warnings must be a number')
  }

  return options
}

function parseFormatArgs(args: string[]): FormatOptions {
  const options: FormatOptions = {
    command: 'format',
    files: [],
  }

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      options.help = true
      continue
    }
    if (arg === '-v' || arg === '--version') {
      options.version = true
      continue
    }
    if (arg === '--check') {
      options.check = true
      continue
    }
    if (arg === '--write') {
      options.write = true
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}`)
    }
    options.files.push(arg)
  }

  if (options.check && options.write) {
    throw new Error('--check and --write are mutually exclusive')
  }

  return options
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index]
  if (!value || value.startsWith('-')) {
    throw new Error(`${option} requires a value`)
  }
  return value
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      showHelp(options.command)
      return 0
    }
    if (options.version) {
      showVersion()
      return 0
    }

    switch (options.command) {
      case 'compile':
        return await runCompile(options)
      case 'lint':
        return await runLint(options)
      case 'format':
        return runFormat(options)
      default:
        return assertNever(options)
    }
  }
  catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

async function runCompile(options: CompileOptions): Promise<number> {
  if (!options.input) {
    throw new Error('Input file is required')
  }

  const inputPath = resolve(options.input)
  const sourceCode = readFileSync(inputPath, 'utf-8')
  const config = loadQuaScriptToolingConfig(process.cwd())
  const decoratorMappings = options.decoratorMappings
    ? loadJSONFile(options.decoratorMappings) as DecoratorMapping
    : config.decorators?.mappings

  const transformer = await createPluginAwareTransformerAsync(
    decoratorMappings,
    {
      autoCollectDecorators: options.autoCollectDecorators ?? config.decorators?.autoCollect ?? true,
      projectRoot: process.cwd(),
    },
  )
  const isStandaloneFile = inputPath.endsWith('.qs')
  if (options.declaration && !isStandaloneFile) {
    throw new Error('--declaration and --declaration-only only apply to .qs inputs.')
  }

  const transformedCode = isStandaloneFile
    ? transformer.transformModuleSource(sourceCode, inputPath)
    : transformer.transformSource(sourceCode)
  const outputPath = options.output || getDefaultOutputPath(inputPath)

  if (options.declaration && isStandaloneFile) {
    const declarationPath = getDefaultDeclarationOutputPath(inputPath)
    writeFileSync(declarationPath, generateQuaScriptModuleDeclaration(sourceCode), 'utf-8')
    console.warn(`Generated declaration ${declarationPath}`)
  }

  if (!options.declarationOnly) {
    writeFileSync(outputPath, transformedCode, 'utf-8')
    console.warn(`Compiled ${options.input} -> ${outputPath}`)
  }

  return 0
}

async function runLint(options: LintOptions): Promise<number> {
  const projectRoot = process.cwd()
  const config = loadQuaScriptToolingConfig(projectRoot)
  const files = resolveFiles(options.files, config, projectRoot)
  const results: LintFileResult[] = []

  for (const filePath of files) {
    results.push(await lintFile(filePath, projectRoot, config, Boolean(options.fix)))
  }

  const totals = summarizeLintResults(results)
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...totals, files: results }, null, 2)}\n`)
  }
  else {
    printLintResults(results, projectRoot)
    printLintSummary(totals)
  }

  if (totals.errorCount > 0) {
    return 1
  }
  if (options.maxWarnings !== undefined && totals.warningCount > options.maxWarnings) {
    return 1
  }
  return 0
}

function runFormat(options: FormatOptions): number {
  const projectRoot = process.cwd()
  const config = loadQuaScriptToolingConfig(projectRoot)
  const files = resolveFiles(options.files, config, projectRoot)

  if (!options.check && !options.write && files.length !== 1) {
    throw new Error('qua-script format without --check or --write expects exactly one matched file')
  }

  const changedFiles: string[] = []
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf-8')
    const result = config.format?.enable === false
      ? { changed: false, formatted: source }
      : formatQuaScriptDocument(source, config.format)

    if (options.check) {
      if (result.changed) {
        changedFiles.push(filePath)
      }
      continue
    }

    if (options.write) {
      if (result.changed) {
        writeFileSync(filePath, result.formatted, 'utf-8')
        changedFiles.push(filePath)
      }
      continue
    }

    process.stdout.write(result.formatted)
  }

  if (options.check) {
    if (changedFiles.length > 0) {
      changedFiles.forEach(filePath => console.error(`${formatPath(filePath, projectRoot)} needs formatting`))
      return 1
    }
    console.warn(`All ${files.length} QuaScript file${files.length === 1 ? '' : 's'} are formatted.`)
    return 0
  }

  if (options.write) {
    console.warn(`Formatted ${changedFiles.length} QuaScript file${changedFiles.length === 1 ? '' : 's'}.`)
  }
  return 0
}

async function lintFile(
  filePath: string,
  projectRoot: string,
  config: QuaScriptToolingConfig,
  fix: boolean,
): Promise<LintFileResult> {
  let source = readFileSync(filePath, 'utf-8')
  let result = await lintSource(source, filePath, projectRoot, config)
  let fixedCount = 0

  if (fix) {
    const edits = getSafeFixEdits(result.diagnostics)
    if (edits.length > 0) {
      source = applyQuaScriptTextEdits(source, edits)
      writeFileSync(filePath, source, 'utf-8')
      fixedCount = edits.length
      result = await lintSource(source, filePath, projectRoot, config)
    }
  }

  return {
    filePath,
    fixed: fixedCount > 0,
    fixedCount,
    ...result,
  }
}

async function lintSource(
  source: string,
  filePath: string,
  projectRoot: string,
  config: QuaScriptToolingConfig,
): Promise<QuaScriptLintResult> {
  if (config.lint?.enable === false) {
    return lintQuaScriptSource('', { lint: { rules: {} } })
  }

  const projectLint = await getProjectLintFunction(projectRoot)
  if (projectLint) {
    return projectLint(source, { filePath, projectRoot, toolingConfig: config })
  }

  warnProjectLintUnavailable()
  return lintQuaScriptSource(source, {
    format: config.format,
    lint: config.lint,
  })
}

async function getProjectLintFunction(projectRoot = process.cwd()): Promise<ProjectLintFunction | null> {
  const cacheKey = resolve(projectRoot)
  if (projectLintFunctions.has(cacheKey)) {
    return projectLintFunctions.get(cacheKey) || null
  }

  try {
    const imported = await importProjectLintModule(projectRoot)
    const projectLintFunction = typeof imported.lintQuaScript === 'function'
      ? imported.lintQuaScript
      : null
    projectLintFunctions.set(cacheKey, projectLintFunction)
    return projectLintFunction
  }
  catch {
    projectLintFunctions.set(cacheKey, null)
    return null
  }
}

async function importProjectLintModule(projectRoot: string): Promise<{ lintQuaScript?: ProjectLintFunction }> {
  const projectRequire = createRequire(resolve(projectRoot, 'package.json'))
  try {
    return await import(pathToFileURL(projectRequire.resolve(languageServerPackage)).href) as { lintQuaScript?: ProjectLintFunction }
  }
  catch {
    return await import(languageServerPackage) as { lintQuaScript?: ProjectLintFunction }
  }
}

function warnProjectLintUnavailable(): void {
  if (projectLintWarningShown) {
    return
  }
  projectLintWarningShown = true
  console.warn(
    'QuaScript project lint is unavailable because @quajs/language-server could not be loaded. Falling back to parser/style lint only.',
  )
}

function getSafeFixEdits(diagnostics: readonly QuaScriptDiagnostic[]): QuaScriptTextEdit[] {
  return getQuaScriptFixAllEdits(diagnostics.filter(diagnostic =>
    diagnostic.source === 'quascript/style' && diagnostic.code.startsWith('QS_STYLE_'),
  ))
}

function resolveFiles(patterns: readonly string[], config: QuaScriptToolingConfig, projectRoot: string): string[] {
  const files = resolveQuaScriptFiles(patterns, {
    cwd: projectRoot,
    exclude: config.files?.exclude,
    include: config.files?.include,
  })
  if (files.length === 0) {
    console.warn('No QuaScript files matched.')
  }
  return files
}

function summarizeLintResults(results: readonly LintFileResult[]) {
  return {
    errorCount: results.reduce((sum, result) => sum + result.errorCount, 0),
    fixableCount: results.reduce((sum, result) => sum + result.fixableCount, 0),
    fixedCount: results.reduce((sum, result) => sum + result.fixedCount, 0),
    infoCount: results.reduce((sum, result) => sum + result.infoCount, 0),
    warningCount: results.reduce((sum, result) => sum + result.warningCount, 0),
  }
}

function printLintResults(results: readonly LintFileResult[], projectRoot: string): void {
  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      const line = (diagnostic.range?.start.line ?? 0) + 1
      const column = (diagnostic.range?.start.column ?? 0) + 1
      process.stdout.write(`${formatPath(result.filePath, projectRoot)}:${line}:${column} ${diagnostic.severity} ${diagnostic.code} ${diagnostic.message}\n`)
    }
  }
}

function printLintSummary(summary: ReturnType<typeof summarizeLintResults>): void {
  console.warn(
    `QuaScript lint: ${summary.errorCount} error(s), ${summary.warningCount} warning(s), ${summary.infoCount} info, ${summary.fixableCount} fixable, ${summary.fixedCount} fixed.`,
  )
}

function formatPath(filePath: string, projectRoot: string): string {
  return relative(projectRoot, filePath) || filePath
}

function loadJSONFile(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), 'utf-8')) as unknown
}

function showHelp(command: CLIOptions['command'] = 'compile'): void {
  if (command === 'lint') {
    console.warn(`
QuaScript lint

Usage:
  qua-script lint [files...] [--json] [--fix] [--max-warnings <n>]

Files may be direct files, directories, or glob patterns. When omitted, files.include from QuaScript config is used.
`)
    return
  }

  if (command === 'format') {
    console.warn(`
QuaScript format

Usage:
  qua-script format <file>
  qua-script format [files...] --check
  qua-script format [files...] --write

Options:
  --check  Check formatting without writing files
  --write  Write formatted output in place
`)
    return
  }

  console.warn(`
QuaScript CLI

Usage:
  qua-script compile <input-file> [options]
  qua-script lint [files...] [--json] [--fix] [--max-warnings <n>]
  qua-script format <file|glob> [--check|--write]

Compile options:
  -i, --input <file>           Input .qs file or TypeScript/JavaScript file containing QuaScript
  -o, --output <file>          Output file
  --decorator-mappings <json>  JSON file containing decorator mappings
  --no-auto-collect-decorators Disable automatic decorator collection from discovered plugins
  --declaration                Also emit a sibling .d.qs.ts declaration for .qs inputs
  --declaration-only           Emit only the .d.qs.ts declaration for .qs inputs
  -h, --help                   Show help
  -v, --version                Show version
`)
}

function showVersion(): void {
  try {
    const packagePath = resolve(dirname(currentFile), '../package.json')
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version?: string }
    console.warn(`QuaScript Compiler v${pkg.version || 'unknown'}`)
  }
  catch {
    console.warn('QuaScript Compiler (version unknown)')
  }
}

export function getDefaultOutputPath(inputPath: string): string {
  const suffixRules: Array<[RegExp, string]> = [
    [/\.qs$/, '.compiled.ts'],
    [/\.tsx$/, '.compiled.tsx'],
    [/\.ts$/, '.compiled.ts'],
    [/\.jsx$/, '.compiled.jsx'],
    [/\.(?:mjs|cjs|js)$/, '.compiled.js'],
  ]

  for (const [pattern, suffix] of suffixRules) {
    if (pattern.test(inputPath)) {
      return inputPath.replace(pattern, suffix)
    }
  }

  throw new Error(`Unsupported input extension for ${inputPath}. Use .qs, .ts, .tsx, .js, .jsx, .mjs, or .cjs.`)
}

export function getDefaultDeclarationOutputPath(inputPath: string): string {
  if (inputPath.endsWith('.qs')) {
    return inputPath.replace(/\.qs$/, '.d.qs.ts')
  }

  throw new Error(`QuaScript declarations are only generated for .qs files: ${inputPath}`)
}

function assertNever(value: never): never {
  throw new Error(`Unknown command ${(value as { command?: string }).command || ''}`)
}

export { main as runQuaScriptCli }

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().then((exitCode) => {
    process.exitCode = exitCode
  }).catch((error) => {
    console.error('QuaScript CLI failed:', error)
    process.exitCode = 1
  })
}
