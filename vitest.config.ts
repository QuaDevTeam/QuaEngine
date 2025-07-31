/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

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
      '@quajs/logger': resolve(__dirname, 'packages/logger/src'),
      '@quajs/utils': resolve(__dirname, 'packages/utils/src'),
      '@quajs/store': resolve(__dirname, 'packages/store/src'),
      '@quajs/assets': resolve(__dirname, 'packages/assets/src'),
      '@quajs/quack': resolve(__dirname, 'packages/quack/src'),
      '@quajs/pipeline': resolve(__dirname, 'packages/pipeline/src'),
    }
  }
})