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
      '@quajs/native-language-server': resolve(import.meta.dirname, '../language-server/src/index.ts'),
      '@quajs/native-ui-compiler': resolve(import.meta.dirname, '../ui-compiler/src/index.ts'),
    },
  },
})
