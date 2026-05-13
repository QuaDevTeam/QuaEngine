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
        'plugins/core/index': resolve(import.meta.dirname, 'src/plugins/core/index.ts'),
        'plugins/background/index': resolve(import.meta.dirname, 'src/plugins/background/index.ts'),
        'plugins/backlog/index': resolve(import.meta.dirname, 'src/plugins/backlog/index.ts'),
        'plugins/sprite/index': resolve(import.meta.dirname, 'src/plugins/sprite/index.ts'),
        'plugins/character/index': resolve(import.meta.dirname, 'src/plugins/character/index.ts'),
        'plugins/effects/index': resolve(import.meta.dirname, 'src/plugins/effects/index.ts'),
        'plugins/fonts/index': resolve(import.meta.dirname, 'src/plugins/fonts/index.ts'),
        'plugins/dialogue/index': resolve(import.meta.dirname, 'src/plugins/dialogue/index.ts'),
        'plugins/choices/index': resolve(import.meta.dirname, 'src/plugins/choices/index.ts'),
        'plugins/audio/index': resolve(import.meta.dirname, 'src/plugins/audio/index.ts'),
        'plugins/preset/index': resolve(import.meta.dirname, 'src/plugins/preset/index.ts'),
        'plugins/scene/index': resolve(import.meta.dirname, 'src/plugins/scene/index.ts'),
        'plugins/ui/index': resolve(import.meta.dirname, 'src/plugins/ui/index.ts'),
      },
      name: 'rendererVue',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue', '@quajs/assets-web', '@quajs/pipeline', '@quajs/render-core', '@quajs/renderer-web', '@quajs/renderer-web/audio', '@quajs/renderer-web/plugins/fonts', '@quajs/plugin-audio', '@quajs/plugin-backlog/contracts', '@quajs/plugin-fonts/contracts', '@quajs/plugin-sprite', '@quajs/plugin-sprite/contracts'],
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
