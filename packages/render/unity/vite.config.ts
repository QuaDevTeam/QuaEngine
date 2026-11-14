import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const entries = {
  'controller': 'src/controller.ts',
  'defaults': 'src/defaults.ts',
  'dialogue-typewriter': 'src/dialogue-typewriter.ts',
  'index': 'src/index.ts',
  'overlay-placement': 'src/overlay-placement.ts',
  'projection': 'src/projection.ts',
  'qui': 'src/qui.ts',
  'types': 'src/types.ts',
  'ui-skin': 'src/ui-skin.ts',
  'utils': 'src/utils.ts',
  'plugins/achievement': 'src/plugins/achievement.ts',
  'plugins/audio': 'src/plugins/audio.ts',
  'plugins/background': 'src/plugins/background.ts',
  'plugins/backlog': 'src/plugins/backlog.ts',
  'plugins/character': 'src/plugins/character.ts',
  'plugins/choices': 'src/plugins/choices.ts',
  'plugins/core': 'src/plugins/core.ts',
  'plugins/dialogue': 'src/plugins/dialogue.ts',
  'plugins/effects': 'src/plugins/effects.ts',
  'plugins/fonts': 'src/plugins/fonts.ts',
  'plugins/gallery': 'src/plugins/gallery.ts',
  'plugins/input': 'src/plugins/input.ts',
  'plugins/preset': 'src/plugins/preset.ts',
  'plugins/projection-task': 'src/plugins/projection-task.ts',
  'plugins/projection-utils': 'src/plugins/projection-utils.ts',
  'plugins/save-preview': 'src/plugins/save-preview.ts',
  'plugins/scene': 'src/plugins/scene.ts',
  'plugins/settings': 'src/plugins/settings.ts',
  'plugins/sprite': 'src/plugins/sprite.ts',
  'plugins/ui': 'src/plugins/ui.ts',
}

export default defineConfig({
  plugins: [dts({ include: ['src/**/*'], outDir: 'dist', entryRoot: 'src' })],
  build: { lib: { entry: Object.fromEntries(Object.entries(entries).map(([key, file]) => [key, resolve(import.meta.dirname, file)])), formats: ['es'], fileName: (_format, name) => `${name}.js` }, target: 'es2020', rollupOptions: { external: /^@quajs\// } },
})
