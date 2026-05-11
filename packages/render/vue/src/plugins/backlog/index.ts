import type { BacklogEntry, BacklogProjection } from '@quajs/plugin-backlog/contracts'
import type { QuaVueRendererPlugin } from '../core'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { computed, defineComponent, h } from 'vue'
import { useRendererActions } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'

export const QuaBacklogEntry = defineComponent({
  name: 'QuaBacklogEntry',
  props: {
    entry: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const actions = useRendererActions()
    const entry = computed(() => props.entry as BacklogEntry)
    return () => h('li', {
      'class': 'qua-backlog-entry',
      'data-backlog-entry': entry.value.id,
    }, [
      h('button', {
        class: 'qua-backlog-entry-main',
        type: 'button',
        disabled: !entry.value.rewindable,
        onClick: () => actions.requestPluginEvent(BacklogRenderToLogicEvents.JUMP_REQUEST, { entryId: entry.value.id }),
      }, backlogText(entry.value)),
      entry.value.voice
        ? h('button', {
            class: 'qua-backlog-entry-voice',
            type: 'button',
            disabled: !entry.value.voiceReplay,
            onClick: () => actions.requestPluginEvent(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, { entryId: entry.value.id }),
          }, 'Voice')
        : null,
    ])
  },
})

export const QuaBacklogLayer = defineComponent({
  name: 'QuaBacklogLayer',
  setup(_, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const projection = computed(() => view.value.plugins[BACKLOG_PLUGIN_ID] as BacklogProjection | undefined)
    return () => projection.value?.visible
      ? h('div', {
          class: 'qua-backlog-layer',
          onClick: (event: Event) => event.stopPropagation(),
        }, slots.default?.({
          backlog: projection.value,
          actions,
        }) || [
          h('section', { class: 'qua-backlog-panel' }, [
            h('button', {
              class: 'qua-backlog-close',
              type: 'button',
              onClick: () => actions.requestPluginEvent(BacklogRenderToLogicEvents.CLOSE_REQUEST),
            }, 'Close'),
            h('ol', { class: 'qua-backlog-list' }, projection.value.entries.map(entry =>
              h(QuaBacklogEntry, { key: entry.id, entry }),
            )),
          ]),
        ])
      : null
  },
})

export function createBacklogRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/backlog',
    setup() {},
    layers: [{
      id: 'backlog',
      slot: 'overlay',
      component: QuaBacklogLayer,
      order: 95,
    }],
  })
}

function backlogText(entry: BacklogEntry): string {
  if (entry.kind === 'choice') {
    return entry.text || entry.choices?.map(choice => choice.text).join(' / ') || ''
  }
  return `${entry.speaker ? `${entry.speaker}: ` : ''}${entry.text || ''}`
}

export const backlogRendererPlugin = createBacklogRendererPlugin()
