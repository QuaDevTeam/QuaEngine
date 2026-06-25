import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: {
        'index': resolve(import.meta.dirname, 'src/index.ts'),
        'bench-smoke': resolve(import.meta.dirname, 'src/bench-smoke.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'node:buffer',
        'node:perf_hooks',
        'node:process',
        'node:url',
      ],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
    target: 'node20',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@quajs/native-language-server': resolve(import.meta.dirname, '../language-server/src/index.ts'),
      '@quajs/native-ui-compiler': resolve(import.meta.dirname, '../ui-compiler/src/index.ts'),
    },
  },
})
