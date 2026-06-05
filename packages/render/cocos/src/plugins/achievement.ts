import type { CocosHostNode } from '@quajs/cocos-host'
import type {
  AchievementNotificationProjection,
  AchievementProjection,
  AchievementProjectionItem,
} from '@quajs/plugin-achievement/contracts'
import type { CocosRendererPluginContext } from '../types'
import { ACHIEVEMENT_PLUGIN_ID, AchievementRenderToLogicEvents } from '@quajs/plugin-achievement/contracts'
import { LogicToRenderEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'
import { resolveAssetWithTargetPackages, runtimePackageCandidatesFromAssetRef } from '../utils'
import { resolveInputMetadataAny, stringValue } from './projection-utils'

type AchievementAssetRef = NonNullable<AchievementProjectionItem['icon']>

export function createAchievementCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/achievement',
    setup(context) {
      const playedNotifications = new Set<string>()
      const soundHandles = new Map<string, AchievementSoundHandle>()
      const pages = new Map<string, number>()
      const notificationTimers = new Map<string, number>()
      const sync = () => {
        void renderAchievementLayer(context, playedNotifications, soundHandles, pages).then(() => {
          syncNotificationTimers(context, notificationTimers)
        }).catch(error => context.reportError(error, {
          message: 'Cocos achievement projection failed.',
          phase: 'renderer-cocos:achievement',
          pluginName: '@quajs/renderer-cocos/achievement',
        }))
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, sync))
      context.addDisposer(context.cocos.host.input.onInput(async (event) => {
        const metadata = resolveInputMetadataAny(context, event, [
          'achievementId',
          'achievementGroupId',
          'achievementNotificationId',
          'achievementAction',
        ])
        if (!metadata || (metadata.plugin !== undefined && metadata.plugin !== 'achievement'))
          return
        switch (stringValue(metadata.achievementAction)) {
          case 'close':
            await context.getPipeline().emit(AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST, {})
            break
          case 'selectGroup':
            await context.getPipeline().emit(AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST, { groupId: stringValue(metadata.achievementGroupId) })
            break
          case 'dismissNotification':
            await context.getPipeline().emit(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, {
              notificationId: stringValue(metadata.achievementNotificationId),
              achievementId: stringValue(metadata.achievementId),
            })
            break
          case 'toggleUnlockedOnly':
            await context.getPipeline().emit(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
              filter: { unlockedOnly: metadata.nextUnlockedOnly === true },
            })
            break
          case 'toggleIncludeHidden':
            await context.getPipeline().emit(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
              filter: { includeHidden: metadata.nextIncludeHidden === true },
            })
            break
          case 'search':
            await context.getPipeline().emit(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, {
              filter: { search: stringValue(metadata.value) || '' },
            })
            break
          case 'page':
            updatePage(pages, stringValue(metadata.achievementPageKey) || 'items', Number(metadata.achievementPageDelta) || 0)
            sync()
            break
          default:
            if (typeof metadata.achievementId === 'string') {
              await context.getPipeline().emit(AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, { achievementId: metadata.achievementId })
            }
        }
      }))
      context.addDisposer(() => {
        cleanupAchievementSounds(context, soundHandles, playedNotifications)
        clearNotificationTimers(context, notificationTimers)
      })
      sync()
    },
  })
}

export const achievementCocosRendererPlugin = createAchievementCocosRendererPlugin()

interface AchievementSoundHandle {
  handle: {
    stop: () => void | Promise<void>
    dispose: () => void | Promise<void>
  }
  resourceKey: string
}

