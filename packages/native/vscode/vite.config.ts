import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const nodeBuiltins = builtinModules.flatMap(name => [name, `node:${name}`])

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
      entry: resolve(import.meta.dirname, 'src/extension.ts'),
      formats: ['es'],
      fileName: 'extension',
    },
    rollupOptions: {
      external: [
        'vscode',
        ...nodeBuiltins,
      ],
    },
    target: 'node20',
    minify: false,
    sourcemap: true,
  },
})
