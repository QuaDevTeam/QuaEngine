import type {
  AchievementGroupProjectionItem,
  AchievementNotificationProjection,
  AchievementProjection,
  AchievementProjectionItem,
} from '@quajs/plugin-achievement/contracts'
import type { QuaViewProjection } from '@quajs/render-core'
import type { RendererActions, WebAssetTargetPackageId } from '@quajs/renderer-web'
import type { AchievementProjectionModel } from '@quajs/renderer-web/plugins/achievement'
import type { Component, PropType, VNode } from 'vue'
import type { QuaVueRendererPlugin } from '../core'
import {
  ACHIEVEMENT_PLUGIN_ID,
  AchievementRenderToLogicEvents,
} from '@quajs/plugin-achievement/contracts'
import { compareResolvedOverlayStackPlacement, DEFAULT_UI_OVERLAY_Z_INDEXES, resolveOverlayStackPlacement } from '@quajs/render-core'
import { runtimePackageCandidatesFromMetadata } from '@quajs/renderer-web'
import {
  createAchievementProjectionModel,
} from '@quajs/renderer-web/plugins/achievement'
import { computed, defineComponent, h, onBeforeUnmount, watch } from 'vue'
import { useAssetUrl, usePluginProjection, useRendererActions, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'
import { dispatchVueRendererIntent } from '../shared/intent'
import { createOverlayStackBinding } from '../shared/overlay'

type AchievementAssetRef = NonNullable<AchievementProjectionItem['icon']>
let QuaAchievementCard: Component

function runtimePackageCandidatesFromAchievementAsset(
  asset: { runtimePackageId?: string, metadata?: Readonly<Record<string, unknown>> } | undefined,
): WebAssetTargetPackageId | undefined {
  if (!asset) {
    return undefined
  }
  return runtimePackageCandidatesFromMetadata({
    ...(asset.metadata || {}),
    ...(asset.runtimePackageId ? { contentPackageId: asset.runtimePackageId } : {}),
  })
}

export interface AchievementRendererPluginOptions {
  elementId?: string
}

export interface AchievementBoardRendererSlotProps {
  view: Readonly<QuaViewProjection>
  projection: AchievementProjection
  achievement: AchievementProjectionModel
  actions: RendererActions
}

export interface AchievementToastRendererSlotProps {
  view: Readonly<QuaViewProjection>
  projection: AchievementProjection
  notifications: readonly AchievementNotificationProjection[]
  actions: RendererActions
}

export function useAchievementProjection() {
  return usePluginProjection<AchievementProjection>(ACHIEVEMENT_PLUGIN_ID)
}

export function useAchievementProjectionModel() {
  const projection = useAchievementProjection()
  return computed(() => createAchievementProjectionModel(projection.value))
}

export const AchievementImageFrame = defineComponent({
  name: 'AchievementImageFrame',
  props: {
    asset: {
      type: Object as PropType<AchievementAssetRef | undefined>,
      required: false,
      default: undefined,
    },
    alt: {
      type: String,
      default: '',
    },
    className: {
      type: String,
      default: 'qua-achievement-image',
    },
  },
  setup(props) {
    const asset = useAssetUrl('images', () => props.asset?.name, () => runtimePackageCandidatesFromAchievementAsset(props.asset))
    return () => props.asset
      ? h('img', {
          'class': props.className,
          'src': asset.url.value,
          'alt': props.alt,
          'aria-hidden': props.alt ? undefined : 'true',
        })
      : null
  },
})

const AchievementToastAudio = defineComponent({
  name: 'AchievementToastAudio',
  props: {
    asset: {
      type: Object as PropType<AchievementNotificationProjection['sound']>,
      required: false,
      default: undefined,
    },
  },
  setup(props) {
    const asset = useAssetUrl('audio', () => props.asset?.name, () => runtimePackageCandidatesFromAchievementAsset(props.asset))
    return () => props.asset?.type === 'audio'
      ? h('audio', {
          class: 'qua-achievement-toast-audio',
          src: asset.url.value,
          autoplay: true,
          hidden: true,
          preload: 'auto',
        })
      : null
  },
})

export const QuaAchievementToastLayer = defineComponent({
  name: 'QuaAchievementToastLayer',
  inheritAttrs: false,
  setup(_, { slots }) {
    const renderer = useQuaRenderer()
    const { view } = renderer
    const actions = useRendererActions()
    const projection = useAchievementProjection()
    const notifications = computed(() => projection.value?.notifications || [])
    const sortedNotifications = computed(() => sortAchievementNotifications(notifications.value))
    const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

    watch(notifications, (next) => {
      const activeIds = new Set(next.map(notification => notification.id))
      for (const [notificationId, timer] of dismissTimers.entries()) {
        if (!activeIds.has(notificationId)) {
          clearTimeout(timer)
          dismissTimers.delete(notificationId)
        }
      }
      for (const notification of next) {
        if (dismissTimers.has(notification.id)) {
          continue
        }
        dismissTimers.set(notification.id, setTimeout(() => {
          dismissTimers.delete(notification.id)
          dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, {
            notificationId: notification.id,
          }), {
            phase: 'achievement:dismiss-notification',
            metadata: { notificationId: notification.id },
          })
        }, Math.max(16, notification.durationMs)))
      }
    }, { immediate: true })

    onBeforeUnmount(() => {
      for (const timer of dismissTimers.values()) {
        clearTimeout(timer)
      }
      dismissTimers.clear()
    })

    return () => {
      if (!projection.value || notifications.value.length === 0) {
        return null
      }
      const topNotification = sortedNotifications.value[sortedNotifications.value.length - 1]
      const overlayStack = createOverlayStackBinding(topNotification, {
        overlayStack: 'toast',
        zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.achievementToast,
      })

      return h('div', {
        'class': 'qua-achievement-toast-layer',
        'data-qua-capture-role': 'overlay',
        ...overlayStack.attrs,
        'style': { pointerEvents: 'auto', ...overlayStack.style },
        'onClick': (event: Event) => event.stopPropagation(),
      }, slots.default?.({
        view: view.value,
        projection: projection.value,
        notifications: sortedNotifications.value,
        actions,
      }) || sortedNotifications.value.map(notification =>
        renderAchievementToast({
          notification,
          renderer,
          actions,
        }),
      ))
    }
  },
})

