import { quaEngine } from '@quajs/vite-plugin'
import { createSpriteVitePlugin } from '@quajs/plugin-sprite/vite'
import { qssScssPlugin } from '@quajs/vite-plugin-native-ui'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { hmr: process.env.VITE_QUA_EDITOR_PREVIEW === '1' ? false : undefined },
  plugins: [
    vue(),
    qssScssPlugin({ include: /\/game\/ui\/.*\.scss$/ }),
    ...quaEngine({
      assetBundling: {
        source: 'assets',
        devVfs: true,
        devVfsBase: '/@qua-assets',
      },
      webSecurity: {
        enabled: true,
        csp: {
          mode: 'hash',
          allowRuntimeBlobModules: false,
          trustedTypes: false,
        },
        sri: {
          enabled: true,
          algorithm: 'sha384',
        },
      },
    }),
    createSpriteVitePlugin({
      source: 'assets',
      devVfsBase: '/@qua-assets',
    }),
  ],
})
