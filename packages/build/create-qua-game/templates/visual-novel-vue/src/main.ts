import '@quajs/renderer-vue/styles/base.scss'
import '@quajs/renderer-vue/styles/default.scss'
import './game/styles.css'

import { createApp } from 'vue'
import { evaluateWebPlatformSupport, mountUnsupportedPlatformUi } from '@quajs/renderer-web/plugins/platform-guard'
import { quaWebRuntime } from 'virtual:qua-project'
import { createQuaGameApp } from './game/bootstrap'

const mountTarget = document.querySelector('#app')
if (!mountTarget) {
  throw new Error('Missing #app mount target.')
}

const platformSupport = evaluateWebPlatformSupport(quaWebRuntime)
if (!platformSupport.allowed) {
  mountUnsupportedPlatformUi(mountTarget, platformSupport)
}
else {
  const app = await createQuaGameApp()
  createApp(app).mount(mountTarget)
}