async function renderAchievementLayer(
  context: CocosRendererPluginContext,
  playedNotifications: Set<string>,
  soundHandles: Map<string, AchievementSoundHandle>,
  pages: Map<string, number>,
): Promise<void> {
  const projection = context.getViewState().plugins[ACHIEVEMENT_PLUGIN_ID] as AchievementProjection | undefined
  const layer = context.cocos.getLayerNode('achievement', 'achievement-layer', 130)
  context.cocos.host.nodes.clearChildren(layer)
  context.cocos.releaseLayerResources('achievement')
  cleanupInactiveAchievementSounds(context, soundHandles, playedNotifications, new Set(projection?.notifications.map(notification => notification.id) || []))
  context.cocos.host.nodes.setNodeMetadata?.(layer, {
    plugin: 'achievement',
    visible: projection?.sceneActive === true || Boolean(projection?.notifications.length),
    projection,
  })
  if (!projection)
    return
  for (const [index, notification] of projection.notifications.entries()) {
    await renderAchievementToast(context, layer, notification, index, playedNotifications, soundHandles)
  }
  if (projection.sceneActive) {
    await renderAchievementBoard(context, layer, projection, pages)
  }
}

async function renderAchievementToast(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  notification: AchievementNotificationProjection,
  index: number,
  playedNotifications: Set<string>,
  soundHandles: Map<string, AchievementSoundHandle>,
): Promise<void> {
  const safeArea = context.cocos.getStageLayout().safeArea
  const node = renderButton(context, parent, `achievement:toast:${notification.id}`, notification.title, safeArea.x + safeArea.width - 420, safeArea.y + 28 + index * 86, 392, 76, {
    plugin: 'achievement',
    achievementAction: 'dismissNotification',
    achievementNotificationId: notification.id,
    achievementId: notification.achievementId,
    summary: notification.summary,
  }, true)
  context.cocos.host.nodes.setNodeMetadata?.(node, {
    ...(context.cocos.host.nodes.getNodeMetadata?.(node) || {}),
    notification,
  })
  const icon = notification.icon
  if (icon?.type === 'images') {
    const iconNode = context.cocos.host.nodes.createNode('achievement-toast-icon', { parent: node, name: `achievement:toast:${notification.id}:icon` })
    const resource = await resolveAssetWithTargetPackages(context.cocos, 'images', icon.name, runtimePackageCandidatesFromAssetRef(icon as unknown as Record<string, unknown>))
    context.cocos.setLayerResource('achievement', `notification:${notification.id}:icon`, resource)
    context.cocos.host.nodes.setNodeSprite(iconNode, resource)
    context.cocos.host.nodes.setNodeTransform(iconNode, { x: 12, y: 10, width: 56, height: 56, zIndex: 2 })
  }
  if (!playedNotifications.has(notification.id) && notification.sound?.type === 'audio') {
    const resource = await resolveAssetWithTargetPackages(
      context.cocos,
      'audio',
      notification.sound.name,
      runtimePackageCandidatesFromAssetRef(notification.sound as unknown as Record<string, unknown>),
    )
    if (resource) {
      playedNotifications.add(notification.id)
      const resourceKey = `notification:${notification.id}:sound`
      context.cocos.setLayerResource('achievement-sound', resourceKey, resource)
      let handle: AchievementSoundHandle['handle'] | undefined
      try {
        const audioHandle = await context.cocos.host.audio.createAudioHandle(resource, {
          id: `achievement:${notification.id}:sound`,
          loop: false,
          volume: 1,
          bus: 'sfx',
        })
        handle = audioHandle
        soundHandles.set(notification.id, { handle: audioHandle, resourceKey })
        audioHandle.onEnded?.(() => {
          void audioHandle.dispose()
          soundHandles.delete(notification.id)
          context.cocos.setLayerResource('achievement-sound', resourceKey, undefined)
        })
        await audioHandle.play()
      }
      catch (error) {
        if (handle) {
          void handle.stop()
          void handle.dispose()
          soundHandles.delete(notification.id)
        }
        playedNotifications.delete(notification.id)
        context.cocos.setLayerResource('achievement-sound', resourceKey, undefined)
        throw error
      }
    }
  }
}

