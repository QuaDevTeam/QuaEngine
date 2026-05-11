/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    watch: false,
    include: ['test/**/*.test.{js,ts}'],
    exclude: ['node_modules', 'dist'],
  },
})
