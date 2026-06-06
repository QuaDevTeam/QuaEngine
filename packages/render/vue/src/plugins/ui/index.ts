import type { ResolveOverlayStackPlacementOptions, ViewUiOverlayProjection, ViewUiOverlaySurfaceProjection, ViewUiSceneProjection } from '@quajs/render-core'
import type { SaveSlotDataSource } from '@quajs/renderer-web/save-preview'
import type { Component, PropType, VNode } from 'vue'
import type { QuaVueRendererPlugin } from '../core'
import {
  compareResolvedOverlayStackPlacement,
  DEFAULT_UI_OVERLAY_Z_INDEXES,
  getUiOverlaySurfaceProjection,
  LogicToRenderEvents,
  onLogicToRender,
  resolveActiveUiSceneProjection,
  resolveUiOverlayStackPlacement,
  uiOverlayIsInteractive,
  uiOverlayIsRenderOnly,
} from '@quajs/render-core'
import { motionProjectionVars, projectUiOverlay } from '@quajs/renderer-web'
import { uiSceneDataAttributes } from '@quajs/renderer-web/plugins/shared'
import { WebSaveSlotPreviewCache } from '@quajs/renderer-web/save-preview'
import { computed, defineComponent, h, onBeforeUnmount, ref, watch } from 'vue'
import { useAnimationClock, useAudio, useFlowControl, useRendererActions, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'
import { dispatchVueRendererIntent } from '../shared/intent'
import { createUiOverlayStackBinding } from '../shared/overlay'

const BACKLOG_OPEN_REQUEST = 'backlog/open_request'
const DEFAULT_SAVE_SLOT_COUNT = 12
const SETTINGS_RENDERER_LAYER_ID = 'settings'
const UI_OVERLAY_EXIT_MS = 180
export const UI_TITLE_REQUEST_EVENT = 'ui/title_request'

type SaveLoadMode = 'save' | 'load'

type UiOverlaySkinConfig = Readonly<Record<string, unknown>> & {
  skinId?: string
  title?: string
  subtitle?: string
  description?: string
  showHeaderTitle?: boolean
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
  saveLoadOverlayStack?: string
  saveLoadStackPriority?: number
  saveLoadZIndex?: number
  settingsOverlayStack?: string
  settingsStackPriority?: number
  settingsZIndex?: number
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
    chapterId?: string
    routeId?: string
    nodeId?: string
    lineId?: string
    playtime?: number
    [key: string]: unknown
  }
}

interface RenderedOverlayPresence {
  elementId: string
  overlay: ViewUiOverlayProjection
  phase: 'enter' | 'exit'
  removeTimer?: ReturnType<typeof setTimeout>
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
  overlay?: ViewUiOverlayProjection
}

export interface QuaRenderOnlyOverlayProps extends QuaUiOverlayProps {
  renderOnlySurfaces?: UiVueRenderOnlySurfaceRegistry
}

export type UiVueRenderOnlySurfaceComponent = Component
export type UiVueRenderOnlySurfaceRegistry = Readonly<Record<string, UiVueRenderOnlySurfaceComponent>>

export interface UiVueRendererPluginOptions {
  handledElementIds?: readonly string[]
  renderOnlySurfaces?: UiVueRenderOnlySurfaceRegistry
}

