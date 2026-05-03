import type { PropType } from 'vue'
import type { QuaAssets } from '@quajs/assets'
import type { QuaEngine } from '@quajs/engine'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, provide, readonly, ref, watch } from 'vue'
import {
  RendererPluginHost,
  emitRenderToLogic,
  LogicToRenderEvents,
  onLogicToRender,
  onRenderToLogic,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { QuaRendererContextKey } from '../context'
import { emptyView } from '../defaults'
import { QuaStage } from './layers'

export interface QuaRendererSlotProps {
  view: Readonly<QuaViewProjection>
  background: QuaViewProjection['background']
  characters: QuaViewProjection['characters']
  dialogue: QuaViewProjection['dialogue']
  choices: QuaViewProjection['choices']
  audio: QuaViewProjection['audio']
  effects: QuaViewProjection['effects']
  actions: typeof createRendererActions extends (...args: any[]) => infer T ? T : never
}

export const QuaRenderer = defineComponent({
  name: 'QuaRenderer',
  props: {
    engine: Object as PropType<QuaEngine>,
    pipeline: Object as PropType<Pipeline>,
    assets: Object as PropType<QuaAssets>,
    getViewState: Function as PropType<() => QuaViewProjection>,
    plugins: {
      type: Array as PropType<readonly RendererPlugin[]>,
      default: () => [],
    },
    unstyled: Boolean,
  },
  setup(props, { slots }) {
    const engine = computed(() => props.engine)
    const pipeline = computed(() => engine.value?.getPipeline() || props.pipeline)
    const assets = computed(() => props.assets || engine.value?.getAssets())
    const revision = ref(0)
    const assetRevision = ref(0)
    const eventUnsubscribers: Array<() => void> = []
    let pluginHost: RendererPluginHost | undefined
    let stopPipelineWatch: (() => void) | undefined

    const view = computed<QuaViewProjection>(() => {
      revision.value
      return engine.value?.getViewState() || props.getViewState?.() || emptyView()
    })
    const readonlyView = readonly(view)

    const refreshView = () => {
      revision.value += 1
    }

    const actions = createRendererActions(() => requirePipeline(pipeline.value))

    provide(QuaRendererContextKey, {
      engine,
      pipeline: computed(() => requirePipeline(pipeline.value)),
      assets,
      view: readonlyView,
      assetRevision: readonly(assetRevision),
      actions,
    })

    onMounted(async () => {
      pluginHost = new RendererPluginHost(props.plugins)
      stopPipelineWatch = watch(pipeline, (currentPipeline) => {
        cleanupPipelineSubscriptions(eventUnsubscribers)
        if (!currentPipeline)
          return

        eventUnsubscribers.push(onLogicToRender(currentPipeline, LogicToRenderEvents.VIEW_UPDATE, () => refreshView()))
        eventUnsubscribers.push(onLogicToRender(currentPipeline, LogicToRenderEvents.ASSET_CHANGED, () => {
          assetRevision.value += 1
          refreshView()
        }))
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
      cleanupPipelineSubscriptions(eventUnsubscribers)
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
      || h(QuaStage as any, slotProps.value as any, slots))
  },
})

function createRendererActions(getPipeline: () => Pipeline) {
  return {
    ready: () => emitRenderToLogic(getPipeline(), RenderToLogicEvents.RENDER_READY, { timestamp: Date.now() }),
    sceneReady: (sceneId?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.SCENE_READY, { sceneId, timestamp: Date.now() }),
    click: (payload = {}) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_CLICK, payload),
    advance: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source }),
    selectChoice: (choiceId: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId }),
    setVolume: (type: 'master' | 'bgm' | 'sound' | 'voice', value: number) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.VOLUME_CHANGE, { type, value }),
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
    audio: view.audio,
    effects: view.effects,
    actions,
  }
}

function requirePipeline(pipeline?: Pipeline): Pipeline {
  if (!pipeline) {
    throw new Error('QuaRenderer requires an engine or pipeline')
  }
  return pipeline
}

function cleanupPipelineSubscriptions(unsubscribers: Array<() => void>): void {
  while (unsubscribers.length > 0) {
    unsubscribers.pop()?.()
  }
}
