import type { BacklogEntry, BacklogProjection } from '@quajs/plugin-backlog/contracts'
import type { QuaVueRendererPlugin } from '../core'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { computed, defineComponent, h } from 'vue'
import { useRendererActions, useUiControlSkin } from '../../composables'
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
    const mainSkin = useUiControlSkin({
      kind: 'button',
    })
    const voiceSkin = useUiControlSkin({
      kind: 'button',
    })
    return () => h('li', {
      'class': 'qua-backlog-entry',
      'data-backlog-entry': entry.value.id,
    }, [
      h('button', {
        class: 'qua-backlog-entry-main',
        type: 'button',
        disabled: !entry.value.rewindable,
        style: mainSkin.skinStyle.value,
        'data-skin-kind': 'button',
        'data-skin-reference': mainSkin.skinReference.value || undefined,
        'data-skin-state': mainSkin.skinState.value,
        ...createSkinButtonHandlers(mainSkin),
        onClick: () => actions.requestPluginEvent(BacklogRenderToLogicEvents.JUMP_REQUEST, { entryId: entry.value.id }),
      }, backlogText(entry.value)),
      entry.value.voice
        ? h('button', {
            class: 'qua-backlog-entry-voice',
            type: 'button',
            disabled: !entry.value.voiceReplay,
            style: voiceSkin.skinStyle.value,
            'data-skin-kind': 'button',
            'data-skin-reference': voiceSkin.skinReference.value || undefined,
            'data-skin-state': voiceSkin.skinState.value,
            ...createSkinButtonHandlers(voiceSkin),
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
    const panelSkin = useUiControlSkin({ kind: 'panel' })
    const closeSkin = useUiControlSkin({ kind: 'button' })
    return () => projection.value?.visible
      ? h('div', {
          class: 'qua-backlog-layer',
          onClick: (event: Event) => event.stopPropagation(),
        }, slots.default?.({
          backlog: projection.value,
          actions,
        }) || [
          h('section', {
            class: 'qua-backlog-panel',
            style: panelSkin.skinStyle.value,
            'data-skin-kind': 'panel',
            'data-skin-reference': panelSkin.skinReference.value || undefined,
            'data-skin-state': panelSkin.skinState.value,
          }, [
            h('button', {
              class: 'qua-backlog-close',
              type: 'button',
              style: closeSkin.skinStyle.value,
              'data-skin-kind': 'button',
              'data-skin-reference': closeSkin.skinReference.value || undefined,
              'data-skin-state': closeSkin.skinState.value,
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
      plane: 'safe',
    }],
  })
}

function backlogText(entry: BacklogEntry): string {
  if (entry.kind === 'choice') {
    return entry.text || entry.choices?.map(choice => choice.text).join(' / ') || ''
  }
  return `${entry.speaker ? `${entry.speaker}: ` : ''}${entry.text || ''}`
}

function createSkinButtonHandlers(
  skin: Pick<ReturnType<typeof useUiControlSkin>, 'setInteractiveState'>,
): Record<string, (event: Event) => void> {
  return {
    onMouseenter: () => skin.setInteractiveState('hover'),
    onMouseleave: () => skin.setInteractiveState('default'),
    onMousedown: (event: Event) => {
      if ((event as MouseEvent).button === 0) {
        skin.setInteractiveState('pressed')
      }
    },
    onMouseup: () => skin.setInteractiveState('hover'),
    onFocus: () => skin.setInteractiveState('hover'),
    onBlur: () => skin.setInteractiveState('default'),
  }
}

export const backlogRendererPlugin = createBacklogRendererPlugin()
