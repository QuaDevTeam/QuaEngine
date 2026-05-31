/// <reference types="vitest" />
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@quajs/plugin-settings': resolve(__dirname, '../settings/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    watch: false,
    include: ['test/**/*.test.{js,ts}'],
    exclude: ['node_modules', 'dist'],
  },
})
