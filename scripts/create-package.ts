#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import inquirer from 'inquirer'


interface PackageJson {
  name: string
  version: string
  description: string
  type: string
  main: string
  module: string
  types: string
  exports: {
    '.': {
      import: string
      types: string
    }
  }
  files: string[]
  scripts: Record<string, string>
  keywords: string[]
  author: string
  license: string
  engines: {
    node: string
  }
  devDependencies: Record<string, string>
  peerDependencies: Record<string, string>
}

type Environment = 'node' | 'browser' | 'both'
type PackageCategory = 'build' | 'core' | 'utils' | 'plugins'

interface PackageConfig {
  name: string
  description: string
  environment: Environment
  category: PackageCategory
  template: 'basic' | 'utility' | 'plugin'
  includeTests: boolean
}

interface TsConfig {
  extends: string
  compilerOptions: {
    outDir: string
    rootDir: string
    baseUrl: string
    paths: Record<string, string[]>
  }
  include: string[]
  exclude: string[]
}

interface ProjectJson {
  name: string
  $schema: string
  sourceRoot: string
  projectType: string
  targets: Record<string, {
    executor: string
    options: {
      command: string
      cwd: string
    }
  }>
  tags: string[]
}

async function promptForPackageInfo(): Promise<PackageConfig> {
  console.log('🚀 Creating a new package for QuaEngine monorepo...\n')
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Package name (without @quajs/ prefix):',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Package name is required!'
        }
        if (!/^[a-z0-9-]+$/.test(input.trim())) {
          return 'Package name must contain only lowercase letters, numbers, and hyphens'
        }
        return true
      },
      transformer: (input: string) => input.toLowerCase().trim()
    },
    {
      type: 'list',
      name: 'category',
      message: 'Select package category:',
      choices: [
        {
          name: '🔧 Build Tools - Build system, bundlers, compilers',
          value: 'build',
          short: 'Build'
        },
        {
          name: '🎮 Core Engine - Core engine components',
          value: 'core',
          short: 'Core'
        },
        {
          name: '🛠️ Utilities - Common utilities and helpers',
          value: 'utils',
          short: 'Utils'
        },
        {
          name: '🧩 Plugins - Engine plugins and extensions',
          value: 'plugins',
          short: 'Plugins'
        }
      ],
      default: 'core'
    },
    {
      type: 'input', 
      name: 'description',
      message: 'Package description:',
      default: 'A QuaEngine package'
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Select target environment:',
      choices: [
        {
          name: '🟢 Universal (Node.js + Browser) - Works everywhere',
          value: 'both',
          short: 'Universal'
        },
        {
          name: '🌐 Browser only - Client-side package',
          value: 'browser', 
          short: 'Browser'
        },
        {
          name: '⚡ Node.js only - Server-side package',
          value: 'node',
          short: 'Node.js'
        }
      ],
      default: 'both'
    },
    {
      type: 'list',
      name: 'template',
      message: 'Package template:',
      choices: [
        {
          name: '📦 Basic - Simple package with hello function',
          value: 'basic',
          short: 'Basic'
        },
        {
          name: '🔧 Utility - Collection of utility functions',
          value: 'utility',
          short: 'Utility'
        },
        {
          name: '🧩 Plugin - QuaEngine plugin package',
          value: 'plugin',
          short: 'Plugin'
        }
      ],
      default: 'basic'
    },
    {
      type: 'confirm',
      name: 'includeTests',
      message: 'Include Vitest testing framework?',
      default: true
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: (answers: any) => 
        `Create package @quajs/${answers.name} in packages/${answers.category}/ (${answers.environment}) with ${answers.template} template${answers.includeTests ? ' and tests' : ''}?`,
      default: true
    }
  ])

  if (!answers.confirm) {
    console.log('❌ Package creation cancelled.')
    process.exit(0)
  }

  return {
    name: answers.name.trim(),
    description: answers.description.trim(),
    environment: answers.environment as Environment,
    category: answers.category as PackageCategory,
    template: answers.template,
    includeTests: answers.includeTests
  }
}

function createIndexContent(packageName: string, template: string): string {
  switch (template) {
    case 'basic':
      return `export const hello = (): string => {
  return 'Hello from ${packageName}!'
}
`
    case 'utility':
      return `// ${packageName} utility functions

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
`
    case 'plugin':
      return `// QuaEngine ${packageName} plugin

export interface ${packageName.charAt(0).toUpperCase() + packageName.slice(1)}Plugin {
  name: string
  version: string
  initialize(): void
  destroy(): void
}

export class ${packageName.charAt(0).toUpperCase() + packageName.slice(1)} implements ${packageName.charAt(0).toUpperCase() + packageName.slice(1)}Plugin {
  name = '${packageName}'
  version = '0.1.0'

  initialize(): void {
    console.log(\`\${this.name} plugin initialized\`)
  }

  destroy(): void {
    console.log(\`\${this.name} plugin destroyed\`)
  }
}

export default ${packageName.charAt(0).toUpperCase() + packageName.slice(1)}
`
    default:
      return `export const hello = (): string => {
  return 'Hello from ${packageName}!'
}`
  }
}

