#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { execSync } from 'node:child_process'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer)
    })
  })
}

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

interface PackageConfig {
  name: string
  description: string
  environment: Environment
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

async function selectEnvironment(): Promise<Environment> {
  console.log('\n📦 Select target environment:')
  console.log('1. Node.js only')
  console.log('2. Browser only') 
  console.log('3. Both Node.js and Browser (Universal)')
  
  const choice = await askQuestion('Enter your choice (1-3): ')
  
  switch (choice.trim()) {
    case '1':
      return 'node'
    case '2':
      return 'browser'
    case '3':
      return 'both'
    default:
      console.log('Invalid choice, defaulting to "both"')
      return 'both'
  }
}

function createPackageStructure(config: PackageConfig): void {
  const { name: packageName, description, environment } = config
  const packageDir = path.join('packages', packageName)
  
  // Create package directory
  if (!fs.existsSync(packageDir)) {
    fs.mkdirSync(packageDir, { recursive: true })
  }

  // Create src directory
  const srcDir = path.join(packageDir, 'src')
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true })
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
      test: 'echo "Error: no test specified" && exit 1',
      typecheck: 'tsc --noEmit',
    },
    keywords: [],
    author: 'QuaDevTeam',
    license: 'Apache-2.0',
    engines: {
      node: '>=20',
    },
    devDependencies: {},
    peerDependencies: {},
  }

  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  )

function createTsConfig(environment: Environment): TsConfig {
  const baseConfig: TsConfig = {
    extends: '../../tsconfig.base.json',
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

  // Create src/index.ts
  const indexContent = `export const hello = (): string => {
  return 'Hello from ${packageName}!'
}
`

  fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent)

  // Create project.json for Nx
  const projectJson: ProjectJson = {
    name: packageName,
    $schema: '../../node_modules/nx/schemas/project-schema.json',
    sourceRoot: `packages/${packageName}/src`,
    projectType: 'library',
    targets: {
      build: {
        executor: 'nx:run-commands',
        options: {
          command: 'vite build',
          cwd: `packages/${packageName}`,
        },
      },
      dev: {
        executor: 'nx:run-commands',
        options: {
          command: 'vite build --watch',
          cwd: `packages/${packageName}`,
        },
      },
      lint: {
        executor: 'nx:run-commands',
        options: {
          command: 'eslint .',
          cwd: `packages/${packageName}`,
        },
      },
      test: {
        executor: 'nx:run-commands',
        options: {
          command: 'echo "Error: no test specified" && exit 1',
          cwd: `packages/${packageName}`,
        },
      },
    },
    tags: [],
  }

  fs.writeFileSync(
    path.join(packageDir, 'project.json'),
    JSON.stringify(projectJson, null, 2),
  )

  console.log(`✅ Package @quajs/${packageName} created successfully!`)
  console.log(`📁 Location: packages/${packageName}`)
  console.log(`🌍 Environment: ${environment}`)
  console.log(`🔧 Run 'pnpm install' to install dependencies`)
  console.log(`🚀 Run 'nx build ${packageName}' to build the package`)
}

async function main(): Promise<void> {
  try {
    console.log('🚀 Creating a new package for QuaEngine monorepo...\n')
    
    const packageName = await askQuestion('Package name (without @quajs/ prefix): ')
    if (!packageName.trim()) {
      console.error('❌ Package name is required!')
      process.exit(1)
    }

    const description = await askQuestion('Package description: ')
    const environment = await selectEnvironment()
    
    const config: PackageConfig = {
      name: packageName.trim(),
      description: description.trim(),
      environment,
    }
    
    console.log(`\n📦 Creating package: @quajs/${config.name}`)
    console.log(`📝 Description: ${config.description}`)
    console.log(`🌍 Environment: ${config.environment}\n`)

    createPackageStructure(config)
  }
  catch (error) {
    console.error('❌ Error creating package:', (error as Error).message)
    process.exit(1)
  }
  finally {
    rl.close()
  }
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})