import { quaScriptPlugin } from '@quajs/script-compiler'
import { qssScssPlugin } from '@quajs/vite-plugin-native-ui'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  plugins: [qssScssPlugin(), quaScriptPlugin()],
  define: { 'import.meta.env.VITE_QUA_EDITOR_PREVIEW': '"0"' },
  build: { target: 'es2020', minify: false },
})
