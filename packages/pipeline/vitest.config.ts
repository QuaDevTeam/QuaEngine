/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: [
      'test/**/*.test.{js,ts}'
    ],
    exclude: [
      'node_modules',
      'dist'
    ]
  },
  resolve: {
    alias: {
      '@quajs/logger': resolve(__dirname, '../logger/src'),
      '@quajs/utils': resolve(__dirname, '../utils/src'),
      '@quajs/store': resolve(__dirname, '../store/src'),
      '@quajs/assets': resolve(__dirname, '../assets/src'),
      '@quajs/quack': resolve(__dirname, '../quack/src'),
      '@quajs/pipeline': resolve(__dirname, './src'),
    }
  }
})