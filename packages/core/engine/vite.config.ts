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
        'index': resolve(import.meta.dirname, 'src/index.ts'),
        'script-compiler': resolve(import.meta.dirname, 'src/script-compiler.ts'),
      },
      name: 'engine',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@babel/types', '@quajs/plugin-discovery', '@quajs/assets', '@quajs/logger', '@quajs/pipeline', '@quajs/render-core', '@quajs/store', '@quajs/utils'],
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
