import type { PluginOption } from 'vite'
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
        '@quajs/plugin-audio',
        '@quajs/plugin-audio/script-compiler',
        '@quajs/plugin-animation/script-compiler',
        '@quajs/plugin-background/script-compiler',
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
