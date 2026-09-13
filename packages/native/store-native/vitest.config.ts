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
      '@quajs/store': resolve(import.meta.dirname, '../../core/store/src/index.ts'),
    },
  },
})
