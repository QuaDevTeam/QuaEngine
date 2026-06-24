/// <reference types="vitest" />
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    watch: false,
    include: [
      'test/**/*.test.{js,ts}',
      '__tests__/**/*.test.{js,ts}',
    ],
    exclude: [
      'node_modules',
      'dist',
    ],
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 15000, // Longer timeout for bundling operations
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '__tests__/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@quajs/native-contracts': resolve(__dirname, '../../native/contracts/src/index.ts'),
      '@quajs/script-compiler': resolve(__dirname, '../script-compiler/src/index.ts'),
      '@quajs/story-graph/script-compiler': resolve(__dirname, '../../game/story-graph/src/script-compiler.ts'),
    },
  },
})