export const QuaAchievementGroupButton = defineComponent({
  name: 'QuaAchievementGroupButton',
  props: {
    group: {
      type: Object as PropType<AchievementGroupProjectionItem>,
      required: true,
    },
    selected: Boolean,
  },
  setup(props) {
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    const skin = useUiControlSkin({
      kind: 'tab',
      selected: () => props.selected,
    })
    return () => h('button', {
      'class': ['qua-achievement-group-button', props.selected ? 'is-selected' : undefined],
      'type': 'button',
      'data-achievement-group-id': props.group.id,
      'aria-selected': props.selected ? 'true' : 'false',
      'style': skin.skinStyle.value,
      'data-skin-kind': 'tab',
      'data-skin-reference': skin.skinReference.value || undefined,
      'data-skin-state': skin.skinState.value,
      ...createSkinButtonHandlers(skin),
      'onClick': () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST, {
        groupId: props.group.id,
      }), {
        phase: 'achievement:select-group',
        metadata: { groupId: props.group.id },
      }),
    }, [
      h('span', { class: 'qua-achievement-group-title' }, props.group.title),
      h('span', { class: 'qua-achievement-group-count' }, `${props.group.unlockedAchievements}/${props.group.totalAchievements}`),
    ])
  },
})

export const QuaAchievementBoardLayer = defineComponent({
  name: 'QuaAchievementBoardLayer',
  inheritAttrs: false,
  setup(_, { slots }) {
    const renderer = useQuaRenderer()
    const { view } = renderer
    const actions = useRendererActions()
    const projection = useAchievementProjection()
    const achievement = computed(() => createAchievementProjectionModel(projection.value))
    const closeSkin = useUiControlSkin({ kind: 'button' })
    const inputSkin = useUiControlSkin({ kind: 'input' })
    const unlockedSkin = useUiControlSkin({
      kind: 'toggle',
      selected: () => Boolean(achievement.value?.projection.filter.unlockedOnly),
    })
    const hiddenSkin = useUiControlSkin({
      kind: 'toggle',
      selected: () => Boolean(achievement.value?.projection.filter.includeHidden),
    })

    return () => {
      if (!achievement.value?.projection.sceneActive) {
        return null
      }
      const overlayStack = createOverlayStackBinding(achievement.value.projection, {
        overlayStack: 'overlay',
        zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.achievementBoard,
      })

      return h('div', {
        'class': 'qua-achievement-layer',
        'data-qua-capture-role': 'overlay',
        ...overlayStack.attrs,
        'style': { pointerEvents: 'auto', ...overlayStack.style },
        'onClick': (event: Event) => event.stopPropagation(),
      }, slots.default?.({
        view: view.value,
        projection: achievement.value.projection,
        achievement: achievement.value,
        actions,
      }) || renderAchievementBoardDefault({
        achievement: achievement.value,
        renderer,
        actions,
        closeSkin,
        inputSkin,
        unlockedSkin,
        hiddenSkin,
      }))
    }
  },
})

