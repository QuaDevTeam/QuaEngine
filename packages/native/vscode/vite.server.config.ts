import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const nodeBuiltins = builtinModules.flatMap(name => [name, `node:${name}`])

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, '../language-server/src/server.ts'),
      formats: ['es'],
      fileName: () => 'server.js',
    },
    outDir: 'server',
    emptyOutDir: true,
    rollupOptions: {
      external: nodeBuiltins,
    },
    target: 'node20',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@quajs/native-ui-compiler': resolve(import.meta.dirname, '../ui-compiler/src/index.ts'),
    },
  },
})
