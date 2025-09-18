import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'QuaPluginDiscovery',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@quajs/utils', 'node:fs', 'node:path', 'node:process'],
    },
    target: 'node20',
    minify: false,
    ssr: true,
  },
  ssr: {
    external: ['node:fs', 'node:path', 'node:process'],
  },
})
