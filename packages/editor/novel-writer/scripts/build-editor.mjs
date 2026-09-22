import { resolve } from 'node:path'
import { build } from 'vite'

await build({
  configFile: false,
  build: {
    outDir: 'dist/editor',
    emptyOutDir: false,
    target: 'node22',
    lib: { entry: resolve('editor/preload.ts'), formats: ['cjs'], fileName: () => 'preload.cjs' },
    rollupOptions: { external: ['electron'] },
  },
})
