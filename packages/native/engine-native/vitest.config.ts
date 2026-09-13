import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@quajs/native-contracts': resolve(import.meta.dirname, '../contracts/src/index.ts'),
      '@quajs/engine/script-compiler': resolve(import.meta.dirname, '../../core/engine/src/script-compiler.ts'),
      '@quajs/engine': resolve(import.meta.dirname, '../../core/engine/src/index.ts'),
      '@quajs/plugin-discovery': resolve(import.meta.dirname, '../../core/plugin-discovery/src/index.ts'),
      '@quajs/quack/project': resolve(import.meta.dirname, '../../build/quack/src/project.ts'),
      '@quajs/script-compiler': resolve(import.meta.dirname, '../../build/script-compiler/src/index.ts'),
    },
  },
})