function createTestContent(packageName: string, template: string): string {
  switch (template) {
    case 'basic':
      return `import { describe, it, expect } from 'vitest'
import { hello, version } from '../src/index'

describe('${packageName}', () => {
  it('should return hello message', () => {
    expect(hello()).toBe('Hello from ${packageName}!')
  })

  it('should have version', () => {
    expect(version).toBe('0.1.0')
  })
})
`
    case 'utility':
      return `import { describe, it, expect } from 'vitest'
import { isString, isNumber, capitalize, version } from '../src/index'

describe('${packageName} utilities', () => {
  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('hello')).toBe(true)
      expect(isString('')).toBe(true)
    })

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false)
      expect(isString(null)).toBe(false)
      expect(isString(undefined)).toBe(false)
    })
  })

  describe('isNumber', () => {
    it('should return true for numbers', () => {
      expect(isNumber(123)).toBe(true)
      expect(isNumber(0)).toBe(true)
      expect(isNumber(-456)).toBe(true)
    })

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false)
      expect(isNumber(NaN)).toBe(false)
      expect(isNumber(null)).toBe(false)
    })
  })

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello')
      expect(capitalize('WORLD')).toBe('WORLD')
      expect(capitalize('a')).toBe('A')
    })

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('')
    })
  })

  it('should have version', () => {
    expect(version).toBe('0.1.0')
  })
})
`
    case 'plugin':
      return `import { describe, it, expect, vi } from 'vitest'
import { ${packageName.charAt(0).toUpperCase() + packageName.slice(1)} } from '../src/index'

describe('${packageName} plugin', () => {
  it('should have correct name and version', () => {
    const plugin = new ${packageName.charAt(0).toUpperCase() + packageName.slice(1)}()
    expect(plugin.name).toBe('${packageName}')
    expect(plugin.version).toBe('0.1.0')
  })

  it('should initialize correctly', () => {
    const plugin = new ${packageName.charAt(0).toUpperCase() + packageName.slice(1)}()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    plugin.initialize()
    
    expect(consoleSpy).toHaveBeenCalledWith('${packageName} plugin initialized')
    consoleSpy.mockRestore()
  })

  it('should destroy correctly', () => {
    const plugin = new ${packageName.charAt(0).toUpperCase() + packageName.slice(1)}()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    plugin.destroy()
    
    expect(consoleSpy).toHaveBeenCalledWith('${packageName} plugin destroyed')
    consoleSpy.mockRestore()
  })
})
`
    default:
      return `import { describe, it, expect } from 'vitest'
import { hello } from '../src/index'

describe('${packageName}', () => {
  it('should work', () => {
    expect(hello()).toBe('Hello from ${packageName}!')
  })
})
`
  }
}

function createPackageStructure(config: PackageConfig): void {
  const { name: packageName, description, environment, category, template, includeTests } = config
  const packageDir = path.join('packages', category, packageName)
  
  // Create package directory
  if (!fs.existsSync(packageDir)) {
    fs.mkdirSync(packageDir, { recursive: true })
  }
  
  // Create src directory
  const srcDir = path.join(packageDir, 'src')
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true })
  }

  // Create test directory only if tests are included
  if (includeTests) {
    const testDir = path.join(packageDir, 'test')
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }
  }

  // Create package.json
  const packageJson: PackageJson = {
    name: `@quajs/${packageName}`,
    version: '0.1.0',
    description,
    type: 'module',
    main: './dist/index.js',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        import: './dist/index.js',
        types: './dist/index.d.ts',
      },
    },
    files: ['dist'],
    scripts: {
      build: 'vite build',
      dev: 'vite build --watch',
      lint: 'eslint .',
      'lint:fix': 'eslint . --fix',
      ...(includeTests ? { 
        test: 'vitest',
        ...(environment === 'browser' || environment === 'both' ? { 'test:ui': 'vitest --ui' } : {})
      } : {}),
      typecheck: 'tsc --noEmit',
    },
    keywords: [],
    author: 'QuaDevTeam',
    license: 'Apache-2.0',
    engines: {
      node: '>=20',
    },
    devDependencies: {
      ...(includeTests ? {
        'vitest': '^3.2.4',
        ...(environment === 'browser' || environment === 'both' ? { '@vitest/ui': '^3.2.4' } : {})
      } : {})
    },
    peerDependencies: {},
  }

  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  )

