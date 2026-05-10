import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection } from '@quajs/render-core'
import type { PropType } from 'vue'
import type { QuaVueRendererPlugin } from '../plugins/core'
import {
  emitRenderToLogic,
  LogicToRenderEvents,
  onLogicToRender,
  onRenderToLogic,
  RendererPluginHost,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, provide, readonly, ref, watch } from 'vue'
import { QuaRendererContextKey } from '../context'
import { emptyView } from '../defaults'
import { sortRendererLayers } from '../plugins/core'
import { QuaStage } from './QuaStage'

export interface QuaRendererSlotProps {
  view: Readonly<QuaViewProjection>
  background: QuaViewProjection['background']
  characters: QuaViewProjection['characters']
  dialogue: QuaViewProjection['dialogue']
  choices: QuaViewProjection['choices']
  effects: QuaViewProjection['effects']
  animations: QuaViewProjection['animations']
  plugins: QuaViewProjection['plugins']
  actions: typeof createRendererActions extends (...args: any[]) => infer T ? T : never
}

export const QuaRenderer = defineComponent({
  name: 'QuaRenderer',
  props: {
    pipeline: {
      type: Object as PropType<Pipeline>,
      required: true,
    },
    assets: Object as PropType<QuaAssets>,
    initialView: Object as PropType<QuaViewProjection>,
    plugins: {
      type: Array as PropType<readonly QuaVueRendererPlugin[]>,
      default: () => [],
    },
    unstyled: Boolean,
  },
  setup(props, { slots }) {
    const pipeline = computed(() => props.pipeline)
    const assets = computed(() => props.assets)
    const projection = ref<QuaViewProjection>(props.initialView || emptyView())
    const revision = ref(0)
    const assetRevision = ref(0)
    const rendererPlugins = computed(() => props.plugins || [])
    const rendererLayers = computed(() => sortRendererLayers(rendererPlugins.value.flatMap(plugin => plugin.layers || [])))
    const eventUnsubscribers: Array<() => void> = []
    let pluginHost: RendererPluginHost | undefined
    let stopPipelineWatch: (() => void) | undefined
    let stopAssetWatch: (() => void) | undefined
    let subscribedAssets: QuaAssets | undefined

    const view = computed<QuaViewProjection>(() => {
      return revision.value >= 0
        ? projection.value
        : emptyView()
    })
    const readonlyView = readonly(view)

    const refreshView = () => {
      revision.value += 1
    }

    const refreshAssets = () => {
      assetRevision.value += 1
      refreshView()
    }

    const cleanupAssetSubscription = () => {
      subscribedAssets?.off('asset:changed', refreshAssets)
      subscribedAssets = undefined
    }

    const actions = createRendererActions(() => requirePipeline(pipeline.value))

    provide(QuaRendererContextKey, {
      pipeline: computed(() => requirePipeline(pipeline.value)),
      assets,
      view: readonlyView,
      assetRevision: readonly(assetRevision),
      actions,
    })

    onMounted(async () => {
      pluginHost = new RendererPluginHost(rendererPlugins.value)
      stopPipelineWatch = watch(pipeline, (currentPipeline) => {
        cleanupPipelineSubscriptions(eventUnsubscribers)
        if (!currentPipeline)
          return

        eventUnsubscribers.push(onLogicToRender(currentPipeline, LogicToRenderEvents.VIEW_UPDATE, (payload) => {
          projection.value = payload.view
          refreshView()
        }))
        eventUnsubscribers.push(onLogicToRender(currentPipeline, LogicToRenderEvents.ASSET_CHANGED, () => {
          assetRevision.value += 1
          refreshView()
        }))
      }, { immediate: true })
      stopAssetWatch = watch(assets, (currentAssets) => {
        cleanupAssetSubscription()
        if (!currentAssets)
          return
        currentAssets.on('asset:changed', refreshAssets)
        subscribedAssets = currentAssets
      }, { immediate: true })
      await pluginHost.init({
        getPipeline: () => requirePipeline(pipeline.value),
        getViewState: () => readonlyView.value,
        refresh: refreshView,
        emitRenderToLogic: (type, payload) => emitRenderToLogic(requirePipeline(pipeline.value), type as any, payload as any),
        onLogicToRender: (type, handler) => onLogicToRender(requirePipeline(pipeline.value), type as any, handler as any),
        onRenderToLogic: (type, handler) => onRenderToLogic(requirePipeline(pipeline.value), type as any, handler as any),
      })
      await actions.ready()
    })

    onBeforeUnmount(() => {
      stopPipelineWatch?.()
      stopAssetWatch?.()
      cleanupPipelineSubscriptions(eventUnsubscribers)
      cleanupAssetSubscription()
      pluginHost?.destroy()
      const currentPipeline = pipeline.value
      if (currentPipeline) {
        emitRenderToLogic(currentPipeline, RenderToLogicEvents.RENDER_DESTROYED, { timestamp: Date.now() })
      }
    })

    const slotProps = computed(() => createSlotProps(readonlyView.value, actions))

    return () => h('div', {
      class: ['qua-renderer', props.unstyled ? 'qua-renderer--unstyled' : undefined],
    }, slots.stage?.(slotProps.value)
    || h(QuaStage as any, { ...slotProps.value, layers: rendererLayers.value } as any, slots))
  },
})

function createRendererActions(getPipeline: () => Pipeline) {
  return {
    ready: () => emitRenderToLogic(getPipeline(), RenderToLogicEvents.RENDER_READY, { timestamp: Date.now() }),
    sceneReady: (sceneId?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.SCENE_READY, { sceneId, timestamp: Date.now() }),
    click: (payload = {}) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_CLICK, payload),
    advance: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source }),
    selectChoice: (choiceId: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId }),
    requestSave: (slotId?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.GAME_SAVE_REQUEST, { slotId }),
    requestLoad: (slotId?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.GAME_LOAD_REQUEST, { slotId }),
    requestUiOpen: (elementId: string, config?: Record<string, unknown>) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_OPEN, { elementId, config }),
    requestUiClose: (elementId: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_CLOSE, { elementId }),
    requestUiUpdate: (elementId: string, config: Record<string, unknown>) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_UPDATE, { elementId, config }),
  }
}

function createSlotProps(view: Readonly<QuaViewProjection>, actions: ReturnType<typeof createRendererActions>): QuaRendererSlotProps {
  return {
    view,
    background: view.background,
    characters: view.characters,
    dialogue: view.dialogue,
    choices: view.choices,
    effects: view.effects,
    animations: view.animations,
    plugins: view.plugins,
    actions,
  }
}

function requirePipeline(pipeline?: Pipeline): Pipeline {
  if (!pipeline) {
    throw new Error('QuaRenderer requires a pipeline')
  }
  return pipeline
}

function cleanupPipelineSubscriptions(unsubscribers: Array<() => void>): void {
  while (unsubscribers.length > 0) {
    unsubscribers.pop()?.()
  }
}
