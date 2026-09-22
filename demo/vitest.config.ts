import { quaScriptPlugin } from '@quajs/script-compiler'
import { qssScssPlugin } from '@quajs/vite-plugin-native-ui'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [qssScssPlugin(), quaScriptPlugin()],
  test: { include: ['scripts/**/*.test.ts'], environment: 'node' },
})