export interface QuaStoryTreeNode {
  id: string
  chapter?: string
  title: string
  description?: string
  state?: 'locked' | 'available' | 'current' | 'complete'
  disabled?: boolean
  entryLocked?: boolean
  spoilerHidden?: boolean
  hidden?: boolean
  lockedLabel?: string
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
    ariaLabel: String,
    title: String,
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
      'aria-label': props.ariaLabel || props.label,
      'title': props.title || props.ariaLabel || props.label,
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
    }, h('span', { class: 'qua-ui-action-label' }, props.label))
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
                class: ['qua-story-tree__close', props.closeButtonClassName],
                type: 'button',
                onClick: (event: Event) => {
                  event.stopPropagation()
                  emit('close')
                },
              }, props.closeLabel)
            : null,
        ]),
        h('ol', { class: ['qua-story-tree__nodes', props.nodesClassName] }, props.nodes.filter(node => !node.hidden).map((node, index) => {
          const entryLocked = node.entryLocked ?? Boolean(node.disabled || node.state === 'locked')
          const spoilerHidden = node.spoilerHidden ?? Boolean(node.state === 'locked')
          const selectable = props.selectable && !node.disabled && !entryLocked
          const select = () => emit('select', node)
          const content = slots.node?.({ node, index, selectable, select }) || renderStoryTreeNode(node, index)
          return h('li', {
            'key': node.id,
            'class': [
              'qua-story-tree__node',
              node.state ? `is-${node.state}` : undefined,
              entryLocked ? 'is-entry-locked' : undefined,
              spoilerHidden ? 'is-spoiler-hidden' : undefined,
              props.nodeClassName,
              node.className,
            ],
            'data-story-tree-node-id': node.id,
            'data-story-tree-node-state': node.state,
            'data-story-tree-node-entry-locked': entryLocked ? 'true' : 'false',
            'data-story-tree-node-spoiler-hidden': spoilerHidden ? 'true' : 'false',
          }, selectable
            ? h('button', {
                class: 'qua-story-tree__node-button',
                type: 'button',
                onClick: (event: Event) => {
                  event.stopPropagation()
                  select()
                },
              }, content)
            : h('span', {
                'class': 'qua-story-tree__node-content',
                'aria-disabled': entryLocked ? 'true' : undefined,
              }, content))
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
    overlay: Object as PropType<ViewUiOverlayProjection>,
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed<MenuOverlayConfig | undefined>(() =>
      (props.overlay || view.value.ui.overlays?.[props.elementId]) as MenuOverlayConfig | undefined,
    )
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    const overlayStack = computed(() => createUiOverlayStackBinding(config.value, defaultUiOverlayPlacement(props.elementId)))
    return () => config.value
      ? h('div', {
          'class': ['qua-ui-overlay', props.className],
          'data-overlay': props.elementId,
          'data-overlay-presence': props.overlay && !view.value.ui.overlays?.[props.elementId] ? 'exit' : 'enter',
          'data-qua-capture-role': 'overlay',
          ...overlayStack.value.attrs,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': { ...skin.skinStyle.value, ...overlayStack.value.style },
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          actions,
        }) || renderGenericOverlayContent(props.elementId, config.value, actions))
      : null
  },
})

