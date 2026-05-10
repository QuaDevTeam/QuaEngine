import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const qsTypesReference = '/// <reference types="@quajs/script-compiler" />\n'
const viteTypesEntryPath = resolve(import.meta.dirname, 'dist/index.d.ts').replace(/\\/g, '/')

function addQuaScriptTypesReference(filePath: string, content: string) {
  const normalizedPath = filePath.replace(/\\/g, '/')
  if (
    (normalizedPath === 'index.d.ts' || normalizedPath === 'dist/index.d.ts' || normalizedPath === viteTypesEntryPath)
    && !content.includes('@quajs/script-compiler')
  ) {
    return {
      content: `${qsTypesReference}${content}`,
    }
  }
}

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      outDir: 'dist',
      insertTypesEntry: true,
      rollupTypes: true,
      beforeWriteFile: addQuaScriptTypesReference,
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
