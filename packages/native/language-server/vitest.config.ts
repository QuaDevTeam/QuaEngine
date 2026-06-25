import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@quajs/native-ui-compiler': resolve(import.meta.dirname, '../ui-compiler/src/index.ts'),
    },
  },
})
