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
        'plugins/achievement': resolve(import.meta.dirname, 'src/plugins/achievement.ts'),
        'plugins/audio': resolve(import.meta.dirname, 'src/plugins/audio.ts'),
        'plugins/background': resolve(import.meta.dirname, 'src/plugins/background.ts'),
        'plugins/backlog': resolve(import.meta.dirname, 'src/plugins/backlog.ts'),
        'plugins/character': resolve(import.meta.dirname, 'src/plugins/character.ts'),
        'plugins/choices': resolve(import.meta.dirname, 'src/plugins/choices.ts'),
        'plugins/core': resolve(import.meta.dirname, 'src/plugins/core.ts'),
        'plugins/dialogue': resolve(import.meta.dirname, 'src/plugins/dialogue.ts'),
        'plugins/effects': resolve(import.meta.dirname, 'src/plugins/effects.ts'),
        'plugins/fonts': resolve(import.meta.dirname, 'src/plugins/fonts.ts'),
        'plugins/gallery': resolve(import.meta.dirname, 'src/plugins/gallery.ts'),
        'plugins/input': resolve(import.meta.dirname, 'src/plugins/input.ts'),
        'plugins/shared': resolve(import.meta.dirname, 'src/plugins/shared.ts'),
        'plugins/preset': resolve(import.meta.dirname, 'src/plugins/preset.ts'),
        'plugins/scene': resolve(import.meta.dirname, 'src/plugins/scene.ts'),
        'plugins/settings': resolve(import.meta.dirname, 'src/plugins/settings.ts'),
        'plugins/sprite': resolve(import.meta.dirname, 'src/plugins/sprite.ts'),
        'plugins/ui': resolve(import.meta.dirname, 'src/plugins/ui.ts'),
        'save-preview': resolve(import.meta.dirname, 'src/save-preview.ts'),
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
        '@quajs/renderer-web/plugins/achievement',
        '@quajs/renderer-web/plugins/audio',
        '@quajs/renderer-web/plugins/background',
        '@quajs/renderer-web/plugins/backlog',
        '@quajs/renderer-web/plugins/character',
        '@quajs/renderer-web/plugins/choices',
        '@quajs/renderer-web/plugins/core',
        '@quajs/renderer-web/plugins/dialogue',
        '@quajs/renderer-web/plugins/effects',
        '@quajs/renderer-web/plugins/fonts',
        '@quajs/renderer-web/plugins/gallery',
        '@quajs/renderer-web/plugins/input',
        '@quajs/renderer-web/plugins/shared',
        '@quajs/renderer-web/plugins/preset',
        '@quajs/renderer-web/plugins/scene',
        '@quajs/renderer-web/plugins/settings',
        '@quajs/renderer-web/plugins/sprite',
        '@quajs/renderer-web/plugins/ui',
        '@quajs/renderer-web/save-preview',
        'react',
        'react-dom',
        'react-dom/client',
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
