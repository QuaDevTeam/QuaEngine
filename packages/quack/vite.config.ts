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
        cli: resolve(import.meta.dirname, 'src/cli.ts'),
        'plugins/index': resolve(import.meta.dirname, 'src/plugins/index.ts')
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'node:fs', 'node:fs/promises', 'node:path', 'node:process', 'node:url', 'node:util', 'node:crypto', 'node:stream', 'node:os',
        'commander', 'lzma-native', 'glob', 'mime-types', 'yauzl', 'yazl',
        '@quajs/logger', '@quajs/utils'
      ],
      output: {
        preserveModules: true,
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        globals: {
          '@quajs/logger': 'QuaLogger',
          '@quajs/utils': 'QuaUtils'
        },
      },
    },
    target: 'node18',
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
