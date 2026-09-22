import type { QuaVueRendererPlugin } from '@quajs/renderer-vue'
import type { createDemoRuntime } from './runtime'
import { LogicToRenderEvents, onLogicToRender } from '@quajs/engine'
import { QuaRenderer, useQuaRenderer } from '@quajs/renderer-vue'
import { createVisualNovelRendererPlugins } from '@quajs/renderer-vue/plugins/preset'
import { createQuiWebOverlayHost } from '@quajs/renderer-web/qui'
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DEMO_LOADING_SURFACE, DEMO_UI_FEATURE_SURFACES } from './ui/features'
import { createDemoUiSession } from './ui/session'
import { DEMO_APP_ELEMENT_ID, DEMO_APP_SURFACE_KEY } from './ui/surface'

/** Vue is only the Web stage host. All product pages come from shared QUI. */
export async function createQuaGameApp(runtime: Awaited<ReturnType<typeof createDemoRuntime>>) {
  const session = await createDemoUiSession(runtime)
  const engine = runtime.engine
  const activeView = ref(engine.getViewState())
  const disposeView = onLogicToRender(engine.getPipeline(), LogicToRenderEvents.VIEW_UPDATE, ({ view }) => {
    activeView.value = view
  })
  const quitMessage = ref('')
  const quit = () => {
    window.close()
    quitMessage.value = '浏览器未允许自动关闭，请手动关闭此标签页。'
  }
  engine.getPipeline().on('app/quit', quit)

  const SharedUi = defineComponent({
    name: 'DemoSharedUi',
    setup() {
      const { view } = useQuaRenderer()
      const host = ref<HTMLElement>()
      let renderer: ReturnType<typeof createQuiWebOverlayHost> | undefined
      onMounted(() => {
        // The standalone loading host remains mounted across runtime loads.
        // It already uses the shared surface; do not mount a second copy here.
        renderer = createQuiWebOverlayHost({ container: host.value!, pipeline: engine.getPipeline(), assets: runtime.assets, features: DEMO_UI_FEATURE_SURFACES.filter(feature => feature !== DEMO_LOADING_SURFACE), surfaceKeys: [DEMO_APP_SURFACE_KEY] })
        renderer.update(view.value)
      })
      watch(view, next => renderer?.update(next))
      onBeforeUnmount(() => renderer?.dispose())
      return () => h('div', { ref: host, style: 'position:absolute;inset:0;pointer-events:none;' })
    },
  })
  const productUi: QuaVueRendererPlugin = {
    name: 'demo-shared-ui',
    setup() {},
    layers: [{ id: 'demo-shared-ui', plane: 'overlay', order: 10_000, component: SharedUi }],
  }
  const plugins = createVisualNovelRendererPlugins({ ui: false, input: { bindings: [{ source: 'wheel', direction: 'up', command: 'ui:menu', preventDefault: false, throttleMs: 250 }] } })
    .filter(plugin => !['settings', 'backlog', 'gallery', 'achievement'].some(name => plugin.name.endsWith(`/${name}`)))
  return defineComponent({
    name: 'QuaGameRoot',
    setup() {
      onBeforeUnmount(() => {
        disposeView()
        session.dispose()
        engine.getPipeline().off('app/quit', quit)
      })
      return () => {
        const shell = activeView.value.ui.overlays?.[DEMO_APP_ELEMENT_ID]
        return h('main', {
          'class': 'game-root',
          'data-main-menu': shell?.screen === 'title' ? 'true' : undefined,
          'data-title-surface': String(shell?.titleSurface || false),
          'data-dialogue-chrome': shell?.titleSurface || shell?.screen === 'system' ? 'false' : 'true',
          'data-screen': shell?.screen,
        }, [
          h(QuaRenderer, { pipeline: engine.getPipeline(), assets: runtime.assets, initialView: engine.getViewState(), plugins: [...plugins, productUi], runtimePluginLoader: runtime.runtimePluginLoader, saveSlots: engine.getStore(), className: 'vn-renderer' }),
          quitMessage.value ? h('p', { role: 'status', style: 'position:absolute;bottom:24px;left:24px;right:24px;padding:16px;background:#f5f3eb;color:#29453f;z-index:999;' }, quitMessage.value) : null,
        ])
      }
    },
  })
}
