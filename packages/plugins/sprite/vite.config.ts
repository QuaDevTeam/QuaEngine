import { resolve } from 'node:path'
import { defineConfig } from 'vite'
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
        contracts: resolve(import.meta.dirname, 'src/contracts.ts'),
        build: resolve(import.meta.dirname, 'src/build.ts'),
        vite: resolve(import.meta.dirname, 'src/vite.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'node:crypto',
        'node:fs',
        'node:fs/promises',
        'node:path',
        '@quajs/assets-web',
        '@quajs/assets-web/vite',
        '@quajs/logger',
        '@quajs/quack',
        'vite',
      ],
      output: {
        preserveModules: true,
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
    target: 'es2020',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
