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
          'audio': resolve(import.meta.dirname, 'src/audio.ts'),
          'dom': resolve(import.meta.dirname, 'src/dom.ts'),
          'framework-host': resolve(import.meta.dirname, 'src/framework-host.ts'),
          'input': resolve(import.meta.dirname, 'src/input.ts'),
          'save-preview': resolve(import.meta.dirname, 'src/save-preview.ts'),
          'save-preview-capture': resolve(import.meta.dirname, 'src/save-preview-capture.ts'),
          'plugins/audio': resolve(import.meta.dirname, 'src/plugins/audio.ts'),
        'plugins/background': resolve(import.meta.dirname, 'src/plugins/background.ts'),
        'plugins/backlog': resolve(import.meta.dirname, 'src/plugins/backlog.ts'),
        'plugins/gallery': resolve(import.meta.dirname, 'src/plugins/gallery.ts'),
        'plugins/character': resolve(import.meta.dirname, 'src/plugins/character.ts'),
        'plugins/choices': resolve(import.meta.dirname, 'src/plugins/choices.ts'),
        'plugins/core': resolve(import.meta.dirname, 'src/plugins/core.ts'),
        'plugins/dialogue': resolve(import.meta.dirname, 'src/plugins/dialogue.ts'),
        'plugins/effects': resolve(import.meta.dirname, 'src/plugins/effects.ts'),
        'plugins/fonts': resolve(import.meta.dirname, 'src/plugins/fonts.ts'),
        'plugins/input': resolve(import.meta.dirname, 'src/plugins/input.ts'),
        'plugins/preset': resolve(import.meta.dirname, 'src/plugins/preset.ts'),
        'plugins/scene': resolve(import.meta.dirname, 'src/plugins/scene.ts'),
        'plugins/settings': resolve(import.meta.dirname, 'src/plugins/settings.ts'),
        'plugins/sprite': resolve(import.meta.dirname, 'src/plugins/sprite.ts'),
        'plugins/ui': resolve(import.meta.dirname, 'src/plugins/ui.ts'),
        'react': resolve(import.meta.dirname, 'src/react.ts'),
      },
      name: 'rendererWeb',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@quajs/assets',
        '@quajs/assets-web',
        '@quajs/pipeline',
        '@quajs/plugin-audio/contracts',
        '@quajs/plugin-backlog/contracts',
        '@quajs/plugin-gallery/contracts',
        '@quajs/plugin-fonts/contracts',
        '@quajs/plugin-settings/contracts',
        '@quajs/plugin-sprite/contracts',
        '@quajs/render-core',
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
