/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    watch: false,
    include: [
      'test/**/*.test.{js,ts}',
      '__tests__/**/*.test.{js,ts}'
    ],
    exclude: [
      'node_modules',
      'dist'
    ],
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
        '**/*.config.*'
      ]
    }
  }
})