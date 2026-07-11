import '@quajs/renderer-vue/styles/base.scss'
import '@quajs/renderer-vue/styles/default.scss'
import '@quajs/renderer-vue/styles/story-tree.scss'
import '../../game/styles.scss'

import { createApp } from 'vue'
import { createQuaGameApp } from '../../game/bootstrap'

const app = await createQuaGameApp()
createApp(app).mount('#app')
