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
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'vitePluiginNativeUi',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vite', '@quajs/native-ui-compiler', 'sass-embedded', /^node:/],
    },
    target: 'node20',
  },
})
