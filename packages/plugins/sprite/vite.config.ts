import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const external = [
  ...builtinModules,
  ...builtinModules.map(module => `node:${module}`),
  '@quajs/assets-web',
  '@quajs/assets-web/vite',
  '@quajs/logger',
  '@quajs/quack',
  'ag-psd',
  'sharp',
  'vite',
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
  ],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        contracts: resolve(import.meta.dirname, 'src/contracts.ts'),
        build: resolve(import.meta.dirname, 'src/build.ts'),
        vite: resolve(import.meta.dirname, 'src/vite.ts'),
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
    target: 'node20',
    minify: false,
    sourcemap: true,
    ssr: true,
  },
  ssr: {
    external,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
