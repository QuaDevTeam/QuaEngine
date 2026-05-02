import { resolve } from 'node:path'
import { defineConfig } from 'vite'
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
      name: 'vite-plugin',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vite',
        '@quajs/engine',
        '@quajs/plugin-discovery',
        '@quajs/quack',
        '@quajs/script-compiler',
        '@quajs/logger',
        '@quajs/utils',
        'node:fs',
        'node:fs/promises',
        'node:path',
        'node:process',
        'node:crypto',
        'node:stream',
      ],
      output: {
        globals: {},
      },
    },
    target: 'node18',
    minify: false,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
    conditions: ['node'],
  },
})
