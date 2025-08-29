import { defineConfig } from 'vite'
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
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        cli: resolve(import.meta.dirname, 'src/cli/cli.ts')
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
        '@babel/parser',
        '@babel/traverse', 
        '@babel/types',
        '@babel/generator',
        '@quajs/engine',
        'uuid'
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
