import type { SaveSlotDataSource } from '@quajs/renderer-web/save-preview'
import type { ViewUiOverlayProjection, ViewUiSceneProjection } from '@quajs/render-core'
import type { PropType, VNode } from 'vue'
import type { QuaVueRendererPlugin } from '../core'
import { LogicToRenderEvents, onLogicToRender } from '@quajs/render-core'
import { WebSaveSlotPreviewCache } from '@quajs/renderer-web/save-preview'
import { computed, defineComponent, h, onBeforeUnmount, ref, watch } from 'vue'
import { useAudio, useFlowControl, useRendererActions, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'
import { dispatchVueRendererIntent } from '../shared/intent'

const BACKLOG_OPEN_REQUEST = 'backlog/open_request'
const DEFAULT_SAVE_SLOT_COUNT = 12
const SETTINGS_RENDERER_LAYER_ID = 'settings'
export const UI_TITLE_REQUEST_EVENT = 'ui/title_request'

type SaveLoadMode = 'save' | 'load'

type UiOverlaySkinConfig = Readonly<Record<string, unknown>> & {
  skinId?: string
  title?: string
  subtitle?: string
  description?: string
  scene?: ViewUiSceneProjection
}

type MenuOverlayConfig = UiOverlaySkinConfig & {
  showBacklog?: boolean
  showTitle?: boolean
  showFlowControls?: boolean
  replaceOnOpen?: boolean
  saveLoadSlotCount?: number
  saveLoadSlotPrefix?: string
  saveLoadShowQuickActions?: boolean
  titleActionLabel?: string
  titleConfirmElementId?: string
  titleConfirmTitle?: string
  titleConfirmSubtitle?: string
  titleConfirmDescription?: string
  titleConfirmEvent?: string
  titleConfirmPayload?: unknown
}

type ConfirmOverlayConfig = UiOverlaySkinConfig & {
  confirmLabel?: string
  cancelLabel?: string
  confirmEvent?: string
  confirmPayload?: unknown
  closeOnConfirm?: boolean
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
  timestamp?: Date | string | number
  revision?: number
  saveOpId?: string
  previewStatus?: 'none' | 'pending' | 'ready' | 'error'
  previewSrc?: string
  preview?: {
    previewId: string
    mimeType: string
    byteLength: number
    width?: number
    height?: number
    capturedAt: number
    hash: string
    policySummary?: Readonly<Record<string, unknown>>
  }
  metadata?: {
    sceneName?: string
    stepId?: string
    playtime?: number
    [key: string]: unknown
  }
}

interface SettingsAudioProjection {
  unlocked?: boolean
  bgm?: {
    state?: string
  }
  voices?: readonly unknown[]
  sfx?: readonly unknown[]
  ambients?: readonly unknown[]
}

export interface QuaUiOverlayProps {
  elementId?: string
  className?: string
}

export interface QuaStoryTreeNode {
  id: string
  chapter?: string
  title: string
  description?: string
  state?: 'locked' | 'available' | 'current' | 'complete'
  disabled?: boolean
  className?: string
}

export interface QuaStoryTreeNodeSlotProps {
  node: QuaStoryTreeNode
  index: number
  selectable: boolean
  select: () => void
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
    const renderer = useQuaRenderer()
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
          dispatchVueRendererIntent(renderer, async () => {
            await props.onAction?.()
          }, {
            phase: 'ui:action',
          })
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
    const renderer = useQuaRenderer()
    const actions = renderer.actions
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
          dispatchVueRendererIntent(renderer, () => props.mode === 'save'
            ? actions.requestSave(props.slot.slotId)
            : actions.requestLoad(props.slot.slotId), {
            phase: `save-load:${props.mode}`,
            metadata: { slotId: props.slot.slotId },
          })
        },
      }, renderSaveSlotContent(props.slot, props.index)),
    ])
  },
})

