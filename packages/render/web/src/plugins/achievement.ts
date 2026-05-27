import type {
  AchievementGroupProjectionItem,
  AchievementNotificationProjection,
  AchievementProjection,
  AchievementProjectionItem,
} from '@quajs/plugin-achievement/contracts'
import type { QuaViewProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import {
  ACHIEVEMENT_PLUGIN_ID,
  AchievementRenderToLogicEvents,
} from '@quajs/plugin-achievement/contracts'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'

type AchievementAssetRef = NonNullable<AchievementProjectionItem['icon']>

export interface AchievementProjectionModel {
  projection: AchievementProjection
  groups: readonly AchievementGroupProjectionItem[]
  achievements: readonly AchievementProjectionItem[]
  filteredAchievements: readonly AchievementProjectionItem[]
  selectedGroup?: AchievementGroupProjectionItem
  selectedAchievement?: AchievementProjectionItem
  unlockedCount: number
  lockedCount: number
}

export function getAchievementProjectionFromView(view: Readonly<QuaViewProjection>): AchievementProjection | undefined {
  return view.plugins[ACHIEVEMENT_PLUGIN_ID] as AchievementProjection | undefined
}

export function createAchievementProjectionModel(
  projection: AchievementProjection | undefined,
): AchievementProjectionModel | undefined {
  if (!projection) {
    return undefined
  }

  const groups = [...projection.groups]
  const achievements = [...projection.achievements]
  const groupById = new Map(groups.map(group => [group.id, group]))
  const achievementById = new Map(achievements.map(achievement => [achievement.id, achievement]))
  const filteredAchievements = projection.filteredAchievementIds
    .map(achievementId => achievementById.get(achievementId))
    .filter((achievement): achievement is AchievementProjectionItem => Boolean(achievement))
  const selectedGroup = projection.selectedGroupId
    ? groupById.get(projection.selectedGroupId) || groups[0]
    : groups[0]
  const selectedAchievement = projection.selectedAchievementId
    ? achievementById.get(projection.selectedAchievementId) || filteredAchievements[0] || achievements[0]
    : filteredAchievements[0] || achievements[0]
  const unlockedCount = achievements.filter(achievement => achievement.unlocked).length

  return {
    projection,
    groups,
    achievements,
    filteredAchievements,
    selectedGroup,
    selectedAchievement,
    unlockedCount,
    lockedCount: Math.max(0, achievements.length - unlockedCount),
  }
}

export function createAchievementWebRendererPlugin(): QuaWebDomRendererPlugin {
  const playedNotificationIds = new Set<string>()
  const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/achievement',
    setup() {},
    destroy() {
      for (const timer of dismissTimers.values()) {
        clearTimeout(timer)
      }
      dismissTimers.clear()
      playedNotificationIds.clear()
    },
    layers: [
      {
        id: 'achievement-toast',
        order: 96,
        plane: 'safe',
        render: context => renderAchievementToastLayer(context, playedNotificationIds, dismissTimers),
      },
      {
        id: 'achievement-board',
        order: 98,
        plane: 'safe',
        render: renderAchievementBoardLayer,
      },
    ],
  })
}

export const achievementWebRendererPlugin = createAchievementWebRendererPlugin()

function renderAchievementToastLayer(
  context: QuaWebDomLayerContext,
  playedNotificationIds: Set<string>,
  dismissTimers: Map<string, ReturnType<typeof setTimeout>>,
): Node | undefined {
  const projection = getAchievementProjectionFromView(context.view)
  const notifications = projection?.notifications || []
  if (notifications.length === 0) {
    clearDismissTimers(dismissTimers)
    return undefined
  }

  syncDismissTimers(context, notifications, dismissTimers)

  const layer = context.document.createElement('div')
  layer.className = 'qua-achievement-toast-layer'
  layer.setAttribute('data-qua-capture-role', 'overlay')
  layer.addEventListener('click', event => event.stopPropagation())

  for (const notification of notifications) {
    layer.append(renderAchievementToast(context, notification, playedNotificationIds))
  }

  return layer
}

