import type {
  AchievementNotificationProjection,
  AchievementProjection,
  AchievementProjectionItem,
} from '@quajs/plugin-achievement/contracts'
import type { CocosHostNode } from '@quajs/cocos-host'
import type { CocosRendererPluginContext } from '../types'
import { ACHIEVEMENT_PLUGIN_ID, AchievementRenderToLogicEvents } from '@quajs/plugin-achievement/contracts'
import { LogicToRenderEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'
import { resolveInputMetadataAny, stringValue } from './projection-utils'

export function createAchievementCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/achievement',
    setup(context) {
      const playedNotifications = new Set<string>()
      const soundHandles = new Map<string, AchievementSoundHandle>()
      const sync = () => {
        void renderAchievementLayer(context, playedNotifications, soundHandles).catch(error => context.reportError(error, {
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
          default:
            if (typeof metadata.achievementId === 'string') {
              await context.getPipeline().emit(AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, { achievementId: metadata.achievementId })
            }
        }
      }))
      context.addDisposer(() => cleanupAchievementSounds(context, soundHandles, playedNotifications))
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
    await renderAchievementBoard(context, layer, projection)
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
    const resource = await context.cocos.resolveAsset('images', icon.name, { targetPackageId: icon.runtimePackageId })
    context.cocos.setLayerResource('achievement', `notification:${notification.id}:icon`, resource)
    context.cocos.host.nodes.setNodeSprite(iconNode, resource)
    context.cocos.host.nodes.setNodeTransform(iconNode, { x: safeArea.x + safeArea.width - 408, y: safeArea.y + 38 + index * 86, width: 56, height: 56, zIndex: 2 })
  }
  if (!playedNotifications.has(notification.id) && notification.sound?.type === 'audio') {
    const resource = await context.cocos.resolveAsset('audio', notification.sound.name, { targetPackageId: notification.sound.runtimePackageId })
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
): Promise<void> {
  const safeArea = context.cocos.getStageLayout().safeArea
  const panel = context.cocos.host.nodes.createNode('achievement-panel', { parent, name: 'achievement:panel' })
  context.cocos.host.nodes.setNodeTransform(panel, { x: safeArea.x, y: safeArea.y, width: safeArea.width, height: safeArea.height, zIndex: 0 })
  context.cocos.host.nodes.setNodeControl?.(panel, { kind: 'panel', label: 'Achievements' })
  context.cocos.host.nodes.setNodeMetadata?.(panel, { plugin: 'achievement', achievementAction: 'panel' })
  const unlockedCount = projection.achievements.filter(item => item.unlocked).length
  const title = context.cocos.host.nodes.createNode('achievement-title', { parent: panel, name: 'achievement:title' })
  context.cocos.host.nodes.setNodeText(title, `Achievements ${unlockedCount}/${projection.achievements.length}`, { fontSize: 32, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, { x: safeArea.x + 28, y: safeArea.y + 24, width: safeArea.width - 180, height: 48, zIndex: 1 })
  renderButton(context, panel, 'achievement:close', 'Close', safeArea.x + safeArea.width - 140, safeArea.y + 24, 112, 44, {
    plugin: 'achievement',
    achievementAction: 'close',
  })
  renderButton(context, panel, 'achievement:filter:unlocked', 'Unlocked', safeArea.x + safeArea.width - 260, safeArea.y + 84, 110, 42, {
    plugin: 'achievement',
    achievementAction: 'toggleUnlockedOnly',
    nextUnlockedOnly: !projection.filter.unlockedOnly,
  }, projection.filter.unlockedOnly === true)
  projection.groups.slice(0, 6).forEach((group, index) => {
    renderButton(context, panel, `achievement:group:${group.id}`, group.title, safeArea.x + 28 + index * 150, safeArea.y + 84, 136, 42, {
      plugin: 'achievement',
      achievementAction: 'selectGroup',
      achievementGroupId: group.id,
      selected: group.id === projection.selectedGroupId,
    }, group.id === projection.selectedGroupId)
  })
  const items = projection.achievements.filter(item => projection.filteredAchievementIds.includes(item.id))
  items.slice(0, 12).forEach((achievement, index) => renderAchievementItem(context, panel, achievement, index, safeArea.x + 28, safeArea.y + 144, safeArea.width - 56, projection.selectedAchievementId === achievement.id))
}

function renderAchievementItem(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  achievement: AchievementProjectionItem,
  index: number,
  x: number,
  startY: number,
  width: number,
  selected: boolean,
): void {
  const y = startY + index * 64
  const title = achievement.hidden && !achievement.unlocked ? 'Hidden achievement' : achievement.title
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