export const QuaStoryTree = defineComponent({
  name: 'QuaStoryTree',
  props: {
    nodes: {
      type: Array as PropType<readonly QuaStoryTreeNode[]>,
      default: () => [],
    },
    title: {
      type: String,
      default: 'Story Tree',
    },
    eyebrow: {
      type: String,
      default: 'Route Map',
    },
    subtitle: String,
    closeLabel: {
      type: String,
      default: 'Close',
    },
    showClose: {
      type: Boolean,
      default: true,
    },
    selectable: Boolean,
    className: {
      type: String,
      default: '',
    },
    panelClassName: {
      type: String,
      default: '',
    },
    headerClassName: {
      type: String,
      default: '',
    },
    nodesClassName: {
      type: String,
      default: '',
    },
    nodeClassName: {
      type: String,
      default: '',
    },
    closeButtonClassName: {
      type: String,
      default: '',
    },
  },
  emits: ['close', 'select'],
  setup(props, { emit, slots }) {
    return () => h('section', {
      'class': ['qua-story-tree', props.className],
      'data-qua-input-ignore': '',
    }, [
      h('div', { class: ['qua-story-tree__panel', props.panelClassName] }, [
        h('header', { class: ['qua-story-tree__header', props.headerClassName] }, [
          h('div', { class: 'qua-story-tree__heading' }, [
            h('p', { class: 'qua-story-tree__eyebrow' }, props.eyebrow),
            h('h2', { class: 'qua-story-tree__title' }, props.title),
            props.subtitle ? h('p', { class: 'qua-story-tree__subtitle' }, props.subtitle) : null,
          ]),
          props.showClose
            ? h('button', {
                'class': ['qua-story-tree__close', props.closeButtonClassName],
                'type': 'button',
                'onClick': (event: Event) => {
                  event.stopPropagation()
                  emit('close')
                },
              }, props.closeLabel)
            : null,
        ]),
        h('ol', { class: ['qua-story-tree__nodes', props.nodesClassName] }, props.nodes.map((node, index) => {
          const selectable = props.selectable && !node.disabled && node.state !== 'locked'
          const select = () => emit('select', node)
          const content = slots.node?.({ node, index, selectable, select }) || renderStoryTreeNode(node, index)
          return h('li', {
            'key': node.id,
            'class': [
              'qua-story-tree__node',
              node.state ? `is-${node.state}` : undefined,
              props.nodeClassName,
              node.className,
            ],
            'data-story-tree-node-id': node.id,
            'data-story-tree-node-state': node.state,
          }, selectable
            ? h('button', {
                'class': 'qua-story-tree__node-button',
                'type': 'button',
                'onClick': (event: Event) => {
                  event.stopPropagation()
                  select()
                },
              }, content)
            : h('span', { class: 'qua-story-tree__node-content' }, content))
        })),
      ]),
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
    className: {
      type: String,
      default: '',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed<MenuOverlayConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as MenuOverlayConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': ['qua-ui-overlay', props.className],
          'data-overlay': props.elementId,
          'data-qua-capture-role': 'overlay',
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
    className: {
      type: String,
      default: '',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const flowControl = useFlowControl()
    const config = computed<MenuOverlayConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as MenuOverlayConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    const openMenuTarget = async (elementId: string, targetConfig: Record<string, unknown>) => {
      await actions.requestUiOpen(elementId, targetConfig)
      if (config.value?.replaceOnOpen) {
        await actions.requestUiClose(props.elementId)
      }
    }
    return () => config.value
      ? h('div', {
          'class': ['qua-menu-overlay', props.className],
          'data-overlay': props.elementId,
          'data-qua-capture-role': 'overlay',
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
              onAction: () => openMenuTarget('saveLoad', createSaveLoadMenuConfig(config.value, props.elementId, 'save')),
            }),
            h(QuaUiActionButton, {
              className: 'qua-menu-action qua-menu-action--load',
              label: 'Load',
              onAction: () => openMenuTarget('saveLoad', createSaveLoadMenuConfig(config.value, props.elementId, 'load')),
            }),
            h(QuaUiActionButton, {
              className: 'qua-menu-action qua-menu-action--settings',
              label: 'Settings',
              onAction: () => openMenuTarget('settings', {
                source: props.elementId,
                ...(config.value?.scene ? { scene: createChildUiScene(config.value.scene, 'settings') } : {}),
              }),
            }),
            config.value.showBacklog === false
              ? null
              : h(QuaUiActionButton, {
                  className: 'qua-menu-action qua-menu-action--backlog',
                  label: 'Backlog',
                  onAction: () => actions.requestPluginEvent(BACKLOG_OPEN_REQUEST),
                }),
            config.value.showTitle === false
              ? null
              : h(QuaUiActionButton, {
                  className: 'qua-menu-action qua-menu-action--title',
                  label: config.value.titleActionLabel || 'Title',
                  onAction: () => openMenuTarget(
                    titleConfirmElementId(config.value),
                    createTitleConfirmMenuConfig(config.value, props.elementId),
                  ),
                }),
          ]),
          config.value.showFlowControls === false
            ? null
            : h('footer', { class: 'qua-menu-footer' }, [
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

export const QuaConfirmOverlay = defineComponent({
  name: 'QuaConfirmOverlay',
  props: {
    elementId: {
      type: String,
      default: 'confirm',
    },
    className: {
      type: String,
      default: '',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed<ConfirmOverlayConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as ConfirmOverlayConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    const confirm = async () => {
      if (config.value?.confirmEvent) {
        await actions.requestPluginEvent(config.value.confirmEvent, config.value.confirmPayload || { source: props.elementId })
      }
      if (config.value?.closeOnConfirm !== false) {
        await actions.requestUiClose(props.elementId)
      }
    }
    return () => config.value
      ? h('div', {
          'class': ['qua-confirm-overlay', props.className],
          'data-overlay': props.elementId,
          'data-qua-capture-role': 'overlay',
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
          confirm,
          cancel: () => actions.requestUiClose(props.elementId),
        }) || [
          renderPanelHeader({
            title: config.value.title || 'Confirm',
            subtitle: config.value.subtitle,
            close: () => actions.requestUiClose(props.elementId),
          }),
          config.value.description ? h('p', { class: 'qua-confirm-description' }, config.value.description) : null,
          h('footer', { class: 'qua-confirm-actions' }, [
            h(QuaUiActionButton, {
              className: 'qua-confirm-action qua-confirm-action--cancel',
              label: config.value.cancelLabel || 'Cancel',
              onAction: () => actions.requestUiClose(props.elementId),
            }),
            h(QuaUiActionButton, {
              className: 'qua-confirm-action qua-confirm-action--confirm',
              label: config.value.confirmLabel || 'Confirm',
              onAction: confirm,
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
    className: {
      type: String,
      default: '',
    },
  },
  setup(props, { slots }) {
    const { pipeline, saveSlots, view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed<SaveLoadOverlayConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as SaveLoadOverlayConfig | undefined)
    const mode = computed<SaveLoadMode>(() => config.value?.mode === 'load' ? 'load' : 'save')
    const slotsProjection = ref<SaveSlotProjection[]>(createSaveSlotGrid(config.value))
    const previewSources = ref<Record<string, string | undefined>>({})
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    let refreshVersion = 0
    let previewCache: WebSaveSlotPreviewCache | undefined
    let stopSlotUpdates: (() => void) | undefined

    const loadSlotGrid = async () => {
      const currentVersion = ++refreshVersion
      const listedSlots = saveSlots.value
        ? await saveSlots.value.listSlots().catch(() => [])
        : []
      if (currentVersion !== refreshVersion) {
        return
      }

      const nextSlots = createSaveSlotGrid(config.value, listedSlots as SaveSlotProjection[])
      slotsProjection.value = nextSlots
      if (!previewCache) {
        previewSources.value = {}
        return
      }

      const readySlotIds = nextSlots
        .filter(slot => slot.previewStatus === 'ready' && slot.preview)
        .map(slot => slot.slotId)
      let resolved: Record<string, string | undefined> = {}
      if (readySlotIds.length > 0) {
        try {
          resolved = await previewCache.resolveMany(readySlotIds)
        }
        catch {
          resolved = {}
        }
      }
      if (currentVersion !== refreshVersion) {
        return
      }

      previewSources.value = Object.fromEntries(nextSlots.map(slot => [slot.slotId, resolved[slot.slotId]]))
    }

    const bindSlotUpdates = (source: SaveSlotDataSource | undefined) => {
      stopSlotUpdates?.()
      stopSlotUpdates = onLogicToRender(pipeline.value, LogicToRenderEvents.SLOT_UPDATED, (payload) => {
        previewCache?.invalidate([payload.slotId])
        if (source) {
          void loadSlotGrid()
        }
      })
    }

    watch([config, saveSlots], ([, source], _previous, onCleanup) => {
      previewCache?.dispose()
      previewCache = source ? new WebSaveSlotPreviewCache(source, { format: 'bytes', ttlMs: 30_000 }) : undefined
      bindSlotUpdates(source)
      onCleanup(() => {
        previewCache?.dispose()
        previewCache = undefined
        stopSlotUpdates?.()
        stopSlotUpdates = undefined
      })
      void loadSlotGrid()
    }, { immediate: true })

    onBeforeUnmount(() => {
      previewCache?.dispose()
      previewCache = undefined
      stopSlotUpdates?.()
      stopSlotUpdates = undefined
    })

    return () => config.value
      ? h('div', {
          'class': ['qua-save-load-panel', props.className],
          'data-overlay': props.elementId,
          'data-qua-capture-role': 'overlay',
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
          previewSources: previewSources.value,
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
              key: `${slot.slotId}:${slot.revision || 0}:${slot.preview?.previewId || 'none'}`,
              index,
              mode: mode.value,
              slot: { ...slot, previewSrc: previewSources.value[slot.slotId] },
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
    className: {
      type: String,
      default: '',
    },
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const audio = useAudio<SettingsAudioProjection>()
    const actions = useRendererActions()
    const flowControl = useFlowControl()
    const config = computed<UiOverlaySkinConfig | undefined>(() => view.value.ui.overlays?.[props.elementId] as UiOverlaySkinConfig | undefined)
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    return () => config.value
      ? h('div', {
          'class': ['qua-settings-panel', props.className],
          'data-overlay': props.elementId,
          'data-qua-capture-role': 'overlay',
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
  props: {
    className: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const { view, rendererLayerIds } = useQuaRenderer()
    const overlays = computed(() => view.value.ui.overlays || {})
    const overlayIds = computed(() => Object.keys(overlays.value))
    const activeScene = computed(() => resolveActiveUiScene(overlays.value))
    const hasDedicatedSettingsRenderer = computed(() =>
      rendererLayerIds.value.includes(SETTINGS_RENDERER_LAYER_ID),
    )
    const renderedOverlayIds = computed(() => overlayIds.value.filter(elementId =>
      shouldRenderOverlayInGenericLayer(elementId, hasDedicatedSettingsRenderer.value),
    ))
    return () => renderedOverlayIds.value.length > 0
      ? h('div', {
          'class': [
            'qua-overlay-layer',
            activeScene.value ? 'qua-overlay-layer--ui-scene' : undefined,
            activeScene.value?.presentation === 'scene' ? 'qua-overlay-layer--scene' : undefined,
            activeScene.value?.presentation === 'overlay' ? 'qua-overlay-layer--overlay' : undefined,
            props.className,
          ],
          'data-qua-capture-role': 'overlay',
          'data-ui-scene-id': activeScene.value?.id,
          'data-ui-scene-presentation': activeScene.value?.presentation,
          'data-ui-scene-overlay-variant': activeScene.value?.overlay?.variant,
          'data-ui-scene-hide-hud': activeScene.value?.overlay?.hideHud ? 'true' : undefined,
          'data-ui-scene-hide-dialogue': activeScene.value?.overlay?.hideDialogue ? 'true' : undefined,
          'style': { pointerEvents: 'auto' },
          'onClick': (event: Event) => event.stopPropagation(),
        }, [
          renderedOverlayIds.value.includes('menu') ? h(QuaMenuOverlay) : null,
          renderedOverlayIds.value.includes('saveLoad') ? h(QuaSaveLoadPanel) : null,
          renderedOverlayIds.value.includes('confirm') ? h(QuaConfirmOverlay) : null,
          renderedOverlayIds.value.includes('titleConfirm') ? h(QuaConfirmOverlay, { elementId: 'titleConfirm' }) : null,
          renderedOverlayIds.value.includes('settings') ? h(QuaSettingsPanel) : null,
          ...renderedOverlayIds.value
            .filter(elementId => !isBuiltInOverlay(elementId))
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
      plane: 'screen',
    }],
  })
}

export const uiRendererPlugin = createUiRendererPlugin()

function renderStoryTreeNode(node: QuaStoryTreeNode, index: number): VNode[] {
  return [
    h('span', { class: 'qua-story-tree__chapter' }, node.chapter || String(index + 1).padStart(2, '0')),
    h('span', { class: 'qua-story-tree__body' }, [
      h('strong', { class: 'qua-story-tree__node-title' }, node.title),
      node.description ? h('small', { class: 'qua-story-tree__node-description' }, node.description) : null,
    ]),
  ]
}

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
    h('span', { class: 'qua-save-slot-preview' }, slot.previewSrc
      ? h('img', { class: 'qua-save-slot-preview-image', src: slot.previewSrc, alt: '' })
      : h('span', { class: 'qua-save-slot-empty-mark' }, previewStatusLabel(slot, filled))),
    h('span', { class: 'qua-save-slot-body' }, [
      h('span', { class: 'qua-save-slot-name' }, slot.name || metadata.sceneName || (filled ? 'Saved Game' : 'Empty Slot')),
      h('span', { class: 'qua-save-slot-meta' }, saveSlotMeta(slot)),
    ]),
  ]
}

function createSaveLoadMenuConfig(config: MenuOverlayConfig | undefined, source: string, mode: SaveLoadMode): Record<string, unknown> {
  return {
    mode,
    source,
    ...(typeof config?.saveLoadSlotCount === 'number' ? { slotCount: config.saveLoadSlotCount } : {}),
    ...(typeof config?.saveLoadSlotPrefix === 'string' ? { slotPrefix: config.saveLoadSlotPrefix } : {}),
    ...(config?.saveLoadShowQuickActions !== undefined ? { showQuickActions: config.saveLoadShowQuickActions } : {}),
    ...(config?.scene ? { scene: createChildUiScene(config.scene, `saveLoad:${mode}`) } : {}),
  }
}

function createChildUiScene(parent: ViewUiSceneProjection, childId: string): ViewUiSceneProjection {
  return {
    ...parent,
    id: `${parent.id}/${childId}`,
    overlay: parent.overlay ? { ...parent.overlay } : undefined,
  }
}

function titleConfirmElementId(config: MenuOverlayConfig | undefined): string {
  return config?.titleConfirmElementId || 'titleConfirm'
}

function createTitleConfirmMenuConfig(config: MenuOverlayConfig | undefined, source: string): Record<string, unknown> {
  return {
    source,
    title: config?.titleConfirmTitle || 'Return to Title',
    subtitle: config?.titleConfirmSubtitle || 'Current progress may be lost.',
    description: config?.titleConfirmDescription || 'Save before returning to the title menu.',
    confirmLabel: config?.titleActionLabel || 'Title',
    cancelLabel: 'Cancel',
    confirmEvent: config?.titleConfirmEvent || UI_TITLE_REQUEST_EVENT,
    confirmPayload: config?.titleConfirmPayload || { source },
  }
}

function resolveActiveUiScene(overlays: Readonly<Record<string, ViewUiOverlayProjection>>): ViewUiSceneProjection | undefined {
  const scenes = Object.values(overlays)
    .map(overlay => overlay.scene)
    .filter((scene): scene is ViewUiSceneProjection => Boolean(scene?.id))
  return scenes.find(scene => scene.presentation === 'scene') || scenes[0]
}

function createSaveSlotGrid(config: SaveLoadOverlayConfig | undefined, listedSlots: readonly SaveSlotProjection[] = []): SaveSlotProjection[] {
  const byId = new Map([...listedSlots, ...(config?.slots || [])].map(slot => [slot.slotId, slot]))
  const count = Math.max(config?.slotCount || DEFAULT_SAVE_SLOT_COUNT, config?.slots?.length || 0)
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
  return Boolean(
    slot.timestamp
    || slot.name
    || slot.preview
    || (slot.previewStatus && slot.previewStatus !== 'none')
    || slot.metadata?.sceneName
    || slot.metadata?.stepId,
  )
}

function previewStatusLabel(slot: SaveSlotProjection, filled: boolean): string {
  if (slot.previewStatus === 'pending') {
    return 'Pending'
  }
  if (slot.previewStatus === 'error') {
    return 'Retry'
  }
  return filled ? 'Saved' : 'Empty'
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

function audioStatus(audio: SettingsAudioProjection | undefined): string {
  if (!audio) {
    return 'No audio projection'
  }
  return audio.unlocked ? 'Unlocked' : 'Locked'
}

function audioDetail(audio: SettingsAudioProjection | undefined): string {
  if (!audio) {
    return 'Audio plugin is inactive'
  }
  const tracks = [
    audio.bgm ? `BGM ${audio.bgm.state}` : undefined,
    audio.voices && audio.voices.length > 0 ? `${audio.voices.length} voice` : undefined,
    audio.sfx && audio.sfx.length > 0 ? `${audio.sfx.length} SFX` : undefined,
    audio.ambients && audio.ambients.length > 0 ? `${audio.ambients.length} ambient` : undefined,
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

function isBuiltInOverlay(elementId: string): boolean {
  return elementId === 'menu'
    || elementId === 'saveLoad'
    || elementId === 'confirm'
    || elementId === 'titleConfirm'
    || elementId === 'settings'
}

function shouldRenderOverlayInGenericLayer(elementId: string, hasDedicatedSettingsRenderer: boolean): boolean {
  return elementId !== 'settings' || !hasDedicatedSettingsRenderer
}

function titleFromField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_:]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}
