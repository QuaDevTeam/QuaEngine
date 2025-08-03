import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      outDir: 'dist',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        'cli/index': resolve(import.meta.dirname, 'src/cli/index.ts')
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        // Node.js built-in modules
        'node:fs', 'node:fs/promises', 'node:path', 'node:process', 'node:url', 
        'node:util', 'node:crypto', 'node:stream', 'node:os', 'node:buffer',
        // External dependencies
        'commander', 'lzma-native', 'glob', 'mime-types', 'yauzl', 'yazl',
        // QuaJS packages
        '@quajs/logger', '@quajs/utils'
      ],
      output: {
        preserveModules: true,
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
    target: 'node18',
    // Optimize for Node.js environment
    minify: false, // Keep readable for debugging
    sourcemap: true, // Enable source maps for debugging
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
    conditions: ['node'], // Prefer Node.js conditions
  },
  // Explicitly set environment to Node.js
  define: {
    'process.env.NODE_ENV': '"production"'
  },
})
