import { mountAssetLoadingScene } from '@quajs/renderer-web/plugins/asset-loading'
import { createApp } from 'vue'
import { createQuaGameApp } from '../../game/bootstrap'

import { createDemoRuntime } from '../../game/runtime'
import { DEMO_LOADING_SURFACE } from '../../game/ui/features'
import '@quajs/renderer-vue/styles/base.scss'
import '../../game/styles.scss'
import '../../game/styles/asset-loading.scss'

let disposeLoading: (() => void) | undefined

async function bootstrapWeb() {
  const runtime = await createDemoRuntime({
    onEngineReady(engine) {
      disposeLoading = mountAssetLoadingScene({
        container: document.body,
        pipeline: engine.getPipeline(),
        getViewState: () => engine.getViewState(),
        surface: DEMO_LOADING_SURFACE,
        labels: {
          'preparing': '正在准备资源……',
          'checking-cache': '正在检查本地资源……',
          'downloading': '正在下载资源……',
          'verifying': '正在校验资源……',
          'caching': '正在保存资源……',
          'ready': '准备就绪',
          'error': '资源加载失败，请检查网络连接和浏览器存储空间后重试。',
          'retry': '重试',
        },
      })
    },
  })
  const app = await createQuaGameApp(runtime)
  createApp(app).mount('#app')
  if (import.meta.env.DEV && import.meta.env.VITE_QUA_EDITOR_PREVIEW === '1') {
    const [{ mountWebPreviewDevtools }, { getWebAudioPlaybackEntries }] = await Promise.all([
      import('@quajs/renderer-web/devtools'),
      import('@quajs/renderer-web/audio'),
    ])
    const dispose = mountWebPreviewDevtools({ container: document.getElementById('app')!, pipeline: runtime.engine.getPipeline(), getViewState: () => runtime.engine.getViewState(), getAudioPlayback: () => getWebAudioPlaybackEntries(runtime.engine.getPipeline()) })
    import.meta.hot?.dispose(dispose)
  }
  import.meta.hot?.dispose(() => disposeLoading?.())
}

void bootstrapWeb().catch((error) => {
  disposeLoading?.()
  console.error('Game startup failed', error)
  const message = document.createElement('p')
  message.className = 'qua-startup'
  message.textContent = '暂时无法启动游戏，请重试。'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = '重新加载'
  retry.addEventListener('click', () => location.reload())
  document.getElementById('app')?.replaceChildren(message, retry)
})
