import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quaScriptPlugin } from '@quajs/script-compiler'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  publicDir: false,
  plugins: [quaScriptPlugin()],
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
