import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      outDir: 'dist',
      entryRoot: 'src',
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        'index': resolve(import.meta.dirname, 'src/index.ts'),
        'creator': resolve(import.meta.dirname, 'src/creator.ts'),
        'creator-native-products': resolve(import.meta.dirname, 'src/creator-native-products.ts'),
        'creator-effect': resolve(import.meta.dirname, 'src/creator-effect.ts'),
        'creator-runtime': resolve(import.meta.dirname, 'src/creator-runtime.ts'),
        'creator-preview-storage': resolve(import.meta.dirname, 'src/creator-preview-storage.ts'),
        'testing': resolve(import.meta.dirname, 'src/testing.ts'),
      },
      name: 'cocosHost',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: ['cc'],
      output: {
        globals: {},
      },
    },
    target: 'es2020',
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
