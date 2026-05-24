import type { PluginOption } from 'vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const qsModuleReference = '/// <reference path="./qs-module.d.ts" />\n'
const qsTypesEntryPath = resolve(import.meta.dirname, 'dist/index.d.ts').replace(/\\/g, '/')

function addQsModuleReference(filePath: string, content: string) {
  const normalizedPath = filePath.replace(/\\/g, '/')
  if (
    (normalizedPath === 'index.d.ts' || normalizedPath === 'dist/index.d.ts' || normalizedPath === qsTypesEntryPath)
    && !content.includes('qs-module.d.ts')
  ) {
    return {
      content: `${qsModuleReference}${content}`,
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
      copyDtsFiles: true,
      beforeWriteFile: addQsModuleReference,
    }),
  ] as PluginOption[],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        cli: resolve(import.meta.dirname, 'src/cli/cli.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'node:fs',
        'node:path',
        'node:process',
        'node:url',
        'node:util',
        'node:module',
        '@babel/parser',
        '@babel/traverse',
        '@babel/types',
        '@babel/generator',
        '@quajs/character/script-compiler',
        '@quajs/engine',
        '@quajs/language-server',
        '@quajs/plugin-audio',
        '@quajs/plugin-audio/script-compiler',
        '@quajs/plugin-animation/script-compiler',
        '@quajs/plugin-background/script-compiler',
        '@quajs/plugin-discovery',
        'vite',
        'uuid',
      ],
      output: {
        globals: {},
      },
    },
    target: 'node18',
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
