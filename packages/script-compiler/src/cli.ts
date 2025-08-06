#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QuaScriptTransformer } from './transformer'
import type { CompilerOptions, DecoratorMapping } from './types'

interface CLIOptions {
  input: string
  output?: string
  decoratorMappings?: string
  compilerOptions?: string
  help?: boolean
  version?: boolean
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2)
  const options: CLIOptions = {
    input: ''
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
      case '--compiler-options':
        options.compilerOptions = args[++i]
        break
      default:
        if (!options.input && !arg.startsWith('-')) {
          options.input = arg
        }
        break
    }
  }

  return options
}

function showHelp() {
  console.log(`
QuaScript Compiler CLI

Usage:
  qua-script [options] <input-file>
  qua-script -i <input-file> [-o <output-file>] [options]

Options:
  -i, --input <file>           Input TypeScript file containing QuaScript
  -o, --output <file>          Output file (defaults to input file with .compiled.ts suffix)
  --decorator-mappings <json>  JSON file containing decorator mappings
  --compiler-options <json>    JSON string with compiler options
  -h, --help                   Show this help message
  -v, --version               Show version

Examples:
  qua-script scene1.ts
  qua-script -i scene1.ts -o scene1.compiled.ts
  qua-script scene1.ts --compiler-options '{"outputFormat":"esm"}'
`)
}

function showVersion() {
  // Read package.json version
  try {
    const packagePath = resolve(__dirname, '../package.json')
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
    console.log(`QuaScript Compiler v${pkg.version}`)
  } catch {
    console.log('QuaScript Compiler (version unknown)')
  }
}

function loadJSONFile(path: string): any {
  try {
    const content = readFileSync(resolve(path), 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error(`Failed to load JSON file ${path}:`, error)
    process.exit(1)
  }
}

function main() {
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

    // Parse compiler options
    let compilerOptions: CompilerOptions | undefined
    if (options.compilerOptions) {
      try {
        compilerOptions = JSON.parse(options.compilerOptions)
      } catch (error) {
        console.error('Error: Invalid JSON in compiler options:', error)
        process.exit(1)
      }
    }

    // Create transformer and process
    const transformer = new QuaScriptTransformer(decoratorMappings, compilerOptions)
    const transformedCode = transformer.transformSource(sourceCode)

    // Determine output path
    const outputPath = options.output || 
      inputPath.replace(/\.ts$/, '.compiled.ts').replace(/\.tsx$/, '.compiled.tsx')

    // Write output
    writeFileSync(outputPath, transformedCode, 'utf-8')
    
    console.log(`✅ Compiled ${options.input} -> ${outputPath}`)

  } catch (error) {
    console.error('Compilation failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}