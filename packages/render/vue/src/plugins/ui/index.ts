import type { PropType, VNode } from 'vue'
import type { QuaVueRendererPlugin } from '../core'
import { computed, defineComponent, h } from 'vue'
import { useAudio, useFlowControl, useRendererActions, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'

const BACKLOG_OPEN_REQUEST = 'backlog/open_request'
const DEFAULT_SAVE_SLOT_COUNT = 12
const SETTINGS_RENDERER_LAYER_ID = 'settings'

type SaveLoadMode = 'save' | 'load'

type UiOverlaySkinConfig = Readonly<Record<string, unknown>> & {
  skinId?: string
  title?: string
  subtitle?: string
  description?: string
}

type SaveLoadOverlayConfig = UiOverlaySkinConfig & {
  mode?: SaveLoadMode
  slots?: readonly SaveSlotProjection[]
  slotCount?: number
  slotPrefix?: string
  showQuickActions?: boolean
}

interface SaveSlotProjection {
  slotId: string
  name?: string
  timestamp?: string | number
  screenshot?: string
  metadata?: {
    sceneName?: string
    stepId?: string
    playtime?: number
    [key: string]: unknown
  }
}

export interface QuaUiOverlayProps {
  elementId?: string
}

const QuaUiActionButton = defineComponent({
  name: 'QuaUiActionButton',
  props: {
    label: {
      type: String,
      required: true,
    },
    className: {
      type: String,
      default: '',
    },
    disabled: Boolean,
    active: Boolean,
    onAction: Function as PropType<() => void | Promise<void>>,
  },
  setup(props) {
    const skin = useUiControlSkin({
      kind: 'button',
      disabled: () => props.disabled,
      selected: () => props.active,
    })
    return () => h('button', {
      'class': ['qua-ui-action-button', props.className, props.active ? 'is-active' : undefined],
      'type': 'button',
      'disabled': props.disabled,
      'style': skin.skinStyle.value,
      'data-skin-kind': 'button',
      'data-skin-reference': skin.skinReference.value || undefined,
      'data-skin-state': skin.skinState.value,
      ...createSkinButtonHandlers(skin),
      'onClick': (event: Event) => {
        event.stopPropagation()
        if (!props.disabled) {
          void props.onAction?.()
        }
      },
    }, props.label)
  },
})

const QuaSaveSlotButton = defineComponent({
  name: 'QuaSaveSlotButton',
  props: {
    index: {
      type: Number,
      required: true,
    },
    mode: {
      type: String as PropType<SaveLoadMode>,
      required: true,
    },
    slot: {
      type: Object as PropType<SaveSlotProjection>,
      required: true,
    },
  },
  setup(props) {
    const actions = useRendererActions()
    const disabled = computed(() => props.mode === 'load' && !isFilledSaveSlot(props.slot))
    const skin = useUiControlSkin({
      kind: 'button',
      disabled: () => disabled.value,
    })
    return () => h('li', { class: 'qua-save-slot-item' }, [
      h('button', {
        'class': ['qua-save-slot-button', isFilledSaveSlot(props.slot) ? 'is-filled' : 'is-empty'],
        'type': 'button',
        'disabled': disabled.value,
        'style': skin.skinStyle.value,
        'data-save-slot-id': props.slot.slotId,
        'data-skin-kind': 'button',
        'data-skin-reference': skin.skinReference.value || undefined,
        'data-skin-state': skin.skinState.value,
        ...createSkinButtonHandlers(skin),
        'onClick': (event: Event) => {
          event.stopPropagation()
          if (disabled.value) {
            return
          }
          void (props.mode === 'save'
            ? actions.requestSave(props.slot.slotId)
            : actions.requestLoad(props.slot.slotId))
        },
      }, renderSaveSlotContent(props.slot, props.index)),
    ])
  },
})

export const QuaUiOverlay = defineComponent({
  name: 'QuaUiOverlay',
  props: {
    elementId: {
      type: String,
      default: 'overlay',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed<UiOverlaySkinConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as UiOverlaySkinConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': 'qua-ui-overlay',
          'data-overlay': props.elementId,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': skin.skinStyle.value,
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          actions,
        }) || renderGenericOverlayContent(props.elementId, config.value, actions))
      : null
  },
})