async function renderAchievementBoard(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  projection: AchievementProjection,
  pages: Map<string, number>,
): Promise<void> {
  const safeArea = context.cocos.getStageLayout().safeArea
  const panel = context.cocos.host.nodes.createNode('achievement-panel', { parent, name: 'achievement:panel' })
  context.cocos.host.nodes.setNodeTransform(panel, { x: safeArea.x, y: safeArea.y, width: safeArea.width, height: safeArea.height, zIndex: 0 })
  context.cocos.host.nodes.setNodeControl?.(panel, { kind: 'panel', label: 'Achievements' })
  context.cocos.host.nodes.setNodeMetadata?.(panel, { plugin: 'achievement', achievementAction: 'panel' })
  const unlockedCount = projection.achievements.filter(item => item.unlocked).length
  const title = context.cocos.host.nodes.createNode('achievement-title', { parent: panel, name: 'achievement:title' })
  context.cocos.host.nodes.setNodeText(title, `Achievements ${unlockedCount}/${projection.achievements.length}`, { fontSize: 32, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, { x: 28, y: 24, width: safeArea.width - 180, height: 48, zIndex: 1 })
  renderButton(context, panel, 'achievement:close', 'Close', safeArea.width - 140, 24, 112, 44, {
    plugin: 'achievement',
    achievementAction: 'close',
  })
  renderButton(context, panel, 'achievement:filter:unlocked', 'Unlocked', safeArea.width - 260, 84, 110, 42, {
    plugin: 'achievement',
    achievementAction: 'toggleUnlockedOnly',
    nextUnlockedOnly: !projection.filter.unlockedOnly,
  }, projection.filter.unlockedOnly === true)
  renderButton(context, panel, 'achievement:filter:hidden', 'Hidden', safeArea.width - 380, 84, 104, 42, {
    plugin: 'achievement',
    achievementAction: 'toggleIncludeHidden',
    nextIncludeHidden: !projection.filter.includeHidden,
  }, projection.filter.includeHidden === true)
  const search = context.cocos.host.nodes.createNode('achievement-search', { parent: panel, name: 'achievement:search' })
  context.cocos.host.nodes.setNodeText(search, `Search: ${projection.filter.search || ''}`, { fontSize: 20, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeControl?.(search, {
    kind: 'input',
    value: projection.filter.search || '',
    placeholder: 'Search',
    label: 'Search',
    metadata: {
      plugin: 'achievement',
      achievementAction: 'search',
    },
  })
  context.cocos.host.nodes.setNodeTransform(search, { x: safeArea.width - 620, y: 84, width: 220, height: 42, zIndex: 10 })
  context.cocos.host.nodes.setNodeMetadata?.(search, {
    plugin: 'achievement',
    achievementAction: 'search',
  })
  const groupPage = pageItems(projection.groups, pages.get('groups') || 0, 6)
  groupPage.items.forEach((group, index) => {
    renderButton(context, panel, `achievement:group:${group.id}`, group.title, 28 + index * 150, 84, 136, 42, {
      plugin: 'achievement',
      achievementAction: 'selectGroup',
      achievementGroupId: group.id,
      selected: group.id === projection.selectedGroupId,
    }, group.id === projection.selectedGroupId)
  })
  renderPager(context, panel, 'achievement:groups', 'groups', groupPage, 28 + 6 * 150, 84)
  const items = projection.achievements.filter(item => projection.filteredAchievementIds.includes(item.id))
  const itemPage = pageItems(items, pages.get('items') || 0, 10)
  if (items.length === 0) {
    renderEmptyState(context, panel, 'No achievements', 28, 144, Math.min(560, safeArea.width - 56))
  }
  for (const [index, achievement] of itemPage.items.entries()) {
    await renderAchievementItem(context, panel, achievement, index, 28, 144, Math.min(560, safeArea.width - 56), projection.selectedAchievementId === achievement.id)
  }
  renderPager(context, panel, 'achievement:items', 'items', itemPage, 28, 144 + 10 * 64)
  const selected = projection.achievements.find(item => item.id === projection.selectedAchievementId)
    || items[0]
  if (selected) {
    await renderAchievementDetail(context, panel, selected, 620, 144, Math.max(320, safeArea.width - 650))
  }
  else {
    renderEmptyState(context, panel, 'No achievement selected', 620, 144, Math.max(320, safeArea.width - 650))
  }
}

async function renderAchievementItem(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  achievement: AchievementProjectionItem,
  index: number,
  x: number,
  startY: number,
  width: number,
  selected: boolean,
): Promise<void> {
  const y = startY + index * 64
  const title = achievementDisplayTitle(achievement)
  const suffix = achievement.unlocked
    ? 'Unlocked'
    : achievement.progress && achievement.maxProgress
      ? `${achievement.progress.value}/${achievement.maxProgress}`
      : 'Locked'
  const node = renderButton(context, parent, `achievement:item:${achievement.id}`, `${title} - ${suffix}`, x, y, width, 56, {
    plugin: 'achievement',
    achievementId: achievement.id,
    unlocked: achievement.unlocked,
    selected,
  }, selected)
  context.cocos.host.nodes.setNodeMetadata?.(node, {
    ...(context.cocos.host.nodes.getNodeMetadata?.(node) || {}),
    achievement,
  })
  const preview = resolveAchievementCardAsset(achievement)
  if (preview) {
    const image = context.cocos.host.nodes.createNode('achievement-card-image', { parent: node, name: `achievement:item:${achievement.id}:image` })
    const resource = await resolveAchievementAsset(context, preview, `achievement:item:${achievement.id}:image`)
    context.cocos.host.nodes.setNodeSprite(image, resource)
    context.cocos.host.nodes.setNodeTransform(image, { x: 8, y: 8, width: 40, height: 40, zIndex: 13 })
  }
  const summaryText = achievementDisplaySummary(achievement)
  if (summaryText) {
    const summary = context.cocos.host.nodes.createNode('achievement-card-summary', { parent: node, name: `achievement:item:${achievement.id}:summary` })
    context.cocos.host.nodes.setNodeText(summary, summaryText, { fontSize: 16, color: '#d8d8d8' })
    context.cocos.host.nodes.setNodeTransform(summary, { x: preview ? 58 : 12, y: 30, width: Math.max(0, width - (preview ? 70 : 24)), height: 20, zIndex: 13 })
  }
  const badges = [
    achievement.unlocked ? 'Unlocked' : 'Locked',
    achievement.progress && achievement.maxProgress ? `${achievement.progress.value}/${achievement.maxProgress}` : undefined,
    ...(achievement.tags || []),
  ].filter(Boolean)
  if (badges.length) {
    const badgeNode = context.cocos.host.nodes.createNode('achievement-card-badges', { parent: node, name: `achievement:item:${achievement.id}:badges` })
    context.cocos.host.nodes.setNodeText(badgeNode, badges.join('  '), { fontSize: 14, color: '#d8d8d8' })
    context.cocos.host.nodes.setNodeTransform(badgeNode, { x: preview ? 58 : 12, y: 8, width: Math.max(0, width - (preview ? 70 : 24)), height: 18, zIndex: 13 })
  }
}

async function renderAchievementDetail(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  achievement: AchievementProjectionItem,
  x: number,
  y: number,
  width: number,
): Promise<void> {
  const node = context.cocos.host.nodes.createNode('achievement-detail', { parent, name: `achievement:detail:${achievement.id}` })
  const title = achievementDisplayTitle(achievement)
  const summaryText = achievementDisplaySummary(achievement)
  const descriptionText = achievementDisplayDescription(achievement)
  const lines = [
    title,
    summaryText,
    descriptionText,
    achievement.unlocked ? 'Unlocked' : 'Locked',
    achievement.progress?.value !== undefined || achievement.maxProgress !== undefined
      ? `${achievement.progress?.value || 0}/${achievement.maxProgress || achievement.progress?.maxValue || 0}`
      : undefined,
    achievement.unlockRecord ? `Unlocked ${formatAchievementTime(achievement.unlockRecord.unlockedAt)}` : undefined,
    achievement.tags?.length ? achievement.tags.join(', ') : undefined,
  ].filter(Boolean).join('\n')
  context.cocos.host.nodes.setNodeText(node, lines, { fontSize: 22, color: '#ffffff' })
  context.cocos.host.nodes.setNodeControl?.(node, { kind: 'panel', label: title })
  context.cocos.host.nodes.setNodeTransform(node, { x, y, width, height: 260, zIndex: 14 })
  context.cocos.host.nodes.setNodeMetadata?.(node, { plugin: 'achievement', achievementId: achievement.id, achievement })
  const banner = resolveAchievementDetailAsset(achievement)
  if (banner) {
    const image = context.cocos.host.nodes.createNode('achievement-detail-image', { parent: node, name: `achievement:detail:${achievement.id}:image` })
    const resource = await resolveAchievementAsset(context, banner, `achievement:detail:${achievement.id}:image`)
    context.cocos.host.nodes.setNodeSprite(image, resource)
    context.cocos.host.nodes.setNodeTransform(image, { x: 12, y: 12, width: Math.min(220, width - 24), height: 96, zIndex: 15 })
  }
}

function renderEmptyState(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  label: string,
  x: number,
  y: number,
  width: number,
): void {
  const node = context.cocos.host.nodes.createNode('achievement-empty', { parent, name: `achievement:empty:${label}` })
  context.cocos.host.nodes.setNodeText(node, label, { fontSize: 22, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeTransform(node, { x, y, width, height: 48, zIndex: 10 })
  context.cocos.host.nodes.setNodeMetadata?.(node, { plugin: 'achievement', empty: true })
}

async function resolveAchievementAsset(
  context: CocosRendererPluginContext,
  asset: AchievementAssetRef,
  resourceKey: string,
) {
  const resource = await resolveAssetWithTargetPackages(
    context.cocos,
    asset.type,
    asset.name,
    runtimePackageCandidatesFromAssetRef(asset as unknown as Record<string, unknown>),
  )
  context.cocos.setLayerResource('achievement', resourceKey, resource)
  return resource
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

function achievementDisplayTitle(achievement: AchievementProjectionItem): string {
  return achievement.hidden && !achievement.unlocked ? 'Hidden Achievement' : achievement.title
}

function achievementDisplaySummary(achievement: AchievementProjectionItem): string | undefined {
  if (achievement.hidden && !achievement.unlocked)
    return achievement.summary ? 'Unlock to reveal details.' : undefined
  return achievement.summary
}

function achievementDisplayDescription(achievement: AchievementProjectionItem): string | undefined {
  if (achievement.hidden && !achievement.unlocked)
    return undefined
  return achievement.description
}

function formatAchievementTime(timestamp: number): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function renderPager(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  prefix: string,
  pageKey: string,
  page: PageResult<unknown>,
  x: number,
  y: number,
): void {
  renderButton(context, parent, `${prefix}:prev`, 'Prev', x, y, 72, 42, {
    plugin: 'achievement',
    achievementAction: 'page',
    achievementPageKey: pageKey,
    achievementPageDelta: -1,
  })
  renderButton(context, parent, `${prefix}:next`, 'Next', x + 82, y, 72, 42, {
    plugin: 'achievement',
    achievementAction: 'page',
    achievementPageKey: pageKey,
    achievementPageDelta: 1,
  })
  const label = context.cocos.host.nodes.createNode('achievement-page-label', { parent, name: `${prefix}:label` })
  context.cocos.host.nodes.setNodeText(label, `${page.page + 1}/${page.pageCount}`, { fontSize: 18, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeTransform(label, { x: x + 164, y, width: 72, height: 42, zIndex: 10 })
}

interface PageResult<T> {
  items: readonly T[]
  page: number
  pageCount: number
}

function pageItems<T>(items: readonly T[], requestedPage: number, pageSize: number): PageResult<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(pageCount - 1, Math.max(0, requestedPage))
  return {
    items: items.slice(page * pageSize, page * pageSize + pageSize),
    page,
    pageCount,
  }
}

function updatePage(pages: Map<string, number>, key: string, delta: number): void {
  pages.set(key, Math.max(0, (pages.get(key) || 0) + delta))
}

function renderButton(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  name: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  metadata: Record<string, unknown>,
  selected = false,
): CocosHostNode {
  const node = context.cocos.host.nodes.createNode('achievement-button', { parent, name })
  context.cocos.host.nodes.setNodeText(node, label, { fontSize: 20, color: selected ? '#ffffff' : '#d8d8d8' })
  context.cocos.host.nodes.setNodeControl?.(node, { kind: 'button', label, selected })
  context.cocos.host.nodes.setNodeTransform(node, { x, y, width, height, zIndex: selected ? 12 : 10 })
  context.cocos.host.nodes.setNodeMetadata?.(node, metadata)
  return node
}

function cleanupInactiveAchievementSounds(
  context: CocosRendererPluginContext,
  soundHandles: Map<string, AchievementSoundHandle>,
  playedNotifications: Set<string>,
  activeNotificationIds: Set<string>,
): void {
  for (const notificationId of [...soundHandles.keys()]) {
    if (activeNotificationIds.has(notificationId))
      continue
    cleanupAchievementSound(context, soundHandles, notificationId)
  }
  for (const notificationId of [...playedNotifications]) {
    if (!activeNotificationIds.has(notificationId)) {
      playedNotifications.delete(notificationId)
    }
  }
}

function cleanupAchievementSounds(
  context: CocosRendererPluginContext,
  soundHandles: Map<string, AchievementSoundHandle>,
  playedNotifications: Set<string>,
): void {
  for (const notificationId of [...soundHandles.keys()]) {
    cleanupAchievementSound(context, soundHandles, notificationId)
  }
  playedNotifications.clear()
}

function cleanupAchievementSound(
  context: CocosRendererPluginContext,
  soundHandles: Map<string, AchievementSoundHandle>,
  notificationId: string,
): void {
  const record = soundHandles.get(notificationId)
  if (!record)
    return
  void record.handle.stop()
  void record.handle.dispose()
  context.cocos.setLayerResource('achievement-sound', record.resourceKey, undefined)
  soundHandles.delete(notificationId)
}

function syncNotificationTimers(
  context: CocosRendererPluginContext,
  timers: Map<string, number>,
): void {
  const projection = context.getViewState().plugins[ACHIEVEMENT_PLUGIN_ID] as AchievementProjection | undefined
  const activeIds = new Set(projection?.notifications.map(notification => notification.id) || [])
  for (const [notificationId, timer] of [...timers]) {
    if (activeIds.has(notificationId))
      continue
    context.cocos.host.scheduler.clearTimeout(timer)
    timers.delete(notificationId)
  }
  for (const notification of projection?.notifications || []) {
    if (timers.has(notification.id))
      continue
    const delay = Math.max(16, notification.createdAt + notification.durationMs - context.cocos.host.runtime.now())
    const timer = context.cocos.host.scheduler.setTimeout(() => {
      timers.delete(notification.id)
      void context.getPipeline().emit(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, {
        notificationId: notification.id,
        achievementId: notification.achievementId,
      })
    }, delay)
    timers.set(notification.id, timer)
  }
}

function clearNotificationTimers(context: CocosRendererPluginContext, timers: Map<string, number>): void {
  for (const timer of timers.values()) {
    context.cocos.host.scheduler.clearTimeout(timer)
  }
  timers.clear()
}
