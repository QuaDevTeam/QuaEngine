export { QuaRenderer } from '../../packages/render/vue/src/index'
export { createBackgroundRendererPlugin } from '../../packages/render/vue/src/plugins/background'
// Served through Vite so the audit and renderer share the same Vue runtime.
export { createApp, h, nextTick } from 'vue'
