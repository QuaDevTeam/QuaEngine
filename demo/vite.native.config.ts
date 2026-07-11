import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/targets/native/frame.ts',
    outDir: 'dist/native/dev-shell',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'frame.mjs',
      },
    },
  },
})