export const QuaMenuOverlay = defineComponent({
  name: 'QuaMenuOverlay',
  props: {
    elementId: {
      type: String,
      default: 'menu',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const flowControl = useFlowControl()
    const config = computed<UiOverlaySkinConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as UiOverlaySkinConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': 'qua-menu-overlay',
          'data-overlay': props.elementId,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': skin.skinStyle.value,
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          actions,
        }) || [
          renderPanelHeader({
            title: config.value.title || 'Menu',
            subtitle: config.value.subtitle || view.value.dialogue.characterName || undefined,
            close: () => actions.requestUiClose(props.elementId),
          }),
          h('div', { class: 'qua-menu-actions' }, [
            h(QuaUiActionButton, {
              className: 'qua-menu-action qua-menu-action--continue',
              label: 'Continue',
              onAction: () => actions.requestUiClose(props.elementId),
            }),
            h(QuaUiActionButton, {
              className: 'qua-menu-action qua-menu-action--save',
              label: 'Save',
              onAction: () => actions.requestUiOpen('saveLoad', { mode: 'save', source: props.elementId }),
            }),
            h(QuaUiActionButton, {
              className: 'qua-menu-action qua-menu-action--load',
              label: 'Load',
              onAction: () => actions.requestUiOpen('saveLoad', { mode: 'load', source: props.elementId }),
            }),
            h(QuaUiActionButton, {
              className: 'qua-menu-action qua-menu-action--settings',
              label: 'Settings',
              onAction: () => actions.requestUiOpen('settings', { source: props.elementId }),
            }),
            h(QuaUiActionButton, {
              className: 'qua-menu-action qua-menu-action--backlog',
              label: 'Backlog',
              onAction: () => actions.requestPluginEvent(BACKLOG_OPEN_REQUEST),
            }),
          ]),
          h('footer', { class: 'qua-menu-footer' }, [
            h(QuaUiActionButton, {
              className: 'qua-menu-secondary-action',
              label: flowControl.value.mode === 'auto' ? 'Stop Auto' : 'Auto',
              disabled: !flowControl.value.controls.canAutoAdvance,
              active: flowControl.value.mode === 'auto',
              onAction: () => flowControl.value.mode === 'auto'
                ? actions.stopAuto('menu')
                : actions.startAuto('menu'),
            }),
            h(QuaUiActionButton, {
              className: 'qua-menu-secondary-action',
              label: flowControl.value.mode === 'skip' ? 'Stop Skip' : 'Skip',
              disabled: !flowControl.value.controls.canSkip,
              active: flowControl.value.mode === 'skip',
              onAction: () => flowControl.value.mode === 'skip'
                ? actions.stopSkip('menu')
                : actions.startSkip('menu'),
            }),
          ]),
        ])
      : null
  },
})

export const QuaSaveLoadPanel = defineComponent({
  name: 'QuaSaveLoadPanel',
  props: {
    elementId: {
      type: String,
      default: 'saveLoad',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed<SaveLoadOverlayConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as SaveLoadOverlayConfig | undefined)
    const mode = computed<SaveLoadMode>(() => config.value?.mode === 'load' ? 'load' : 'save')
    const slotsProjection = computed(() => createSaveSlotGrid(config.value))
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': 'qua-save-load-panel',
          'data-overlay': props.elementId,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'data-save-load-mode': mode.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': skin.skinStyle.value,
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          mode: mode.value,
          slots: slotsProjection.value,
          actions,
        }) || [
          renderPanelHeader({
            title: config.value.title || (mode.value === 'save' ? 'Save' : 'Load'),
            subtitle: config.value.subtitle || 'Select a slot',
            close: () => actions.requestUiClose(props.elementId),
          }),
          h('div', { class: 'qua-save-load-mode-tabs' }, [
            h(QuaUiActionButton, {
              className: 'qua-save-load-mode-tab',
              label: 'Save',
              active: mode.value === 'save',
              onAction: () => actions.requestUiUpdate(props.elementId, { ...config.value, mode: 'save' }),
            }),
            h(QuaUiActionButton, {
              className: 'qua-save-load-mode-tab',
              label: 'Load',
              active: mode.value === 'load',
              onAction: () => actions.requestUiUpdate(props.elementId, { ...config.value, mode: 'load' }),
            }),
          ]),
          h('ol', { class: 'qua-save-slot-grid' }, slotsProjection.value.map((slot, index) =>
            h(QuaSaveSlotButton, {
              key: slot.slotId,
              index,
              mode: mode.value,
              slot,
            }),
          )),
          config.value.showQuickActions === false
            ? null
            : h('footer', { class: 'qua-save-load-footer' }, [
                h(QuaUiActionButton, {
                  className: 'qua-save-load-quick-action',
                  label: 'Quick Save',
                  onAction: () => actions.requestSave(),
                }),
                h(QuaUiActionButton, {
                  className: 'qua-save-load-quick-action',
                  label: 'Quick Load',
                  onAction: () => actions.requestLoad(),
                }),
              ]),
        ])
      : null
  },
})

