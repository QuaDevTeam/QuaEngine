import type { BacklogEntry, BacklogProjection, BacklogUiProjection, BacklogUiSceneProjection } from '@quajs/plugin-backlog/contracts'
import type { ViewOverlayStackPlacement } from '@quajs/render-core'
import type { PropType, VNode } from 'vue'
import type { QuaVueRendererPlugin } from '../core'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { DEFAULT_UI_OVERLAY_Z_INDEXES } from '@quajs/render-core'
import { computed, defineComponent, h } from 'vue'
import { useRendererActions, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'
import { dispatchVueRendererIntent } from '../shared/intent'
import { createOverlayStackBinding } from '../shared/overlay'

export const QuaBacklogEntry = defineComponent({
  name: 'QuaBacklogEntry',
  props: {
    entry: {
      type: Object as PropType<BacklogEntry>,
      required: true,
    },
    index: {
      type: Number,
      default: 0,
    },
  },
  setup(props, { slots }) {
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    const entry = computed(() => props.entry)
    const mainSkin = useUiControlSkin({
      kind: 'button',
      disabled: () => !entry.value.rewindable,
    })
    const voiceSkin = useUiControlSkin({
      kind: 'button',
      disabled: () => !entry.value.voiceReplay,
    })
    const jump = () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(BacklogRenderToLogicEvents.JUMP_REQUEST, { entryId: entry.value.id }), {
      phase: 'backlog:jump',
      metadata: { entryId: entry.value.id },
    })
    const replayVoice = () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, { entryId: entry.value.id }), {
      phase: 'backlog:replay-voice',
      metadata: { entryId: entry.value.id },
    })
    return () => {
      const currentEntry = entry.value
      const payload = createBacklogEntrySlotPayload(currentEntry, props.index, jump, replayVoice)
      const content = slots.default?.(payload) || [
        slots.meta?.(payload) || renderBacklogEntryMeta(currentEntry, props.index),
        slots.content?.(payload) || renderBacklogEntryContent(currentEntry),
      ]
      const main = currentEntry.rewindable
        ? h('button', {
            'class': 'qua-backlog-entry-main',
            'type': 'button',
            'aria-label': `Jump to backlog entry ${props.index + 1}`,
            'style': mainSkin.skinStyle.value,
            'data-skin-kind': 'button',
            'data-skin-reference': mainSkin.skinReference.value || undefined,
            'data-skin-state': mainSkin.skinState.value,
            ...createSkinButtonHandlers(mainSkin),
            'onClick': jump,
          }, content)
        : h('article', {
            'class': 'qua-backlog-entry-main',
            'aria-label': `Backlog entry ${props.index + 1}`,
          }, content)

      return h('li', {
        'class': [
          'qua-backlog-entry',
          `qua-backlog-entry--${currentEntry.kind}`,
          currentEntry.rewindable ? undefined : 'is-not-rewindable',
        ],
        'data-backlog-entry': currentEntry.id,
        'data-backlog-kind': currentEntry.kind,
        'data-backlog-rewindable': currentEntry.rewindable ? 'true' : 'false',
        'data-backlog-voice': currentEntry.voice ? 'true' : undefined,
      }, [
        main,
        slots.actions?.(payload) || (currentEntry.voice
          ? h('button', {
              'class': 'qua-backlog-entry-voice',
              'type': 'button',
              'disabled': !currentEntry.voiceReplay,
              'aria-label': `Replay voice for backlog entry ${props.index + 1}`,
              'style': voiceSkin.skinStyle.value,
              'data-skin-kind': 'button',
              'data-skin-reference': voiceSkin.skinReference.value || undefined,
              'data-skin-state': voiceSkin.skinState.value,
              ...createSkinButtonHandlers(voiceSkin),
              'onClick': replayVoice,
            }, 'Voice')
          : null),
      ])
    }
  },
})