function renderAchievementToast(
  context: QuaWebDomLayerContext,
  notification: AchievementNotificationProjection,
  playedNotificationIds: Set<string>,
): Node {
  const toast = context.document.createElement('button')
  toast.className = 'qua-achievement-toast'
  toast.type = 'button'
  toast.setAttribute('data-achievement-notification-id', notification.id)
  toast.setAttribute('data-achievement-id', notification.achievementId)
  toast.setAttribute('data-qua-capture-role', 'overlay')
  bindUiControlSkin(context, toast, {
    kind: 'panel',
  })
  toast.addEventListener('click', () => {
    void context.actions.requestPluginEvent(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, {
      notificationId: notification.id,
    })
  })

  const icon = resolveAchievementIconAsset(notification.icon)
  if (icon) {
    const iconNode = context.document.createElement('img')
    iconNode.className = 'qua-achievement-toast-icon'
    iconNode.alt = ''
    iconNode.setAttribute('aria-hidden', 'true')
    context.bindAssetUrl(iconNode, 'images', icon.name, 'src', icon.runtimePackageId)
    toast.append(iconNode)
  }

  const body = context.document.createElement('div')
  body.className = 'qua-achievement-toast-body'

  const title = context.document.createElement('strong')
  title.className = 'qua-achievement-toast-title'
  title.textContent = notification.title
  body.append(title)

  if (notification.summary) {
    const summary = context.document.createElement('p')
    summary.className = 'qua-achievement-toast-summary'
    summary.textContent = notification.summary
    body.append(summary)
  }

  toast.append(body)

  if (!playedNotificationIds.has(notification.id)) {
    playedNotificationIds.add(notification.id)
    const sound = notification.sound
    if (sound?.type === 'audio') {
      const audio = context.document.createElement('audio')
      audio.className = 'qua-achievement-toast-audio'
      audio.autoplay = true
      audio.preload = 'auto'
      audio.hidden = true
      context.bindAssetUrl(audio, 'audio', sound.name, 'src', sound.runtimePackageId)
      toast.append(audio)
    }
  }

  return toast
}

function renderAchievementBoardLayer(context: QuaWebDomLayerContext): Node | undefined {
  const model = createAchievementProjectionModel(getAchievementProjectionFromView(context.view))
  if (!model?.projection.sceneActive) {
    return undefined
  }

  const layer = context.document.createElement('div')
  layer.className = 'qua-achievement-layer'
  layer.setAttribute('data-qua-capture-role', 'overlay')
  layer.addEventListener('click', event => event.stopPropagation())

  const panel = context.document.createElement('section')
  panel.className = 'qua-achievement-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  bindUiControlSkin(context, panel, {
    kind: 'panel',
  })

  panel.append(renderAchievementHeader(context, model))
  panel.append(renderAchievementToolbar(context, model))
  panel.append(renderAchievementBody(context, model))
  layer.append(panel)
  return layer
}

function renderAchievementHeader(context: QuaWebDomLayerContext, model: AchievementProjectionModel): Node {
  const header = context.document.createElement('header')
  header.className = 'qua-achievement-header'

  const heading = context.document.createElement('div')
  heading.className = 'qua-achievement-heading'

  const title = context.document.createElement('h2')
  title.className = 'qua-achievement-title'
  title.textContent = 'Achievements'
  heading.append(title)

  const meta = context.document.createElement('p')
  meta.className = 'qua-achievement-meta'
  meta.textContent = `${model.unlockedCount}/${model.achievements.length} unlocked`
  heading.append(meta)

  const close = context.document.createElement('button')
  close.className = 'qua-achievement-close'
  close.type = 'button'
  close.textContent = 'Close'
  bindUiControlSkin(context, close, {
    kind: 'button',
  })
  close.addEventListener('click', () => {
    void context.actions.requestPluginEvent(AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST, {})
  })

  header.append(heading, close)
  return header
}

