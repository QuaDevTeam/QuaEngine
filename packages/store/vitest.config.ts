/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    watch: false,
    include: [
      'test/**/*.test.{js,ts}',
      '__tests__/**/*.test.{js,ts}'
    ],
    exclude: [
      'node_modules',
      'dist',
      'examples'
    ],
    testTimeout: 15000, // Longer timeout for storage operations
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '__tests__/',
        'examples/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  },
  resolve: {
    alias: {
      '@quajs/logger': resolve(__dirname, '../logger/src'),
      '@quajs/utils': resolve(__dirname, '../utils/src')
    }
  }
})