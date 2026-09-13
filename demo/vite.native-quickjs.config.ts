import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quaScriptPlugin } from '@quajs/script-compiler'
import { qssScssPlugin } from '@quajs/vite-plugin-native-ui'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  publicDir: false,
  // qssScssPlugin must come before quaScriptPlugin so .scss?raw imports are
  // compiled to flat QSS before the QuickJS bundle is assembled.
  plugins: [qssScssPlugin(), quaScriptPlugin()],
  ssr: { noExternal: true },
  build: {
    ssr: resolve(root, 'src/targets/native/quickjs.ts'),
    outDir: resolve(root, 'assets/scripts'),
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'native-app.mjs',
        codeSplitting: false,
      },
    },
  },
})