export const QuaBacklogLayer = defineComponent({
  name: 'QuaBacklogLayer',
  setup(_, { slots }) {
    const renderer = useQuaRenderer()
    const { view } = renderer
    const actions = useRendererActions()
    const projection = computed(() => view.value.plugins[BACKLOG_PLUGIN_ID] as BacklogProjection | undefined)
    const overlayStack = computed(() => createOverlayStackBinding(backlogUiPlacement(projection.value?.ui), {
      overlayStack: 'overlay',
      zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.backlog,
    }))
    const panelSkin = useUiControlSkin({ kind: 'panel' })
    const closeSkin = useUiControlSkin({ kind: 'button' })
    const close = () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(BacklogRenderToLogicEvents.CLOSE_REQUEST), {
      phase: 'backlog:close',
    })
    return () => projection.value?.visible
      ? h('div', {
          'class': createBacklogLayerClasses(projection.value.ui?.scene),
          'data-qua-capture-role': 'overlay',
          ...createBacklogSceneDataset(projection.value.ui?.scene),
          ...overlayStack.value.attrs,
          'style': { pointerEvents: 'auto', ...overlayStack.value.style },
          'onClick': (event: Event) => event.stopPropagation(),
        }, slots.default?.(createBacklogLayerSlotPayload(projection.value, actions, close)) || [
          h('section', {
            'class': 'qua-backlog-panel',
            'style': panelSkin.skinStyle.value,
            'data-backlog-count': String(projection.value.entries.length),
            'data-skin-kind': 'panel',
            'data-skin-reference': panelSkin.skinReference.value || undefined,
            'data-skin-state': panelSkin.skinState.value,
          }, [
            slots.header?.(createBacklogLayerSlotPayload(projection.value, actions, close)) || renderBacklogHeader(projection.value, close, closeSkin),
            projection.value.entries.length > 0
              ? h('ol', { class: 'qua-backlog-list' }, projection.value.entries.map((entry, index) =>
                  slots.entry?.(createBacklogEntrySlotPayload(entry, index, () => actions.requestPluginEvent(BacklogRenderToLogicEvents.JUMP_REQUEST, { entryId: entry.id }), () => actions.requestPluginEvent(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, { entryId: entry.id })))
                  || h(QuaBacklogEntry, { key: entry.id, entry, index }),
                ))
              : slots.empty?.(createBacklogLayerSlotPayload(projection.value, actions, close)) || h('p', { class: 'qua-backlog-empty' }, 'No recorded lines yet.'),
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
      slot: 'backlog',
      component: QuaBacklogLayer,
      order: 95,
      plane: 'screen',
    }],
  })
}

function createBacklogLayerSlotPayload(
  backlog: BacklogProjection,
  actions: ReturnType<typeof useRendererActions>,
  close: () => void | Promise<void>,
) {
  return {
    backlog,
    entries: backlog.entries,
    actions,
    close,
  }
}

function createBacklogEntrySlotPayload(
  entry: BacklogEntry,
  index: number,
  jump: () => void | Promise<void>,
  replayVoice: () => void | Promise<void>,
) {
  return {
    entry,
    index,
    text: backlogText(entry),
    jump,
    replayVoice,
  }
}

function renderBacklogHeader(
  _backlog: BacklogProjection,
  close: () => void | Promise<void>,
  closeSkin: ReturnType<typeof useUiControlSkin>,
): VNode {
  return h('header', { class: 'qua-backlog-header' }, [
    h('div', { class: 'qua-backlog-heading' }, [
      h('h2', { class: 'qua-backlog-title' }, 'Backlog'),
    ]),
    h('button', {
      'class': 'qua-backlog-close',
      'type': 'button',
      'style': closeSkin.skinStyle.value,
      'data-skin-kind': 'button',
      'data-skin-reference': closeSkin.skinReference.value || undefined,
      'data-skin-state': closeSkin.skinState.value,
      ...createSkinButtonHandlers(closeSkin),
      'onClick': close,
    }, 'Close'),
  ])
}

function renderBacklogEntryMeta(entry: BacklogEntry, index: number): VNode {
  return h('span', { class: 'qua-backlog-entry-meta' }, [
    h('span', { class: 'qua-backlog-entry-index' }, String(index + 1).padStart(2, '0')),
    h('time', {
      class: 'qua-backlog-entry-time',
      datetime: formatBacklogGameTimeDateTime(entry.gameTimeMs),
      title: formatBacklogRecordedAt(entry.recordedAt),
    }, formatBacklogGameTime(entry.gameTimeMs)),
  ])
}

function renderBacklogEntryContent(entry: BacklogEntry): VNode {
  return h('span', { class: 'qua-backlog-entry-content' }, [
    entry.speaker ? h('strong', { class: 'qua-backlog-entry-speaker' }, entry.speaker) : null,
    h('span', { class: 'qua-backlog-entry-text' }, entry.kind === 'choice' ? choiceText(entry) : entry.text || ''),
    entry.kind === 'choice' && entry.choices?.length
      ? h('span', { class: 'qua-backlog-choice-list' }, entry.choices.map(choice =>
          h('span', {
            'key': choice.id,
            'class': 'qua-backlog-choice-item',
            'data-backlog-choice-id': choice.id,
          }, choice.text),
        ))
      : null,
  ])
}

function createBacklogLayerClasses(scene?: Readonly<BacklogUiSceneProjection>): string[] {
  return [
    'qua-backlog-layer',
    scene ? 'qua-backlog-layer--ui-scene' : '',
    scene?.presentation === 'scene' ? 'qua-backlog-layer--scene' : '',
    scene?.presentation === 'overlay' ? 'qua-backlog-layer--overlay' : '',
  ].filter(Boolean)
}

function createBacklogSceneDataset(scene?: Readonly<BacklogUiSceneProjection>): Record<string, string | undefined> {
  return {
    'data-ui-scene-id': scene?.id,
    'data-ui-scene-presentation': scene?.presentation,
    'data-ui-scene-overlay-variant': scene?.overlay?.variant,
    'data-ui-scene-default-chrome': scene?.overlay?.defaultChrome === false ? 'false' : undefined,
    'data-ui-scene-hide-hud': scene?.overlay?.hideHud ? 'true' : undefined,
    'data-ui-scene-hide-dialogue': scene?.overlay?.hideDialogue ? 'true' : undefined,
  }
}

function backlogUiPlacement(ui: Readonly<BacklogUiProjection> | undefined): ViewOverlayStackPlacement {
  return {
    overlayStack: ui?.overlayStack ?? ui?.scene?.overlay?.overlayStack,
    stackPriority: ui?.stackPriority ?? ui?.scene?.overlay?.stackPriority,
    zIndex: ui?.zIndex ?? ui?.scene?.overlay?.zIndex,
  }
}

function choiceText(entry: BacklogEntry): string {
  return entry.text || entry.choices?.map(choice => choice.text).join(' / ') || ''
}

function formatBacklogGameTime(gameTimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(gameTimeMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatBacklogGameTimeDateTime(gameTimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(gameTimeMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `PT${hours}H${minutes}M${seconds}S`
}

function formatBacklogRecordedAt(recordedAt: number): string | undefined {
  const date = new Date(recordedAt)
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString()
}

function backlogText(entry: BacklogEntry): string {
  if (entry.kind === 'choice') {
    return choiceText(entry)
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