export function createAchievementRendererPlugin(_options: AchievementRendererPluginOptions = {}): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/achievement',
    setup() {},
    layers: [
      {
        id: 'achievement-toast',
        order: 96,
        plane: 'overlay',
        component: QuaAchievementToastLayer,
      },
      {
        id: 'achievement-board',
        order: 98,
        plane: 'overlay',
        component: QuaAchievementBoardLayer,
      },
    ],
  })
}

export const achievementRendererPlugin = createAchievementRendererPlugin()

function renderAchievementToast(input: {
  notification: AchievementNotificationProjection
  renderer: Pick<ReturnType<typeof useQuaRenderer>, 'web'>
  actions: RendererActions
}): VNode {
  const { notification, renderer, actions } = input
  const icon = resolveAchievementImageAsset(notification.icon)
  const overlayStack = createOverlayStackBinding(notification, {
    overlayStack: 'toast',
    zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.achievementToast,
  })
  return h('button', {
    'class': 'qua-achievement-toast',
    'type': 'button',
    'data-achievement-notification-id': notification.id,
    'data-achievement-id': notification.achievementId,
    'data-qua-capture-role': 'overlay',
    ...overlayStack.attrs,
    'style': overlayStack.style,
    'onClick': () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, {
      notificationId: notification.id,
    }), {
      phase: 'achievement:dismiss-notification',
      metadata: { notificationId: notification.id },
    }),
  }, [
    icon
      ? h(AchievementImageFrame, {
          asset: icon,
          className: 'qua-achievement-toast-icon',
        })
      : null,
    h('div', { class: 'qua-achievement-toast-body' }, [
      h('strong', { class: 'qua-achievement-toast-title' }, notification.title),
      notification.summary ? h('p', { class: 'qua-achievement-toast-summary' }, notification.summary) : null,
    ]),
    notification.sound?.type === 'audio'
      ? h(AchievementToastAudio, { asset: notification.sound })
      : null,
  ])
}

function sortAchievementNotifications(
  notifications: readonly AchievementNotificationProjection[],
): AchievementNotificationProjection[] {
  return [...notifications].sort((left, right) => compareResolvedOverlayStackPlacement(
    resolveOverlayStackPlacement(left, {
      overlayStack: 'toast',
      zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.achievementToast,
    }),
    resolveOverlayStackPlacement(right, {
      overlayStack: 'toast',
      zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.achievementToast,
    }),
    left.id,
    right.id,
  ))
}