function renderAchievementToolbar(context: QuaWebDomLayerContext, model: AchievementProjectionModel): Node {
  const toolbar = context.document.createElement('div')
  toolbar.className = 'qua-achievement-toolbar'

  const searchLabel = context.document.createElement('label')
  searchLabel.className = 'qua-achievement-search'

  const searchText = context.document.createElement('span')
  searchText.className = 'qua-achievement-search-label'
  searchText.textContent = 'Search'

  const search = context.document.createElement('input')
  search.type = 'search'
  search.className = 'qua-achievement-search-input'
  search.placeholder = 'Search'
  search.value = model.projection.filter.search || ''
  bindUiControlSkin(context, search, {
    kind: 'input',
  })
  search.addEventListener('input', () => {
    void context.actions.requestPluginEvent(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
      filter: {
        search: search.value,
      },
    })
  })

  searchLabel.append(searchText, search)

  const unlockedOnly = createAchievementToggleButton(
    context,
    'Unlocked',
    Boolean(model.projection.filter.unlockedOnly),
    () => {
      void context.actions.requestPluginEvent(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
        filter: {
          unlockedOnly: !model.projection.filter.unlockedOnly,
        },
      })
    },
  )

  const includeHidden = createAchievementToggleButton(
    context,
    'Hidden',
    Boolean(model.projection.filter.includeHidden),
    () => {
      void context.actions.requestPluginEvent(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
        filter: {
          includeHidden: !model.projection.filter.includeHidden,
        },
      })
    },
  )

  const counter = context.document.createElement('div')
  counter.className = 'qua-achievement-toolbar-counter'
  counter.textContent = `${model.filteredAchievements.length}/${model.achievements.length}`

  toolbar.append(searchLabel, unlockedOnly, includeHidden, counter)
  return toolbar
}

function renderAchievementBody(context: QuaWebDomLayerContext, model: AchievementProjectionModel): Node {
  const body = context.document.createElement('div')
  body.className = 'qua-achievement-body'

  const groupsPane = context.document.createElement('aside')
  groupsPane.className = 'qua-achievement-group-pane'
  groupsPane.append(createSectionTitle(context.document, 'Groups'))
  if (model.groups.length > 0) {
    const groupList = context.document.createElement('div')
    groupList.className = 'qua-achievement-group-list'
    for (const group of model.groups) {
      groupList.append(renderAchievementGroupButton(context, group, model.projection.selectedGroupId === group.id))
    }
    groupsPane.append(groupList)
  }
  else {
    groupsPane.append(createEmptyState(context.document, 'No groups'))
  }

  const listPane = context.document.createElement('section')
  listPane.className = 'qua-achievement-list-pane'
  listPane.append(createSectionTitle(context.document, 'Entries'))
  if (model.filteredAchievements.length > 0) {
    const list = context.document.createElement('ol')
    list.className = 'qua-achievement-list'
    for (const achievement of model.filteredAchievements) {
      list.append(renderAchievementCard(context, achievement, model.projection.selectedAchievementId === achievement.id))
    }
    listPane.append(list)
  }
  else {
    listPane.append(createEmptyState(context.document, 'No achievements'))
  }

  const detailPane = context.document.createElement('section')
  detailPane.className = 'qua-achievement-detail-pane'
  detailPane.append(createSectionTitle(context.document, 'Detail'))
  if (model.selectedAchievement) {
    detailPane.append(renderAchievementDetail(context, model.selectedAchievement))
  }
  else {
    detailPane.append(createEmptyState(context.document, 'No achievement selected'))
  }

  body.append(groupsPane, listPane, detailPane)
  return body
}

