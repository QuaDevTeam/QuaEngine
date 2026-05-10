#!/usr/bin/env node

import type { DecoratorMapping } from '../core/types'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { generateQuaScriptModuleDeclaration } from '../core/declaration'
import { createPluginAwareTransformerAsync } from '../integrations/plugin-aware-transformer'

const currentFile = fileURLToPath(import.meta.url)

interface CLIOptions {
  input: string
  output?: string
  decoratorMappings?: string
  declaration?: boolean
  declarationOnly?: boolean
  help?: boolean
  version?: boolean
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2)
  const options: CLIOptions = {
    input: '',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

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
        options.input = args[++i]
        break
      case '-o':
      case '--output':
        options.output = args[++i]
        break
      case '--decorator-mappings':
        options.decoratorMappings = args[++i]
        break
      case '--declaration':
        options.declaration = true
        break
      case '--declaration-only':
        options.declarationOnly = true
        options.declaration = true
        break
      default:
        if (!options.input && !arg.startsWith('-')) {
          options.input = arg
        }
        else if (arg.startsWith('-')) {
          console.error(`Error: Unknown option ${arg}`)
          process.exit(1)
        }
        break
    }
  }

  return options
}

function showHelp() {
  console.warn(`
QuaScript Compiler CLI

Usage:
  qua-script [options] <input-file>
  qua-script -i <input-file> [-o <output-file>] [options]

Options:
  -i, --input <file>           Input .qs file or TypeScript/JavaScript file containing QuaScript
  -o, --output <file>          Output file (defaults to a .compiled.* sibling based on the input extension)
  --decorator-mappings <json>  JSON file containing decorator mappings
  --declaration                Also emit a sibling .d.qs.ts declaration for .qs inputs
  --declaration-only           Emit only the .d.qs.ts declaration for .qs inputs
  -h, --help                   Show this help message
  -v, --version               Show version

Examples:
  qua-script scene1.ts
  qua-script scene1.qs
  qua-script -i scene1.ts -o scene1.compiled.ts
`)
}

function showVersion() {
  // Read package.json version
  try {
    const packagePath = resolve(dirname(currentFile), '../package.json')
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
    console.warn(`QuaScript Compiler v${pkg.version}`)
  }
  catch {
    console.warn('QuaScript Compiler (version unknown)')
  }
}

function loadJSONFile(path: string): any {
  try {
    const content = readFileSync(resolve(path), 'utf-8')
    return JSON.parse(content)
  }
  catch (error) {
    console.error(`Failed to load JSON file ${path}:`, error)
    process.exit(1)
  }
}

async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  if (options.version) {
    showVersion()
    return
  }

  if (!options.input) {
    console.error('Error: Input file is required')
    showHelp()
    process.exit(1)
  }

  try {
    // Load input file
    const inputPath = resolve(options.input)
    const sourceCode = readFileSync(inputPath, 'utf-8')

    // Load decorator mappings if provided
    let decoratorMappings: DecoratorMapping | undefined
    if (options.decoratorMappings) {
      decoratorMappings = loadJSONFile(options.decoratorMappings)
    }

    // Create transformer and process
    const transformer = await createPluginAwareTransformerAsync(
      decoratorMappings,
      {
        projectRoot: process.cwd(),
      },
    )
    const isStandaloneFile = inputPath.endsWith('.qs')
    if (options.declaration && !isStandaloneFile) {
      throw new Error('--declaration and --declaration-only only apply to .qs inputs.')
    }

    const transformedCode = isStandaloneFile
      ? transformer.transformModuleSource(sourceCode)
      : transformer.transformSource(sourceCode)

    // Determine output path
    const outputPath = options.output
      || getDefaultOutputPath(inputPath)

    if (options.declaration && isStandaloneFile) {
      const declarationPath = getDefaultDeclarationOutputPath(inputPath)
      writeFileSync(declarationPath, generateQuaScriptModuleDeclaration(sourceCode), 'utf-8')
      console.warn(`✅ Generated declaration ${declarationPath}`)
    }

    if (!options.declarationOnly) {
      writeFileSync(outputPath, transformedCode, 'utf-8')
      console.warn(`✅ Compiled ${options.input} -> ${outputPath}`)
    }
  }
  catch (error) {
    console.error('Compilation failed:', error)
    process.exit(1)
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

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error('Compilation failed:', error)
    process.exit(1)
  })
}