function renderAchievementBoardDefault(input: {
  achievement: AchievementProjectionModel
  renderer: Pick<ReturnType<typeof useQuaRenderer>, 'web'>
  actions: RendererActions
  closeSkin: ReturnType<typeof useUiControlSkin>
  inputSkin: ReturnType<typeof useUiControlSkin>
  unlockedSkin: ReturnType<typeof useUiControlSkin>
  hiddenSkin: ReturnType<typeof useUiControlSkin>
}): VNode[] {
  const { achievement, renderer, actions, closeSkin, inputSkin, unlockedSkin, hiddenSkin } = input

  return [
    h('section', {
      'class': 'qua-achievement-panel',
      'role': 'dialog',
      'aria-modal': 'true',
    }, [
      h('header', { class: 'qua-achievement-header' }, [
        h('div', { class: 'qua-achievement-heading' }, [
          h('h2', { class: 'qua-achievement-title' }, 'Achievements'),
          h('p', { class: 'qua-achievement-meta' }, `${achievement.unlockedCount}/${achievement.achievements.length} unlocked`),
        ]),
        h('button', {
          'class': 'qua-achievement-close',
          'type': 'button',
          'style': closeSkin.skinStyle.value,
          'data-skin-kind': 'button',
          'data-skin-reference': closeSkin.skinReference.value || undefined,
          'data-skin-state': closeSkin.skinState.value,
          ...createSkinButtonHandlers(closeSkin),
          'onClick': () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST, {}), {
            phase: 'achievement:close-board',
          }),
        }, 'Close'),
      ]),
      h('div', { class: 'qua-achievement-toolbar' }, [
        h('label', { class: 'qua-achievement-search' }, [
          h('span', { class: 'qua-achievement-search-label' }, 'Search'),
          h('input', {
            'class': 'qua-achievement-search-input',
            'type': 'search',
            'placeholder': 'Search',
            'value': achievement.projection.filter.search || '',
            'style': inputSkin.skinStyle.value,
            'data-skin-kind': 'input',
            'data-skin-reference': inputSkin.skinReference.value || undefined,
            'data-skin-state': inputSkin.skinState.value,
            'onInput': (event: Event) => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
              filter: {
                search: (event.target as HTMLInputElement).value,
              },
            }), {
              phase: 'achievement:update-filter',
              metadata: { field: 'search' },
            }),
          }),
        ]),
        h('button', {
          'class': ['qua-achievement-toolbar-toggle', achievement.projection.filter.unlockedOnly ? 'is-active' : undefined],
          'type': 'button',
          'style': unlockedSkin.skinStyle.value,
          'data-skin-kind': 'toggle',
          'data-skin-reference': unlockedSkin.skinReference.value || undefined,
          'data-skin-state': unlockedSkin.skinState.value,
          ...createSkinButtonHandlers(unlockedSkin),
          'onClick': () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
            filter: {
              unlockedOnly: !achievement.projection.filter.unlockedOnly,
            },
          }), {
            phase: 'achievement:update-filter',
            metadata: { field: 'unlockedOnly' },
          }),
        }, 'Unlocked'),
        h('button', {
          'class': ['qua-achievement-toolbar-toggle', achievement.projection.filter.includeHidden ? 'is-active' : undefined],
          'type': 'button',
          'style': hiddenSkin.skinStyle.value,
          'data-skin-kind': 'toggle',
          'data-skin-reference': hiddenSkin.skinReference.value || undefined,
          'data-skin-state': hiddenSkin.skinState.value,
          ...createSkinButtonHandlers(hiddenSkin),
          'onClick': () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
            filter: {
              includeHidden: !achievement.projection.filter.includeHidden,
            },
          }), {
            phase: 'achievement:update-filter',
            metadata: { field: 'includeHidden' },
          }),
        }, 'Hidden'),
        h('div', { class: 'qua-achievement-toolbar-counter' }, `${achievement.filteredAchievements.length}/${achievement.achievements.length}`),
      ]),
      h('div', { class: 'qua-achievement-body' }, [
        h('aside', { class: 'qua-achievement-group-pane' }, [
          h('h3', { class: 'qua-achievement-section-title' }, 'Groups'),
          achievement.groups.length > 0
            ? h('div', { class: 'qua-achievement-group-list' }, achievement.groups.map((group: AchievementGroupProjectionItem) =>
                h(QuaAchievementGroupButton, {
                  key: group.id,
                  group,
                  selected: achievement.projection.selectedGroupId === group.id,
                }),
              ))
            : h('p', { class: 'qua-achievement-empty' }, 'No groups'),
        ]),
        h('section', { class: 'qua-achievement-list-pane' }, [
          h('h3', { class: 'qua-achievement-section-title' }, 'Entries'),
          achievement.filteredAchievements.length > 0
            ? h('ol', { class: 'qua-achievement-list' }, achievement.filteredAchievements.map((item: AchievementProjectionItem) =>
                h('li', { key: item.id, class: 'qua-achievement-item' }, [
                  h(QuaAchievementCard, {
                    achievement: item,
                    selected: achievement.projection.selectedAchievementId === item.id,
                  }),
                ]),
              ))
            : h('p', { class: 'qua-achievement-empty' }, 'No achievements'),
        ]),
        h('section', { class: 'qua-achievement-detail-pane' }, [
          h('h3', { class: 'qua-achievement-section-title' }, 'Detail'),
          achievement.selectedAchievement
            ? renderAchievementDetail(achievement.selectedAchievement)
            : h('p', { class: 'qua-achievement-empty' }, 'No achievement selected'),
        ]),
      ]),
    ]),
  ]
}