function renderAchievementGroupButton(
  context: QuaWebDomLayerContext,
  group: AchievementGroupProjectionItem,
  selected: boolean,
): Node {
  const button = context.document.createElement('button')
  button.className = [
    'qua-achievement-group-button',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ')
  button.type = 'button'
  button.setAttribute('data-achievement-group-id', group.id)
  button.setAttribute('aria-selected', selected ? 'true' : 'false')
  bindUiControlSkin(context, button, {
    kind: 'tab',
    selected,
  })
  button.addEventListener('click', () => {
    void context.actions.requestPluginEvent(AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST, {
      groupId: group.id,
    })
  })

  const title = context.document.createElement('span')
  title.className = 'qua-achievement-group-title'
  title.textContent = group.title

  const count = context.document.createElement('span')
  count.className = 'qua-achievement-group-count'
  count.textContent = `${group.unlockedAchievements}/${group.totalAchievements}`

  button.append(title, count)
  return button
}

function renderAchievementCard(
  context: QuaWebDomLayerContext,
  achievement: AchievementProjectionItem,
  selected: boolean,
): Node {
  const item = context.document.createElement('li')
  item.className = 'qua-achievement-item'

  const button = context.document.createElement('button')
  button.className = [
    'qua-achievement-card',
    achievement.unlocked ? 'is-unlocked' : 'is-locked',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ')
  button.type = 'button'
  button.setAttribute('data-achievement-id', achievement.id)
  button.setAttribute('aria-selected', selected ? 'true' : 'false')
  bindUiControlSkin(context, button, {
    kind: 'button',
    selected,
  })
  button.addEventListener('click', () => {
    void context.actions.requestPluginEvent(AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, {
      achievementId: achievement.id,
    })
  })

  const preview = resolveAchievementCardAsset(achievement)
  if (preview) {
    const image = context.document.createElement('img')
    image.className = 'qua-achievement-card-image'
    image.alt = ''
    image.setAttribute('aria-hidden', 'true')
    context.bindAssetUrl(image, 'images', preview.name, 'src', preview.runtimePackageId)
    button.append(image)
  }

  const body = context.document.createElement('div')
  body.className = 'qua-achievement-card-body'

  const title = context.document.createElement('strong')
  title.className = 'qua-achievement-card-title'
  title.textContent = achievementDisplayTitle(achievement)
  body.append(title)

  const summaryText = achievementDisplaySummary(achievement)
  if (summaryText) {
    const summary = context.document.createElement('p')
    summary.className = 'qua-achievement-card-summary'
    summary.textContent = summaryText
    body.append(summary)
  }

  const badges = context.document.createElement('div')
  badges.className = 'qua-achievement-card-badges'

  const state = context.document.createElement('span')
  state.className = ['qua-achievement-card-state', achievement.unlocked ? 'is-unlocked' : 'is-locked'].join(' ')
  state.textContent = achievement.unlocked ? 'Unlocked' : 'Locked'
  badges.append(state)

  if (achievement.maxProgress && achievement.progress) {
    const progress = context.document.createElement('span')
    progress.className = 'qua-achievement-card-progress'
    progress.textContent = `${achievement.progress.value}/${achievement.maxProgress}`
    badges.append(progress)
  }

  for (const tag of achievement.tags || []) {
    const tagNode = context.document.createElement('span')
    tagNode.className = 'qua-achievement-card-tag'
    tagNode.textContent = tag
    badges.append(tagNode)
  }

  body.append(badges)
  button.append(body)
  item.append(button)
  return item
}

function renderAchievementDetail(context: QuaWebDomLayerContext, achievement: AchievementProjectionItem): Node {
  const detail = context.document.createElement('div')
  detail.className = 'qua-achievement-detail'

  const banner = resolveAchievementDetailAsset(achievement)
  if (banner) {
    const image = context.document.createElement('img')
    image.className = 'qua-achievement-detail-image'
    image.alt = ''
    image.setAttribute('aria-hidden', 'true')
    context.bindAssetUrl(image, 'images', banner.name, 'src', banner.runtimePackageId)
    detail.append(image)
  }

  const heading = context.document.createElement('header')
  heading.className = 'qua-achievement-detail-header'

  const title = context.document.createElement('h3')
  title.className = 'qua-achievement-detail-title'
  title.textContent = achievementDisplayTitle(achievement)
  heading.append(title)

  const state = context.document.createElement('span')
  state.className = ['qua-achievement-detail-state', achievement.unlocked ? 'is-unlocked' : 'is-locked'].join(' ')
  state.textContent = achievement.unlocked ? 'Unlocked' : 'Locked'
  heading.append(state)

  detail.append(heading)

  const summaryText = achievementDisplaySummary(achievement)
  if (summaryText) {
    const summary = context.document.createElement('p')
    summary.className = 'qua-achievement-detail-summary'
    summary.textContent = summaryText
    detail.append(summary)
  }

  const descriptionText = achievementDisplayDescription(achievement)
  if (descriptionText) {
    const description = context.document.createElement('p')
    description.className = 'qua-achievement-detail-description'
    description.textContent = descriptionText
    detail.append(description)
  }

  const meta = context.document.createElement('div')
  meta.className = 'qua-achievement-detail-meta'

  if (achievement.progress?.value !== undefined || achievement.maxProgress !== undefined) {
    const progress = context.document.createElement('span')
    progress.className = 'qua-achievement-detail-progress'
    progress.textContent = `${achievement.progress?.value || 0}/${achievement.maxProgress || achievement.progress?.maxValue || 0}`
    meta.append(progress)
  }

  if (achievement.unlockRecord) {
    const unlockedAt = context.document.createElement('span')
    unlockedAt.className = 'qua-achievement-detail-unlocked-at'
    unlockedAt.textContent = `Unlocked ${new Date(achievement.unlockRecord.unlockedAt).toLocaleString()}`
    meta.append(unlockedAt)
  }

  if (meta.childNodes.length > 0) {
    detail.append(meta)
  }

  return detail
}

function createAchievementToggleButton(
  context: QuaWebDomLayerContext,
  label: string,
  selected: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = context.document.createElement('button')
  button.className = ['qua-achievement-toolbar-toggle', selected ? 'is-active' : ''].filter(Boolean).join(' ')
  button.type = 'button'
  button.textContent = label
  bindUiControlSkin(context, button, {
    kind: 'toggle',
    selected,
  })
  button.addEventListener('click', onClick)
  return button
}

function createSectionTitle(document: Document, text: string): Node {
  const title = document.createElement('h3')
  title.className = 'qua-achievement-section-title'
  title.textContent = text
  return title
}

function createEmptyState(document: Document, text: string): Node {
  const empty = document.createElement('p')
  empty.className = 'qua-achievement-empty'
  empty.textContent = text
  return empty
}

function resolveAchievementCardAsset(achievement: AchievementProjectionItem): AchievementAssetRef | undefined {
  return resolveAchievementIconAsset(achievement.icon)
    || resolveAchievementIconAsset(achievement.banner)
    || resolveAchievementIconAsset(achievement.background)
}

function resolveAchievementDetailAsset(achievement: AchievementProjectionItem): AchievementAssetRef | undefined {
  return resolveAchievementIconAsset(achievement.banner)
    || resolveAchievementIconAsset(achievement.background)
    || resolveAchievementIconAsset(achievement.icon)
}

function resolveAchievementIconAsset(asset: AchievementAssetRef | undefined): AchievementAssetRef | undefined {
  return asset?.type === 'images' ? asset : undefined
}

function syncDismissTimers(
  context: QuaWebDomLayerContext,
  notifications: readonly AchievementNotificationProjection[],
  dismissTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  const activeIds = new Set<string>(notifications.map(notification => notification.id))

  for (const [notificationId, timer] of dismissTimers.entries()) {
    if (!activeIds.has(notificationId)) {
      clearTimeout(timer)
      dismissTimers.delete(notificationId)
    }
  }

  for (const notification of notifications) {
    if (dismissTimers.has(notification.id)) {
      continue
    }
    dismissTimers.set(notification.id, setTimeout(() => {
      dismissTimers.delete(notification.id)
      void context.actions.requestPluginEvent(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, {
        notificationId: notification.id,
      })
    }, Math.max(16, notification.durationMs)))
  }
}

function clearDismissTimers(dismissTimers: Map<string, ReturnType<typeof setTimeout>>): void {
  for (const timer of dismissTimers.values()) {
    clearTimeout(timer)
  }
  dismissTimers.clear()
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
