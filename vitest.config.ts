/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    include: [
      'test/**/*.test.{js,ts}',
      'packages/*/test/**/*.test.{js,ts}',
      'packages/*/__tests__/**/*.test.{js,ts}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.nx'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**'
      ]
    },
    testTimeout: 30000 // 30 seconds for integration tests
  },
  resolve: {
    alias: {
      '@quajs/logger': resolve(__dirname, 'packages/utils/src'),
      '@quajs/utils': resolve(__dirname, 'packages/utils/common/src'),
      '@quajs/store': resolve(__dirname, 'packages/core/store/src'),
      '@quajs/assets': resolve(__dirname, 'packages/core/assets/src'),
      '@quajs/assets-memory': resolve(__dirname, 'packages/platform/assets-memory/src'),
      '@quajs/quack': resolve(__dirname, 'packages/build/quack/src'),
      '@quajs/pipeline': resolve(__dirname, 'packages/core/pipeline/src'),
    }
  }
})