export const QuaRenderOnlyOverlay = defineComponent({
  name: 'QuaRenderOnlyOverlay',
  props: {
    elementId: {
      type: String,
      default: 'overlay',
    },
    className: {
      type: String,
      default: '',
    },
    overlay: Object as PropType<ViewUiOverlayProjection>,
    renderOnlySurfaces: Object as PropType<UiVueRenderOnlySurfaceRegistry>,
  },
  setup(props) {
    const renderer = useQuaRenderer()
    const { view } = renderer
    const actions = useRendererActions()
    const animationNow = useAnimationClock()
    const warnedMissingSurfaces = new Set<string>()
    const config = computed<ViewUiOverlayProjection | undefined>(() =>
      (props.overlay || view.value.ui.overlays?.[props.elementId]) as ViewUiOverlayProjection | undefined,
    )
    const projected = computed(() => config.value
      ? projectUiOverlay(config.value, props.elementId, view.value.animations, animationNow.value)
      : undefined)
    const surface = computed(() => getUiOverlaySurfaceProjection(config.value))
    const surfaceKey = computed(() => surface.value?.key.trim())
    const surfaceComponent = computed(() => surfaceKey.value
      ? props.renderOnlySurfaces?.[surfaceKey.value]
      : undefined)
    const overlayStack = computed(() => createUiOverlayStackBinding(config.value, defaultUiOverlayPlacement(props.elementId)))

    watch([config, surfaceKey, surfaceComponent], () => {
      if (!config.value || surfaceComponent.value) {
        return
      }
      const warningKey = `${props.elementId}:${surfaceKey.value || '<missing>'}`
      if (warnedMissingSurfaces.has(warningKey)) {
        return
      }
      warnedMissingSurfaces.add(warningKey)
      void renderer.web.reportError(new Error('Render-only overlay surface renderer is not registered.'), {
        message: surfaceKey.value
          ? `Render-only overlay surface "${surfaceKey.value}" is not registered.`
          : `Render-only overlay "${props.elementId}" is missing surface.key.`,
        phase: 'ui-render-only-surface:resolve',
        pluginName: '@quajs/renderer-vue/ui',
        severity: 'warning',
        recoverable: true,
        metadata: { elementId: props.elementId, surfaceKey: surfaceKey.value },
      })
    }, { immediate: true })

    return () => {
      if (!config.value || !projected.value) {
        return null
      }
      const component = surfaceComponent.value
      const rootProps = {
        'class': ['qua-ui-overlay', 'qua-ui-overlay--render-only', props.className],
        'data-overlay': props.elementId,
        'data-overlay-render-mode': 'render-only',
        'data-overlay-surface-key': surfaceKey.value,
        'data-qua-capture-role': 'overlay',
        ...overlayStack.value.attrs,
        'style': {
          position: 'absolute',
          inset: '0',
          ...overlayStack.value.style,
          ...motionProjectionVars(projected.value, '--qua-ui'),
          pointerEvents: uiOverlayIsInteractive(config.value) ? 'auto' : 'none',
        },
      }
      return h('div', rootProps, component
        ? h(component, {
            elementId: props.elementId,
            overlay: config.value,
            surface: surface.value as Readonly<ViewUiOverlaySurfaceProjection>,
            projected: projected.value,
            view: view.value,
            actions,
          })
        : undefined)
    }
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
    overlay: Object as PropType<ViewUiOverlayProjection>,
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const flowControl = useFlowControl()
    const config = computed<MenuOverlayConfig | undefined>(() =>
      (props.overlay || view.value.ui.overlays?.[props.elementId]) as MenuOverlayConfig | undefined,
    )
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    const overlayStack = computed(() => createUiOverlayStackBinding(config.value, defaultUiOverlayPlacement(props.elementId)))
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
          'data-overlay-presence': props.overlay && !view.value.ui.overlays?.[props.elementId] ? 'exit' : 'enter',
          'data-qua-capture-role': 'overlay',
          ...overlayStack.value.attrs,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': { ...skin.skinStyle.value, ...overlayStack.value.style },
        }, slots.default?.({
          view: view.value,
          ui: view.value.ui,
          overlay: config.value,
          actions,
        }) || [
          renderPanelHeader({
            title: config.value.title || 'Menu',
            subtitle: config.value.subtitle || view.value.dialogue.characterName || undefined,
            showHeading: config.value.showHeaderTitle !== false,
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
              onAction: () => {
                const placement = createSettingsMenuPlacement(config.value)
                return openMenuTarget('settings', {
                  source: props.elementId,
                  ...placement,
                  ...(config.value?.scene ? { scene: createChildUiScene(config.value.scene, 'settings', placement) } : {}),
                })
              },
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
    overlay: Object as PropType<ViewUiOverlayProjection>,
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed<ConfirmOverlayConfig | undefined>(() =>
      (props.overlay || view.value.ui.overlays?.[props.elementId]) as ConfirmOverlayConfig | undefined,
    )
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    const overlayStack = computed(() => createUiOverlayStackBinding(config.value, defaultUiOverlayPlacement(props.elementId)))
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
          'data-overlay-presence': props.overlay && !view.value.ui.overlays?.[props.elementId] ? 'exit' : 'enter',
          'data-qua-capture-role': 'overlay',
          ...overlayStack.value.attrs,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': { ...skin.skinStyle.value, ...overlayStack.value.style },
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
            showHeading: config.value.showHeaderTitle !== false,
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
    overlay: Object as PropType<ViewUiOverlayProjection>,
  },
  setup(props, { slots }) {
    const { pipeline, saveSlots, view } = useQuaRenderer()
    const actions = useRendererActions()
    const config = computed<SaveLoadOverlayConfig | undefined>(() =>
      (props.overlay || view.value.ui.overlays?.[props.elementId]) as SaveLoadOverlayConfig | undefined,
    )
    const mode = computed<SaveLoadMode>(() => config.value?.mode === 'load' ? 'load' : 'save')
    const slotsProjection = ref<SaveSlotProjection[]>(createSaveSlotGrid(config.value))
    const previewSources = ref<Record<string, string | undefined>>({})
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    const overlayStack = computed(() => createUiOverlayStackBinding(config.value, defaultUiOverlayPlacement(props.elementId)))
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
          'data-overlay-presence': props.overlay && !view.value.ui.overlays?.[props.elementId] ? 'exit' : 'enter',
          'data-qua-capture-role': 'overlay',
          ...overlayStack.value.attrs,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'data-save-load-mode': mode.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': { ...skin.skinStyle.value, ...overlayStack.value.style },
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
            showHeading: config.value.showHeaderTitle !== false,
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
    overlay: Object as PropType<ViewUiOverlayProjection>,
  },
  setup(props, { slots }) {
    const { view } = useQuaRenderer()
    const audio = useAudio<SettingsAudioProjection>()
    const actions = useRendererActions()
    const flowControl = useFlowControl()
    const config = computed<UiOverlaySkinConfig | undefined>(() =>
      (props.overlay || view.value.ui.overlays?.[props.elementId]) as UiOverlaySkinConfig | undefined,
    )
    const skin = useUiControlSkin({
      kind: 'panel',
      skinId: () => config.value?.skinId,
    })
    const overlayStack = computed(() => createUiOverlayStackBinding(config.value, defaultUiOverlayPlacement(props.elementId)))
    return () => config.value
      ? h('div', {
          'class': ['qua-settings-panel', props.className],
          'data-overlay': props.elementId,
          'data-overlay-presence': props.overlay && !view.value.ui.overlays?.[props.elementId] ? 'exit' : 'enter',
          'data-qua-capture-role': 'overlay',
          ...overlayStack.value.attrs,
          'data-skin-kind': 'panel',
          'data-skin-reference': skin.skinReference.value || undefined,
          'data-skin-state': skin.skinState.value,
          'onClick': (event: Event) => event.stopPropagation(),
          'style': { ...skin.skinStyle.value, ...overlayStack.value.style },
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
            showHeading: config.value.showHeaderTitle !== false,
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
    handledElementIds: {
      type: Array as PropType<readonly string[]>,
      default: () => [],
    },
    renderOnlySurfaces: Object as PropType<UiVueRenderOnlySurfaceRegistry>,
  },
  setup(props) {
    const { view, rendererLayerIds } = useQuaRenderer()
    const overlays = computed(() => view.value.ui.overlays || {})
    const renderedOverlays = ref<RenderedOverlayPresence[]>([])
    const sortedRenderedOverlays = computed(() => [...renderedOverlays.value].sort(compareOverlayPresence))
    const activeScene = computed(() => resolveActiveUiSceneProjection(Object.fromEntries(
      sortedRenderedOverlays.value.map(item => [item.elementId, item.overlay]),
    ), defaultUiOverlayPlacement))
    const topOverlay = computed(() => sortedRenderedOverlays.value[sortedRenderedOverlays.value.length - 1])
    const overlayStack = computed(() => createUiOverlayStackBinding(
      topOverlay.value?.overlay,
      defaultUiOverlayPlacement(topOverlay.value?.elementId),
    ))
    const hasDedicatedSettingsRenderer = computed(() =>
      rendererLayerIds.value.includes(SETTINGS_RENDERER_LAYER_ID),
    )
    const handledElementIds = computed(() => new Set(props.handledElementIds || []))

    watch([overlays, hasDedicatedSettingsRenderer, handledElementIds], ([nextOverlays, dedicatedSettings, handled]) => {
      const nextIds = Object.keys(nextOverlays)
        .filter(elementId => shouldRenderOverlayInGenericLayer(elementId, dedicatedSettings, handled))
      const nextIdSet = new Set(nextIds)
      const byId = new Map(renderedOverlays.value.map(item => [item.elementId, item]))

      for (const elementId of nextIds) {
        const existing = byId.get(elementId)
        if (existing) {
          if (existing.removeTimer) {
            clearTimeout(existing.removeTimer)
          }
          existing.overlay = nextOverlays[elementId]
          existing.phase = 'enter'
          existing.removeTimer = undefined
        }
        else {
          renderedOverlays.value.push({
            elementId,
            overlay: nextOverlays[elementId],
            phase: 'enter',
          })
        }
      }

      for (const item of renderedOverlays.value) {
        if (nextIdSet.has(item.elementId) || item.phase === 'exit') {
          continue
        }
        item.phase = 'exit'
        item.removeTimer = setTimeout(() => {
          renderedOverlays.value = renderedOverlays.value.filter(current => current !== item)
        }, UI_OVERLAY_EXIT_MS)
      }

      renderedOverlays.value = [...renderedOverlays.value]
    }, { immediate: true })

    onBeforeUnmount(() => {
      for (const item of renderedOverlays.value) {
        if (item.removeTimer) {
          clearTimeout(item.removeTimer)
        }
      }
    })

    return () => renderedOverlays.value.length > 0
      ? h('div', {
          'class': [
            'qua-overlay-layer',
            activeScene.value ? 'qua-overlay-layer--ui-scene' : undefined,
            activeScene.value?.presentation === 'scene' ? 'qua-overlay-layer--scene' : undefined,
            activeScene.value?.presentation === 'overlay' ? 'qua-overlay-layer--overlay' : undefined,
            props.className,
          ],
          'data-qua-capture-role': 'overlay',
          ...overlayStack.value.attrs,
          ...uiSceneDataAttributes(activeScene.value),
          'style': {
            pointerEvents: sortedRenderedOverlays.value.some(item => uiOverlayIsInteractive(item.overlay)) ? 'auto' : 'none',
            ...overlayStack.value.style,
          },
          'onClick': (event: Event) => event.stopPropagation(),
        }, [
          ...sortedRenderedOverlays.value.map(item => renderOverlayPresence(item, props.renderOnlySurfaces)),
        ])
      : null
  },
})

export function createUiRendererPlugin(options: UiVueRendererPluginOptions = {}): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/ui',
    setup() {},
    layers: [{
      id: 'overlay',
      slot: 'overlay',
      component: QuaOverlayLayer,
      order: 90,
      plane: 'screen',
      props: {
        handledElementIds: options.handledElementIds || [],
        renderOnlySurfaces: options.renderOnlySurfaces,
      },
    }],
  })
}

export const uiRendererPlugin = createUiRendererPlugin()

function renderStoryTreeNode(node: QuaStoryTreeNode, index: number): VNode[] {
  return [
    h('span', { class: 'qua-story-tree__chapter' }, node.chapter || String(index + 1).padStart(2, '0')),
    h('span', { class: 'qua-story-tree__body' }, [
      h('strong', { class: 'qua-story-tree__node-title' }, node.title),
      node.spoilerHidden
        ? h('span', { class: 'qua-story-tree__node-lock' }, node.lockedLabel || 'LOCKED')
        : null,
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
      showHeading: config.showHeaderTitle !== false,
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
  showHeading?: boolean
  close: () => void | Promise<void>
}): VNode {
  const showHeading = options.showHeading !== false
  return h('header', {
    class: ['qua-ui-panel-header', showHeading ? undefined : 'is-heading-hidden'],
  }, [
    showHeading
      ? h('div', { class: 'qua-ui-panel-heading' }, [
          h('h2', { class: 'qua-ui-panel-title' }, options.title),
          options.subtitle ? h('p', { class: 'qua-ui-panel-subtitle' }, options.subtitle) : null,
        ])
      : null,
    h(QuaUiActionButton, {
      className: 'qua-ui-panel-close',
      label: 'Close',
      ariaLabel: 'Close panel',
      onAction: options.close,
    }),
  ])
}

function renderSaveSlotContent(slot: SaveSlotProjection, index: number): VNode[] {
  const filled = isFilledSaveSlot(slot)
  return [
    h('span', { class: 'qua-save-slot-index' }, String(index + 1).padStart(2, '0')),
    h('span', { class: 'qua-save-slot-preview' }, slot.previewSrc
      ? h('img', { class: 'qua-save-slot-preview-image', src: slot.previewSrc, alt: '' })
      : h('span', { class: 'qua-save-slot-empty-mark' }, previewStatusLabel(slot, filled))),
    h('span', { class: 'qua-save-slot-body' }, [
      h('span', { class: 'qua-save-slot-name' }, saveSlotDisplayName(slot, index)),
      h('span', { class: 'qua-save-slot-meta' }, saveSlotMeta(slot)),
    ]),
  ]
}

function renderOverlayPresence(
  item: RenderedOverlayPresence,
  renderOnlySurfaces: UiVueRenderOnlySurfaceRegistry | undefined,
): VNode {
  const props = {
    key: `${item.elementId}:${item.phase}`,
    elementId: item.elementId,
    overlay: item.overlay,
  }
  if (uiOverlayIsRenderOnly(item.overlay)) {
    return h(QuaRenderOnlyOverlay, {
      ...props,
      renderOnlySurfaces,
    })
  }
  if (item.elementId === 'menu') {
    return h(QuaMenuOverlay, props)
  }
  if (item.elementId === 'saveLoad') {
    return h(QuaSaveLoadPanel, props)
  }
  if (item.elementId === 'confirm') {
    return h(QuaConfirmOverlay, props)
  }
  if (item.elementId === 'titleConfirm') {
    return h(QuaConfirmOverlay, props)
  }
  if (item.elementId === 'gameOver') {
    return h(QuaConfirmOverlay, props)
  }
  if (item.elementId === 'settings') {
    return h(QuaSettingsPanel, props)
  }
  return h(QuaUiOverlay, props)
}

function createSaveLoadMenuConfig(config: MenuOverlayConfig | undefined, source: string, mode: SaveLoadMode): Record<string, unknown> {
  const placement = createSaveLoadMenuPlacement(config)
  return {
    mode,
    source,
    ...placement,
    ...(typeof config?.saveLoadSlotCount === 'number' ? { slotCount: config.saveLoadSlotCount } : {}),
    ...(typeof config?.saveLoadSlotPrefix === 'string' ? { slotPrefix: config.saveLoadSlotPrefix } : {}),
    ...(config?.saveLoadShowQuickActions !== undefined ? { showQuickActions: config.saveLoadShowQuickActions } : {}),
    ...(config?.showHeaderTitle === false ? { showHeaderTitle: false } : {}),
    ...(config?.scene ? { scene: createChildUiScene(config.scene, `saveLoad:${mode}`, placement) } : {}),
  }
}

function createChildUiScene(parent: ViewUiSceneProjection, childId: string, placement: OverlayPlacementPatch = {}): ViewUiSceneProjection {
  const overlay = parent.overlay || hasOverlayPlacement(placement)
    ? {
        ...(parent.overlay || {}),
        ...placement,
      }
    : undefined
  return {
    ...parent,
    id: `${parent.id}/${childId}`,
    overlay,
  }
}

type OverlayPlacementPatch = Pick<ViewUiOverlayProjection, 'overlayStack' | 'stackPriority' | 'zIndex'>

function createSaveLoadMenuPlacement(config: MenuOverlayConfig | undefined): OverlayPlacementPatch {
  return compactOverlayPlacement({
    overlayStack: config?.saveLoadOverlayStack,
    stackPriority: config?.saveLoadStackPriority,
    zIndex: config?.saveLoadZIndex,
  })
}

function createSettingsMenuPlacement(config: MenuOverlayConfig | undefined): OverlayPlacementPatch {
  return compactOverlayPlacement({
    overlayStack: config?.settingsOverlayStack,
    stackPriority: config?.settingsStackPriority,
    zIndex: config?.settingsZIndex,
  })
}

function compactOverlayPlacement(placement: OverlayPlacementPatch): OverlayPlacementPatch {
  return Object.fromEntries(
    Object.entries(placement).filter((entry): entry is [keyof OverlayPlacementPatch, string | number] => entry[1] !== undefined),
  ) as OverlayPlacementPatch
}

function hasOverlayPlacement(placement: OverlayPlacementPatch): boolean {
  return placement.overlayStack !== undefined || placement.stackPriority !== undefined || placement.zIndex !== undefined
}

function titleConfirmElementId(config: MenuOverlayConfig | undefined): string {
  return config?.titleConfirmElementId || 'titleConfirm'
}

function createTitleConfirmMenuConfig(config: MenuOverlayConfig | undefined, source: string): Record<string, unknown> {
  const placement: OverlayPlacementPatch = { overlayStack: 'modal' }
  return {
    source,
    ...placement,
    title: config?.titleConfirmTitle || 'Return to Title',
    subtitle: config?.titleConfirmSubtitle || 'Current progress may be lost.',
    description: config?.titleConfirmDescription || 'Save before returning to the title menu.',
    confirmLabel: config?.titleActionLabel || 'Title',
    cancelLabel: 'Cancel',
    confirmEvent: config?.titleConfirmEvent || UI_TITLE_REQUEST_EVENT,
    confirmPayload: config?.titleConfirmPayload || { source },
    ...(config?.scene ? { scene: createChildUiScene(config.scene, 'titleConfirm', placement) } : {}),
  }
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
    saveSlotProgressLabel(slot),
  ].filter(Boolean)
  return pieces.join(' / ') || 'Saved'
}

function saveSlotDisplayName(slot: SaveSlotProjection, index: number): string {
  if (!isFilledSaveSlot(slot)) {
    return `Empty Slot ${String(index + 1).padStart(2, '0')}`
  }
  const storedName = readableStoredSlotName(slot.name)
  if (storedName) {
    return storedName
  }
  const metadata = slot.metadata || {}
  const chapter = readableSlotLabel(metadata.chapterId)
  const scene = readableSlotLabel(metadata.sceneName)
  const route = readableSlotLabel(metadata.routeId)
  const pieces = [
    chapter ? `Chapter ${chapter}` : undefined,
    scene,
    route && route !== scene ? route : undefined,
  ].filter(Boolean)
  return pieces.join(' · ') || `Save ${String(index + 1).padStart(2, '0')}`
}

function saveSlotProgressLabel(slot: SaveSlotProjection): string | undefined {
  const metadata = slot.metadata || {}
  const line = readableSlotLabel(metadata.lineId)
  const node = readableSlotLabel(metadata.nodeId)
  const step = readableSlotLabel(metadata.stepId)
  return line || node || step
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

function readableSlotLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  if (!normalized || isInternalSlotLabel(normalized)) {
    return undefined
  }
  return normalized
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_:/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function readableStoredSlotName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  if (!normalized || isInternalSlotLabel(normalized)) {
    return undefined
  }
  return normalized
}

function isInternalSlotLabel(value: string): boolean {
  return value.startsWith('@quajs/')
    || value.includes('/ui-overlay-host')
    || value.includes(':ui-overlay-host')
    || /^slot-\d+$/i.test(value)
    || value === 'quicksave'
    || value === 'autosave'
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

function shouldRenderOverlayInGenericLayer(
  elementId: string,
  hasDedicatedSettingsRenderer: boolean,
  handledElementIds: ReadonlySet<string>,
): boolean {
  return !handledElementIds.has(elementId) && (elementId !== 'settings' || !hasDedicatedSettingsRenderer)
}

function compareOverlayPresence(left: RenderedOverlayPresence, right: RenderedOverlayPresence): number {
  return compareResolvedOverlayStackPlacement(
    resolveUiOverlayStackPlacement(left.overlay, defaultUiOverlayPlacement(left.elementId)),
    resolveUiOverlayStackPlacement(right.overlay, defaultUiOverlayPlacement(right.elementId)),
    left.elementId,
    right.elementId,
  )
}

function defaultUiOverlayPlacement(elementId?: string): ResolveOverlayStackPlacementOptions {
  if (elementId === 'confirm' || elementId === 'titleConfirm') {
    return { overlayStack: 'modal', zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.ui }
  }
  return { overlayStack: 'overlay', zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.ui }
}

function titleFromField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_:]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}
