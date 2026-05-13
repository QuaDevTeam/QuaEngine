import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection } from '@quajs/render-core'
import type { RendererActions } from '@quajs/renderer-web'
import type { PropType } from 'vue'
import type { QuaVueRendererPlugin } from '../plugins/core'
import { emptyView, QuaWebRendererController, rendererRootStyle } from '@quajs/renderer-web'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, provide, readonly, shallowRef, watch } from 'vue'
import { QuaRendererContextKey } from '../context'
import { sortRendererLayers } from '../plugins/core'
import { QuaStage } from './QuaStage'

export interface QuaRendererSlotProps {
  view: Readonly<QuaViewProjection>
  layout: QuaViewProjection['layout']
  background: QuaViewProjection['background']
  characters: QuaViewProjection['characters']
  dialogue: QuaViewProjection['dialogue']
  choices: QuaViewProjection['choices']
  effects: QuaViewProjection['effects']
  animations: QuaViewProjection['animations']
  plugins: QuaViewProjection['plugins']
  actions: RendererActions
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
    const rendererPlugins = computed(() => props.plugins || [])
    const web = new QuaWebRendererController({
      pipeline: props.pipeline,
      assets: props.assets,
      initialView: props.initialView,
      plugins: rendererPlugins.value,
    })
    const snapshot = shallowRef(web.getSnapshot())
    const rendererLayers = computed(() => sortRendererLayers(rendererPlugins.value.flatMap(plugin => plugin.layers || [])))
    let stopPipelineWatch: (() => void) | undefined
    let stopAssetWatch: (() => void) | undefined
    let unsubscribeSnapshot: (() => void) | undefined

    const view = computed<QuaViewProjection>(() => {
      return snapshot.value.view || emptyView()
    })
    const readonlyView = readonly(view)
    const assetRevision = computed(() => snapshot.value.assetRevision)
    const actions = web.actions

    provide(QuaRendererContextKey, {
      web,
      pipeline: computed(() => requirePipeline(pipeline.value)),
      assets,
      view: readonlyView,
      assetRevision: readonly(assetRevision),
      actions,
    })

    onMounted(async () => {
      unsubscribeSnapshot = web.subscribe(nextSnapshot => snapshot.value = nextSnapshot)
      stopPipelineWatch = watch(pipeline, currentPipeline => web.setPipeline(requirePipeline(currentPipeline)), { immediate: true })
      stopAssetWatch = watch(assets, currentAssets => web.setAssets(currentAssets), { immediate: true })
      await web.start()
    })

    onBeforeUnmount(() => {
      stopPipelineWatch?.()
      stopAssetWatch?.()
      unsubscribeSnapshot?.()
      void web.destroy()
    })

    const slotProps = computed(() => createSlotProps(readonlyView.value, actions))

    return () => h('div', {
      class: ['qua-renderer', props.unstyled ? 'qua-renderer--unstyled' : undefined],
      style: rendererRootStyle(),
    }, slots.stage?.(slotProps.value)
    || h(QuaStage as any, { ...slotProps.value, layers: rendererLayers.value } as any, slots))
  },
})

function createSlotProps(view: Readonly<QuaViewProjection>, actions: RendererActions): QuaRendererSlotProps {
  return {
    view,
    layout: view.layout,
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
