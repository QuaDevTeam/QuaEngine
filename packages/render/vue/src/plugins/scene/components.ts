import type { SceneTransitionStore } from '@quajs/renderer-web'
import type { PropType } from 'vue'
import {
  normalizeSceneTransitionClass,
  sceneTransitionLayerStyle,
  sceneTransitionOverlayStyle,
} from '@quajs/renderer-web'
import { defineComponent, h, onBeforeUnmount, shallowRef, watch } from 'vue'

export const QuaSceneTransitionLayer = defineComponent({
  name: 'QuaSceneTransitionLayer',
  props: {
    store: {
      type: Object as PropType<SceneTransitionStore>,
      required: true,
    },
  },
  setup(props) {
    const state = shallowRef(props.store.getSnapshot())
    let unsubscribe: (() => void) | undefined

    const subscribe = (store: SceneTransitionStore) => {
      unsubscribe?.()
      state.value = store.getSnapshot()
      unsubscribe = store.subscribe((nextState) => {
        state.value = nextState
      })
    }

    subscribe(props.store)
    watch(() => props.store, subscribe)

    onBeforeUnmount(() => {
      unsubscribe?.()
      unsubscribe = undefined
    })

    return () => state.value.active
      ? h('div', {
          class: 'qua-scene-transition-layer',
          style: sceneTransitionLayerStyle(),
        }, [
          h('div', {
            'class': [
              'qua-scene-transition',
              `qua-scene-transition--${normalizeSceneTransitionClass(state.value.type)}`,
            ],
            'data-scene-transition-type': state.value.type,
            'style': sceneTransitionOverlayStyle(state.value),
          }),
        ])
      : null
  },
})