QuaAchievementCard = defineComponent({
  name: 'QuaAchievementCard',
  props: {
    achievement: {
      type: Object as PropType<AchievementProjectionItem>,
      required: true,
    },
    selected: Boolean,
  },
  setup(props) {
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    const skin = useUiControlSkin({
      kind: 'button',
      selected: () => props.selected,
    })
    const preview = computed(() => resolveAchievementCardAsset(props.achievement))
    return () => h('button', {
      'class': [
        'qua-achievement-card',
        props.achievement.unlocked ? 'is-unlocked' : 'is-locked',
        props.selected ? 'is-selected' : undefined,
      ],
      'type': 'button',
      'data-achievement-id': props.achievement.id,
      'aria-selected': props.selected ? 'true' : 'false',
      'style': skin.skinStyle.value,
      'data-skin-kind': 'button',
      'data-skin-reference': skin.skinReference.value || undefined,
      'data-skin-state': skin.skinState.value,
      ...createSkinButtonHandlers(skin),
      'onClick': () => dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, {
        achievementId: props.achievement.id,
      }), {
        phase: 'achievement:select-achievement',
        metadata: { achievementId: props.achievement.id },
      }),
    }, [
      preview.value
        ? h(AchievementImageFrame, {
            asset: preview.value,
            className: 'qua-achievement-card-image',
          })
        : null,
      h('div', { class: 'qua-achievement-card-body' }, [
        h('strong', { class: 'qua-achievement-card-title' }, achievementDisplayTitle(props.achievement)),
        achievementDisplaySummary(props.achievement)
          ? h('p', { class: 'qua-achievement-card-summary' }, achievementDisplaySummary(props.achievement))
          : null,
        h('div', { class: 'qua-achievement-card-badges' }, [
          h('span', {
            class: ['qua-achievement-card-state', props.achievement.unlocked ? 'is-unlocked' : 'is-locked'],
          }, props.achievement.unlocked ? 'Unlocked' : 'Locked'),
          props.achievement.maxProgress && props.achievement.progress
            ? h('span', { class: 'qua-achievement-card-progress' }, `${props.achievement.progress.value}/${props.achievement.maxProgress}`)
            : null,
          ...(props.achievement.tags || []).map(tag =>
            h('span', { key: tag, class: 'qua-achievement-card-tag' }, tag),
          ),
        ]),
      ]),
    ])
  },
})

function renderAchievementDetail(achievement: AchievementProjectionItem): VNode {
  const banner = resolveAchievementDetailAsset(achievement)
  return h('div', { class: 'qua-achievement-detail' }, [
    banner
      ? h(AchievementImageFrame, {
          asset: banner,
          className: 'qua-achievement-detail-image',
        })
      : null,
    h('header', { class: 'qua-achievement-detail-header' }, [
      h('h4', { class: 'qua-achievement-detail-title' }, achievementDisplayTitle(achievement)),
      h('span', {
        class: ['qua-achievement-detail-state', achievement.unlocked ? 'is-unlocked' : 'is-locked'],
      }, achievement.unlocked ? 'Unlocked' : 'Locked'),
    ]),
    achievementDisplaySummary(achievement)
      ? h('p', { class: 'qua-achievement-detail-summary' }, achievementDisplaySummary(achievement))
      : null,
    achievementDisplayDescription(achievement)
      ? h('p', { class: 'qua-achievement-detail-description' }, achievementDisplayDescription(achievement))
      : null,
    h('div', { class: 'qua-achievement-detail-meta' }, [
      achievement.progress?.value !== undefined || achievement.maxProgress !== undefined
        ? h('span', { class: 'qua-achievement-detail-progress' }, `${achievement.progress?.value || 0}/${achievement.maxProgress || achievement.progress?.maxValue || 0}`)
        : null,
      achievement.unlockRecord
        ? h('span', { class: 'qua-achievement-detail-unlocked-at' }, `Unlocked ${new Date(achievement.unlockRecord.unlockedAt).toLocaleString()}`)
        : null,
    ]),
  ])
}

function resolveAchievementImageAsset(asset: AchievementAssetRef | undefined): AchievementAssetRef | undefined {
  return asset?.type === 'images' ? asset : undefined
}

function resolveAchievementCardAsset(achievement: AchievementProjectionItem): AchievementAssetRef | undefined {
  return resolveAchievementImageAsset(achievement.icon)
    || resolveAchievementImageAsset(achievement.banner)
    || resolveAchievementImageAsset(achievement.background)
}

function resolveAchievementDetailAsset(achievement: AchievementProjectionItem): AchievementAssetRef | undefined {
  return resolveAchievementImageAsset(achievement.banner)
    || resolveAchievementImageAsset(achievement.background)
    || resolveAchievementImageAsset(achievement.icon)
}

function achievementDisplayTitle(achievement: AchievementProjectionItem): string {
  return achievement.hidden && !achievement.unlocked ? 'Hidden Achievement' : achievement.title
}

function achievementDisplaySummary(achievement: AchievementProjectionItem): string | undefined {
  if (achievement.hidden && !achievement.unlocked) {
    return achievement.summary ? 'Unlock to reveal details.' : undefined
  }
  return achievement.summary
}

function achievementDisplayDescription(achievement: AchievementProjectionItem): string | undefined {
  if (achievement.hidden && !achievement.unlocked) {
    return undefined
  }
  return achievement.description
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
