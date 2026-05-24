/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    include: ['test/**/*.test.{js,ts}'],
    exclude: ['node_modules', 'dist'],
  },
})
