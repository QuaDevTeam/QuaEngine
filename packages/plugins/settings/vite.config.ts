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
        builtin: resolve(import.meta.dirname, 'src/builtin.ts'),
        contracts: resolve(import.meta.dirname, 'src/contracts.ts'),
        form: resolve(import.meta.dirname, 'src/form.ts'),
        native: resolve(import.meta.dirname, 'src/native.ts'),
        schema: resolve(import.meta.dirname, 'src/schema.ts'),
        storage: resolve(import.meta.dirname, 'src/storage.ts'),
      },
      name: 'pluginSettings',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@quajs/engine',
        '@quajs/engine-native',
        '@quajs/native-ui-compiler',
        '@quajs/pipeline',
      ],
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
