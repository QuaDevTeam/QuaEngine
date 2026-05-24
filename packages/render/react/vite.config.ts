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
        'plugins/core': resolve(import.meta.dirname, 'src/plugins/core.ts'),
        'plugins/input': resolve(import.meta.dirname, 'src/plugins/input.ts'),
        'plugins/preset': resolve(import.meta.dirname, 'src/plugins/preset.ts'),
      },
      name: 'rendererReact',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@quajs/assets',
        '@quajs/pipeline',
        '@quajs/render-core',
        '@quajs/renderer-web',
        '@quajs/renderer-web/framework-host',
        '@quajs/renderer-web/plugins/core',
        '@quajs/renderer-web/plugins/input',
        '@quajs/renderer-web/plugins/preset',
        'react',
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
