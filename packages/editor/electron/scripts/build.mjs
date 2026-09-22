import { resolve } from 'node:path'
import { build } from 'vite'
import './prepare-pty.mjs'

await build({
  configFile: false,
  build: {
    ssr: true,
    target: 'node22',
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: { 'plugin-indexer-worker': resolve('src/plugins/indexer-worker.ts'), 'main': resolve('src/main/index.ts'), 'project-worker': resolve('src/project-service/worker.ts'), 'terminal-worker': resolve('src/terminal/worker.ts'), 'language-worker': resolve('src/project-service/language-worker.ts'), 'lint-worker': resolve('src/project-service/lint-worker.ts'), 'check-worker': resolve('src/project-service/check-worker.ts') },
      external: id => id === 'create-qua-game' || id === 'electron' || id === '@vscode/ripgrep' || id === 'sharp' || id === 'node-pty' || id.startsWith('node:') || id.startsWith('@quajs/'),
      output: { entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
})
await build({
  configFile: false,
  build: {
    target: 'node22',
    minify: false,
    emptyOutDir: false,
    lib: { entry: resolve('src/preload/index.ts'), formats: ['cjs'], fileName: () => 'preload.cjs' },
    rollupOptions: { external: ['electron'] },
  },
})

await import('./build-icons.mjs')
await import('./build-native-layer.mjs')
await import('./build-sdk.mjs')
