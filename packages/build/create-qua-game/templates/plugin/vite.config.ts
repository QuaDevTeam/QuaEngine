import { defineConfig } from 'vite'

// Bundle browser dependencies into devtools; keep runtime authority in the game.
export default defineConfig({
  build: {
    target: 'es2022',
    lib: {
      entry: { index: 'src/index.ts', editor: 'src/editor.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
      cssFileName: 'editor',
    },
    rollupOptions: { external: [/^@quajs\/engine(?:\/|$)/] },
  },
})