export const QuaSettingsPanel = defineComponent({
  name: 'QuaSettingsPanel',
  props: {
    elementId: {
      type: String,
      default: 'settings',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const audio = useAudio()
    const actions = useRendererActions()
    const flowControl = useFlowControl()
    const config = computed<UiOverlaySkinConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as UiOverlaySkinConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': 'qua-settings-panel',
          'data-overlay': props.elementId,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': skin.skinStyle.value,
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          audio: audio.value,
          actions,
        }) || [
          renderPanelHeader({
            title: config.value.title || 'Settings',
            subtitle: config.value.subtitle || 'Playback',
            close: () => actions.requestUiClose(props.elementId),
          }),
          h('div', { class: 'qua-settings-summary-grid' }, [
            h('section', { class: 'qua-settings-summary-section' }, [
              h('h3', { class: 'qua-settings-summary-title' }, 'Flow'),
              h('p', { class: 'qua-settings-summary-value' }, titleFromField(flowControl.value.mode)),
              h('div', { class: 'qua-settings-summary-actions' }, [
                h(QuaUiActionButton, {
                  className: 'qua-settings-summary-action',
                  label: flowControl.value.mode === 'auto' ? 'Stop Auto' : 'Auto',
                  disabled: !flowControl.value.controls.canAutoAdvance,
                  active: flowControl.value.mode === 'auto',
                  onAction: () => flowControl.value.mode === 'auto'
                    ? actions.stopAuto('settings')
                    : actions.startAuto('settings'),
                }),
                h(QuaUiActionButton, {
                  className: 'qua-settings-summary-action',
                  label: flowControl.value.mode === 'fast-forward' ? 'Stop Fast' : 'Fast',
                  disabled: !flowControl.value.controls.canFastForward,
                  active: flowControl.value.mode === 'fast-forward',
                  onAction: () => flowControl.value.mode === 'fast-forward'
                    ? actions.stopFastForward('settings')
                    : actions.startFastForward('settings'),
                }),
              ]),
            ]),
            h('section', { class: 'qua-settings-summary-section' }, [
              h('h3', { class: 'qua-settings-summary-title' }, 'Audio'),
              h('p', { class: 'qua-settings-summary-value' }, audioStatus(audio.value)),
              h('p', { class: 'qua-settings-summary-meta' }, audioDetail(audio.value)),
            ]),
          ]),
        ])
      : null
  },
})

export const QuaOverlayLayer = defineComponent({
  name: 'QuaOverlayLayer',
  setup() {
    const { view, rendererLayerIds } = useQuaRenderer()
    const overlays = computed(() => view.value.ui.overlays || {})
    const overlayIds = computed(() => Object.keys(overlays.value))
    const hasDedicatedSettingsRenderer = computed(() =>
      rendererLayerIds.value.includes(SETTINGS_RENDERER_LAYER_ID),
    )
    return () => overlayIds.value.length > 0
      ? h('div', {
          class: 'qua-overlay-layer',
          onClick: (event: Event) => event.stopPropagation(),
        }, [
          overlays.value.menu ? h(QuaMenuOverlay) : null,
          overlays.value.saveLoad ? h(QuaSaveLoadPanel) : null,
          overlays.value.settings && !hasDedicatedSettingsRenderer.value ? h(QuaSettingsPanel) : null,
          ...overlayIds.value
            .filter(elementId => !isBuiltInOverlay(elementId, hasDedicatedSettingsRenderer.value))
            .map(elementId => h(QuaUiOverlay, { key: elementId, elementId })),
        ])
      : null
  },
})

export function createUiRendererPlugin(): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/ui',
    setup() {},
    layers: [{
      id: 'overlay',
      slot: 'overlay',
      component: QuaOverlayLayer,
      order: 90,
      plane: 'safe',
    }],
  })
}

export const uiRendererPlugin = createUiRendererPlugin()

function renderGenericOverlayContent(
  elementId: string,
  config: UiOverlaySkinConfig,
  actions: ReturnType<typeof useRendererActions>,
): Array<VNode | null> {
  return [
    renderPanelHeader({
      title: config.title || titleFromField(elementId),
      subtitle: config.subtitle,
      close: () => actions.requestUiClose(elementId),
    }),
    config.description
      ? h('p', { class: 'qua-ui-overlay-description' }, config.description)
      : null,
  ]
}

