import { quaEngine } from '@quajs/vite-plugin'
import { createSpriteVitePlugin } from '@quajs/plugin-sprite/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    ...quaEngine({
      assetBundling: {
        source: 'assets',
        devVfs: true,
        devVfsBase: '/@qua-assets',
      },
    }),
    createSpriteVitePlugin({
      source: 'assets',
      devVfsBase: '/@qua-assets',
    }),
  ],
})
