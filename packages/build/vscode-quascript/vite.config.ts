import { builtinModules, createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const require = createRequire(import.meta.url)
const quackPackageRoot = resolve(import.meta.dirname, '../quack')
const nodeBuiltins = builtinModules.flatMap(name => [name, `node:${name}`])
const nativeExtensionDeps = [
  'lzma-native',
  'node-gyp-build',
  'readable-stream',
  'inherits',
  'string_decoder',
  'util-deprecate',
  'safe-buffer',
  'node-addon-api',
]

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      outDir: 'dist',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
    copyNativeExtensionDeps(),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/extension.ts'),
      formats: ['es'],
      fileName: 'extension',
    },
    rollupOptions: {
      external: [
        'vscode',
        'lzma-native',
        ...nodeBuiltins,
      ],
    },
    target: 'node20',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    conditions: ['node', 'module', 'import', 'default'],
    mainFields: ['module', 'main'],
  },
  ssr: {
    resolve: {
      conditions: ['node', 'import', 'default'],
      mainFields: ['module', 'main'],
    },
    target: 'node',
  },
})

function copyNativeExtensionDeps() {
  return {
    name: 'copy-native-extension-deps',
    async writeBundle() {
      const { cp, mkdir, rm } = await import('node:fs/promises')
      const { dirname, join } = await import('node:path')
      const outDir = resolve(import.meta.dirname, 'dist/node_modules')
      await rm(outDir, { force: true, recursive: true })

      const lzmaPackageJsonPath = require.resolve('lzma-native/package.json', { paths: [import.meta.dirname, quackPackageRoot] })
      const dependencyResolvePaths = [import.meta.dirname, quackPackageRoot, dirname(lzmaPackageJsonPath)]
      for (const dependency of nativeExtensionDeps) {
        const packageJsonPath = require.resolve(`${dependency}/package.json`, { paths: dependencyResolvePaths })
        const sourceDir = dirname(packageJsonPath)
        const targetDir = join(outDir, dependency)
        await mkdir(dirname(targetDir), { recursive: true })
        await cp(sourceDir, targetDir, {
          dereference: true,
          filter: source => !source.includes('/.git/'),
          force: true,
          recursive: true,
        })
      }
    },
  }
}