function renderPanelHeader(options: {
  title: string
  subtitle?: string
  close: () => void | Promise<void>
}): VNode {
  return h('header', { class: 'qua-ui-panel-header' }, [
    h('div', { class: 'qua-ui-panel-heading' }, [
      h('h2', { class: 'qua-ui-panel-title' }, options.title),
      options.subtitle ? h('p', { class: 'qua-ui-panel-subtitle' }, options.subtitle) : null,
    ]),
    h(QuaUiActionButton, {
      className: 'qua-ui-panel-close',
      label: 'Close',
      onAction: options.close,
    }),
  ])
}

function renderSaveSlotContent(slot: SaveSlotProjection, index: number): VNode[] {
  const filled = isFilledSaveSlot(slot)
  const metadata = slot.metadata || {}
  return [
    h('span', { class: 'qua-save-slot-index' }, String(index + 1).padStart(2, '0')),
    h('span', { class: 'qua-save-slot-preview' }, slot.screenshot
      ? h('img', { class: 'qua-save-slot-screenshot', src: slot.screenshot, alt: '' })
      : h('span', { class: 'qua-save-slot-empty-mark' }, filled ? 'Saved' : 'Empty')),
    h('span', { class: 'qua-save-slot-body' }, [
      h('span', { class: 'qua-save-slot-name' }, slot.name || metadata.sceneName || (filled ? 'Saved Game' : 'Empty Slot')),
      h('span', { class: 'qua-save-slot-meta' }, saveSlotMeta(slot)),
    ]),
  ]
}

function createSaveSlotGrid(config: SaveLoadOverlayConfig | undefined): SaveSlotProjection[] {
  const byId = new Map((config?.slots || []).map(slot => [slot.slotId, slot]))
  const count = Math.max(config?.slotCount || DEFAULT_SAVE_SLOT_COUNT, byId.size)
  const prefix = config?.slotPrefix || 'slot'
  const slots: SaveSlotProjection[] = []
  for (let index = 0; index < count; index += 1) {
    const fallbackId = `${prefix}-${index + 1}`
    const provided = config?.slots?.[index]
    const slotId = provided?.slotId || fallbackId
    slots.push(byId.get(slotId) || provided || { slotId })
  }
  return slots
}

function saveSlotMeta(slot: SaveSlotProjection): string {
  if (!isFilledSaveSlot(slot)) {
    return 'No save data'
  }
  const pieces = [
    formatTimestamp(slot.timestamp),
    formatPlaytime(slot.metadata?.playtime),
    slot.metadata?.stepId,
  ].filter(Boolean)
  return pieces.join(' / ') || 'Saved'
}

function isFilledSaveSlot(slot: SaveSlotProjection): boolean {
  return Boolean(slot.timestamp || slot.name || slot.screenshot || slot.metadata?.sceneName || slot.metadata?.stepId)
}

function formatTimestamp(timestamp: SaveSlotProjection['timestamp']): string | undefined {
  if (!timestamp) {
    return undefined
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toLocaleString()
}

function formatPlaytime(playtime: number | undefined): string | undefined {
  if (typeof playtime !== 'number' || !Number.isFinite(playtime) || playtime <= 0) {
    return undefined
  }
  const totalSeconds = Math.floor(playtime / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function audioStatus(audio: ReturnType<typeof useAudio>['value'] | undefined): string {
  if (!audio) {
    return 'No audio projection'
  }
  return audio.unlocked ? 'Unlocked' : 'Locked'
}

function audioDetail(audio: ReturnType<typeof useAudio>['value'] | undefined): string {
  if (!audio) {
    return 'Audio plugin is inactive'
  }
  const tracks = [
    audio.bgm ? `BGM ${audio.bgm.state}` : undefined,
    audio.voices.length > 0 ? `${audio.voices.length} voice` : undefined,
    audio.sfx.length > 0 ? `${audio.sfx.length} SFX` : undefined,
    audio.ambients.length > 0 ? `${audio.ambients.length} ambient` : undefined,
  ].filter(Boolean)
  return tracks.join(' / ') || 'No active tracks'
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

function isBuiltInOverlay(elementId: string, hasDedicatedSettingsRenderer: boolean): boolean {
  return elementId === 'menu'
    || elementId === 'saveLoad'
    || (elementId === 'settings' && !hasDedicatedSettingsRenderer)
}

function titleFromField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_:]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}
