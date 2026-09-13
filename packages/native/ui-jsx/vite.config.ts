import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts'],
      outDir: 'dist',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        'index': resolve(import.meta.dirname, 'src/index.ts'),
        'jsx-runtime': resolve(import.meta.dirname, 'src/jsx-runtime.ts'),
        'jsx-dev-runtime': resolve(import.meta.dirname, 'src/jsx-dev-runtime.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [],
    },
    target: 'node20',
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
