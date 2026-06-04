import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const entries = {
  'index': resolve(import.meta.dirname, 'src/index.ts'),
  'plugins/input': resolve(import.meta.dirname, 'src/plugins/input.ts'),
  'plugins/background': resolve(import.meta.dirname, 'src/plugins/background.ts'),
  'plugins/sprite': resolve(import.meta.dirname, 'src/plugins/sprite.ts'),
  'plugins/character': resolve(import.meta.dirname, 'src/plugins/character.ts'),
  'plugins/effects': resolve(import.meta.dirname, 'src/plugins/effects.ts'),
  'plugins/fonts': resolve(import.meta.dirname, 'src/plugins/fonts.ts'),
  'plugins/dialogue': resolve(import.meta.dirname, 'src/plugins/dialogue.ts'),
  'plugins/choices': resolve(import.meta.dirname, 'src/plugins/choices.ts'),
  'plugins/audio': resolve(import.meta.dirname, 'src/plugins/audio.ts'),
  'plugins/scene': resolve(import.meta.dirname, 'src/plugins/scene.ts'),
  'plugins/ui': resolve(import.meta.dirname, 'src/plugins/ui.ts'),
  'plugins/settings': resolve(import.meta.dirname, 'src/plugins/settings.ts'),
  'plugins/backlog': resolve(import.meta.dirname, 'src/plugins/backlog.ts'),
  'plugins/gallery': resolve(import.meta.dirname, 'src/plugins/gallery.ts'),
  'plugins/achievement': resolve(import.meta.dirname, 'src/plugins/achievement.ts'),
  'plugins/save-preview': resolve(import.meta.dirname, 'src/plugins/save-preview.ts'),
  'plugins/preset': resolve(import.meta.dirname, 'src/plugins/preset.ts'),
}

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
      entry: entries,
      name: 'rendererCocos',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@quajs/assets',
        '@quajs/cocos-host',
        '@quajs/pipeline',
        '@quajs/plugin-achievement/contracts',
        '@quajs/plugin-audio/contracts',
        '@quajs/plugin-backlog/contracts',
        '@quajs/plugin-gallery/contracts',
        '@quajs/plugin-settings/contracts',
        '@quajs/plugin-settings/form',
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
