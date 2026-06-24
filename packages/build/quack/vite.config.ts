import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const nodeBuiltins = [...builtinModules, ...builtinModules.map(module => `node:${module}`)]
const externalPackages = [
  // External dependencies
  'commander',
  'glob',
  'lzma-native',
  'mediabunny',
  'mime-types',
  'sharp',
  'typescript',
  'yauzl',
  'yazl',
  // Build-time parser/compiler dependencies pulled through Quack APIs.
  '@babel/generator',
  '@babel/parser',
  '@babel/traverse',
  '@babel/types',
  // QuaJS packages
  '@quajs/logger',
  '@quajs/native-contracts',
  '@quajs/quack',
  '@quajs/quack/plugins',
  '@quajs/script-compiler',
  '@quajs/utils',
]
const external = [...nodeBuiltins, ...externalPackages]

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
      entry: {
        'index': resolve(import.meta.dirname, 'src/index.ts'),
        'cli/index': resolve(import.meta.dirname, 'src/cli/index.ts'),
        'project': resolve(import.meta.dirname, 'src/project.ts'),
        'qpk-reader': resolve(import.meta.dirname, 'src/qpk-reader.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external,
      output: {
        preserveModules: true,
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
    target: 'node18',
    // Optimize for Node.js environment
    minify: false, // Keep readable for debugging
    sourcemap: true, // Enable source maps for debugging
    ssr: true,
  },
  ssr: {
    external,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
    conditions: ['node'], // Prefer Node.js conditions
  },
  // Explicitly set environment to Node.js
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})