function createTsConfig(environment: Environment): TsConfig {
  const baseConfig: TsConfig = {
    extends: '../../../tsconfig.base.json',
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
      baseUrl: '.',
      paths: {
        '@/*': ['./src/*'],
      },
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }

  // Environment-specific compiler options
  switch (environment) {
    case 'node':
      baseConfig.compilerOptions = {
        ...baseConfig.compilerOptions,
        target: 'ES2022',
        lib: ['ES2022'],
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      } as any
      break
    case 'browser':
      baseConfig.compilerOptions = {
        ...baseConfig.compilerOptions,
        target: 'ES2020',
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        moduleResolution: 'bundler',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      } as any
      break
    case 'both':
      baseConfig.compilerOptions = {
        ...baseConfig.compilerOptions,
        target: 'ES2020',
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        moduleResolution: 'bundler',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      } as any
      break
  }

  return baseConfig
}

function createVitestConfig(packageName: string, environment: Environment): string {
  return `/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

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
      '@': resolve(__dirname, 'src')
    }
  }
})
`
}

function createViteConfig(packageName: string, environment: Environment): string {
  const baseConfig = `import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      outDir: 'dist',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: '${packageName}',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {`

  let environmentConfig = ''
  
  switch (environment) {
    case 'node':
      environmentConfig = `
      external: ['node:fs', 'node:path', 'node:process', 'node:url', 'node:util'],
      output: {
        globals: {},
      },
    },
    target: 'node18',`
      break
    case 'browser':
      environmentConfig = `
      external: [],
      output: {
        globals: {},
      },
    },
    target: 'es2020',`
      break
    case 'both':
      environmentConfig = `
      external: [],
      output: {
        globals: {},
      },
    },
    target: 'es2020',`
      break
  }

  return baseConfig + environmentConfig + `
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
`
}

  // Create tsconfig.json
  const tsConfig = createTsConfig(environment)
  fs.writeFileSync(
    path.join(packageDir, 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2),
  )

  // Create vite.config.ts  
  const viteConfig = createViteConfig(packageName, environment)
  fs.writeFileSync(path.join(packageDir, 'vite.config.ts'), viteConfig)

  // Create vitest.config.ts only if tests are included
  if (includeTests) {
    const vitestConfig = createVitestConfig(packageName, environment)
    fs.writeFileSync(path.join(packageDir, 'vitest.config.ts'), vitestConfig)
  }

  // Create src/index.ts
  const indexContent = createIndexContent(packageName, template)
  fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent)

  // Create basic test file only if tests are included
  if (includeTests) {
    const testDir = path.join(packageDir, 'test')
    const testContent = createTestContent(packageName, template)
    fs.writeFileSync(path.join(testDir, `${packageName}.test.ts`), testContent)
  }

  // Create project.json for Nx
  const projectJson: ProjectJson = {
    name: packageName,
    $schema: '../../../node_modules/nx/schemas/project-schema.json',
    sourceRoot: `packages/${category}/${packageName}/src`,
    projectType: 'library',
    targets: {
      build: {
        executor: 'nx:run-commands',
        options: {
          command: 'vite build',
          cwd: `packages/${category}/${packageName}`,
        },
      },
      dev: {
        executor: 'nx:run-commands',
        options: {
          command: 'vite build --watch',
          cwd: `packages/${category}/${packageName}`,
        },
      },
      lint: {
        executor: 'nx:run-commands',
        options: {
          command: 'eslint .',
          cwd: `packages/${category}/${packageName}`,
        },
      },
      ...(includeTests ? {
        test: {
          executor: 'nx:run-commands',
          options: {
            command: 'vitest',
            cwd: `packages/${category}/${packageName}`,
          },
        },
      } : {}),
    },
    tags: [category],
  }

  fs.writeFileSync(
    path.join(packageDir, 'project.json'),
    JSON.stringify(projectJson, null, 2),
  )

  console.log(`✅ Package @quajs/${packageName} created successfully!`)
  console.log(`📁 Location: packages/${category}/${packageName}`)
  console.log(`📂 Category: ${category}`)
  console.log(`🌍 Environment: ${environment}`)
  console.log(`📋 Template: ${template}`)
  console.log(`🔧 Run 'pnpm install' to install dependencies`)
  console.log(`🚀 Run 'turbo build --filter=@quajs/${packageName}' to build the package`)
}

async function main(): Promise<void> {
  try {
    const config = await promptForPackageInfo()
    
    console.log(`\n📦 Creating package: @quajs/${config.name}`)
    console.log(`📝 Description: ${config.description}`)
    console.log(`📂 Category: ${config.category}`)
    console.log(`🌍 Environment: ${config.environment}`)
    console.log(`📋 Template: ${config.template}\n`)

    createPackageStructure(config)
  }
  catch (error) {
    console.error('❌ Error creating package:', (error as Error).message)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})