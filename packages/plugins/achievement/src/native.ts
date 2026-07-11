import type {
  NativeRendererFeatureSurfaceContext,
  NativeRendererFeatureSurfaceEntry,
  NativeRendererFeatureSurfaceOverlay,
} from '@quajs/engine-native'
import type {
  NativePackageProvenance,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceRect,
} from '@quajs/native-ui-compiler'
import type {
  AchievementNotificationProjection,
  AchievementProjection,
  AchievementProjectionItem,
} from './contracts'
import { ACHIEVEMENT_PLUGIN_ID, AchievementRenderToLogicEvents } from './contracts'

export const ACHIEVEMENT_NATIVE_RENDERER_ENTRY = '@quajs/plugin-achievement/native' as const
export const ACHIEVEMENT_NATIVE_BOARD_SURFACE_KEY = 'plugin-achievement/native-board' as const
export const ACHIEVEMENT_NATIVE_TOAST_SURFACE_KEY = 'plugin-achievement/native-toast' as const

const ACTIONS = {
  close: 'achievement-close',
  dismiss: 'achievement-dismiss-notification',
  selectAchievement: 'achievement-select-item',
  selectGroup: 'achievement-select-group',
  toggleHidden: 'achievement-toggle-hidden',
  toggleUnlocked: 'achievement-toggle-unlocked',
} as const
const MAX_GROUPS = 5
const MAX_ACHIEVEMENTS = 7

export function createAchievementNativeRendererFeature(): NativeRendererFeatureSurfaceEntry {
  return {
    pluginId: ACHIEVEMENT_PLUGIN_ID,
    createOverlays: createAchievementNativeOverlays,
    intentActions: [
      {
        action: ACTIONS.close,
        event: AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST,
        createPayload: () => ({}),
      },
      {
        action: ACTIONS.selectGroup,
        event: AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST,
        createPayload: payload => ({ groupId: requiredString(payload.groupId, 'groupId') }),
      },
      {
        action: ACTIONS.selectAchievement,
        event: AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST,
        createPayload: payload => ({ achievementId: requiredString(payload.achievementId, 'achievementId') }),
      },
      {
        action: ACTIONS.toggleUnlocked,
        event: AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST,
        createPayload: payload => ({ filter: { unlockedOnly: payload.unlockedOnly === true }, replace: false }),
      },
      {
        action: ACTIONS.toggleHidden,
        event: AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST,
        createPayload: payload => ({ filter: { includeHidden: payload.includeHidden === true }, replace: false }),
      },
      {
        action: ACTIONS.dismiss,
        event: AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST,
        createPayload: payload => ({
          achievementId: requiredString(payload.achievementId, 'achievementId'),
          notificationId: requiredString(payload.notificationId, 'notificationId'),
        }),
      },
    ],
  }
}

function createAchievementNativeOverlays(context: NativeRendererFeatureSurfaceContext) {
  const projection = context.projection as unknown as AchievementProjection & Record<string, unknown>
  const rootProvenance = normalizeProvenance(
    stringValue(projection.contentPackageId),
    projection.requiredRuntimePackages || [],
  )
  const overlays: NativeRendererFeatureSurfaceOverlay[] = projection.notifications.map((notification, index) => createToastOverlay(
    context,
    notification,
    index,
    rootProvenance,
  ))
  if (projection.sceneActive === true) {
    overlays.unshift(createBoardOverlay(context, projection, rootProvenance))
  }
  return overlays
}

function createBoardOverlay(
  context: NativeRendererFeatureSurfaceContext,
  projection: AchievementProjection,
  provenance: NativePackageProvenance,
) {
  return {
    elementId: 'achievement-board',
    visible: true,
    renderMode: 'render-only' as const,
    interactive: true,
    overlayStack: stringValue(projection.overlayStack) || 'overlay',
    stackPriority: finiteInteger(projection.stackPriority),
    zIndex: finiteInteger(projection.zIndex) ?? 80,
    surface: {
      key: ACHIEVEMENT_NATIVE_BOARD_SURFACE_KEY,
      root: createBoardRoot(context, projection, provenance),
    },
    ...provenance,
  }
}

function createBoardRoot(
  context: NativeRendererFeatureSurfaceContext,
  projection: AchievementProjection,
  provenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const edge = Math.max(24, Math.min(context.safeArea.width, context.logicalHeight) * 0.03)
  const panel = inset(context.safeArea, edge)
  const headerHeight = Math.max(124, panel.height * 0.15)
  const listWidth = panel.width * 0.54
  const detailX = panel.x + listWidth + edge * 0.5
  const detailWidth = panel.x + panel.width - detailX - edge
  const bodyTop = panel.y + headerHeight
  const bodyHeight = panel.height - headerHeight - edge
  const filtered = projection.filteredAchievementIds
    .map(id => projection.achievements.find(item => item.id === id))
    .filter((item): item is AchievementProjectionItem => Boolean(item))
  const selected = projection.achievements.find(item => item.id === projection.selectedAchievementId) || filtered[0]
  const visible = centeredWindow(filtered, selected?.id, MAX_ACHIEVEMENTS)
  const rowGap = 10
  const rowHeight = Math.max(62, (bodyHeight - rowGap * Math.max(0, visible.length - 1)) / Math.max(1, visible.length))
  const groupWidth = Math.min(190, (listWidth - edge) / Math.max(1, Math.min(MAX_GROUPS, projection.groups.length)))
  const unlockedCount = projection.achievements.filter(item => item.unlocked).length

  return node('achievement-root', 'Fragment', stage(context), {
    provenance,
    children: [
      node('achievement-backdrop', 'Backdrop', stage(context), {
        intent: uiIntent(ACTIONS.close),
        style: { backgroundColor: '#050608', opacity: 0.88 },
        provenance,
      }),
      node('achievement-panel', 'Panel', panel, {
        style: { backgroundColor: '#11161c', borderColor: '#626c79', borderRadius: 6, borderWidth: 1 },
        provenance,
        children: [
          node('achievement-title', 'Text', {
            x: panel.x + edge,
            y: panel.y + edge * 0.45,
            width: listWidth - edge,
            height: 46,
          }, {
            text: `Achievements ${unlockedCount}/${projection.achievements.length}`,
            style: { color: '#f4f6f8', fontSize: 34, fontWeight: 700 },
            provenance,
          }),
          node('achievement-filter-unlocked', 'Button', {
            x: panel.x + panel.width - edge - 330,
            y: panel.y + edge * 0.45,
            width: 104,
            height: 44,
          }, {
            text: projection.filter.unlockedOnly ? 'All' : 'Unlocked',
            intent: uiIntent(ACTIONS.toggleUnlocked, { unlockedOnly: projection.filter.unlockedOnly !== true }),
            style: buttonStyle('#293b4d'),
            provenance,
          }),
          node('achievement-filter-hidden', 'Button', {
            x: panel.x + panel.width - edge - 216,
            y: panel.y + edge * 0.45,
            width: 102,
            height: 44,
          }, {
            text: projection.filter.includeHidden ? 'Hide secret' : 'Show secret',
            intent: uiIntent(ACTIONS.toggleHidden, { includeHidden: projection.filter.includeHidden !== true }),
            style: buttonStyle('#3c3043'),
            provenance,
          }),
          node('achievement-close', 'Button', {
            x: panel.x + panel.width - edge - 104,
            y: panel.y + edge * 0.45,
            width: 104,
            height: 44,
          }, {
            text: 'Close',
            intent: uiIntent(ACTIONS.close),
            style: buttonStyle('#303842'),
            provenance,
          }),
          ...projection.groups.slice(0, MAX_GROUPS).map((group, index) => node(
            `achievement-group-${group.id}`,
            'Button',
            {
              x: panel.x + edge + index * groupWidth,
              y: panel.y + 72,
              width: groupWidth - 8,
              height: 42,
            },
            {
              text: `${group.title} ${group.unlockedAchievements}/${group.totalAchievements}`,
              intent: uiIntent(ACTIONS.selectGroup, { groupId: group.id }),
              style: buttonStyle(group.id === projection.selectedGroupId ? '#6d5936' : '#222b35'),
              provenance: mergeProvenance(provenance, itemProvenance(group)),
            },
          )),
          ...visible.map((achievement, index) => createAchievementRow(achievement, {
            x: panel.x + edge,
            y: bodyTop + index * (rowHeight + rowGap),
            width: listWidth - edge * 1.5,
            height: rowHeight,
          }, achievement.id === selected?.id, provenance)),
          createAchievementDetail(selected, {
            x: detailX,
            y: bodyTop,
            width: detailWidth,
            height: bodyHeight,
          }, provenance),
        ],
      }),
    ],
  })
}

function createAchievementRow(
  achievement: AchievementProjectionItem,
  bounds: NativeUiSurfaceRect,
  selected: boolean,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const provenance = mergeProvenance(inherited, itemProvenance(achievement))
  const hidden = achievement.hidden === true && !achievement.unlocked
  const image = hidden ? undefined : assetImage(achievement.icon)
  const progress = progressLabel(achievement)
  return node(`achievement-item-${achievement.id}`, 'Button', bounds, {
    text: `${hidden ? 'Hidden Achievement' : achievement.title}  ${progress}`,
    image,
    intent: uiIntent(ACTIONS.selectAchievement, { achievementId: achievement.id }),
    provenance,
    style: {
      ...buttonStyle(selected ? '#66512f' : '#1b232c'),
      objectFit: 'cover',
      textAlign: image ? 'right' : 'left',
    },
  })
}

function createAchievementDetail(
  achievement: AchievementProjectionItem | undefined,
  bounds: NativeUiSurfaceRect,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  if (!achievement) {
    return node('achievement-detail-empty', 'Text', bounds, {
      text: 'No achievement selected',
      style: { color: '#a5aeb9', fontSize: 24, textAlign: 'center' },
      provenance: inherited,
    })
  }
  const hidden = achievement.hidden === true && !achievement.unlocked
  const provenance = mergeProvenance(inherited, itemProvenance(achievement))
  const image = hidden
    ? undefined
    : assetImage(achievement.banner) || assetImage(achievement.background) || assetImage(achievement.icon)
  const imageHeight = image ? Math.min(bounds.height * 0.43, 340) : 0
  return node('achievement-detail', 'Panel', bounds, {
    provenance,
    style: { backgroundColor: '#171e26', borderRadius: 4 },
    children: [
      ...(image
        ? [node('achievement-detail-image', 'Image', {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: imageHeight,
          }, {
            image,
            provenance,
            style: { objectFit: 'cover' },
          })]
        : []),
      node('achievement-detail-title', 'Text', {
        x: bounds.x + 22,
        y: bounds.y + imageHeight + 22,
        width: bounds.width - 44,
        height: 44,
      }, {
        text: hidden ? 'Hidden Achievement' : achievement.title,
        style: { color: '#f4f6f9', fontSize: 30, fontWeight: 700 },
        provenance,
      }),
      node('achievement-detail-progress', 'Text', {
        x: bounds.x + 22,
        y: bounds.y + imageHeight + 72,
        width: bounds.width - 44,
        height: 34,
      }, {
        text: progressLabel(achievement),
        style: { color: achievement.unlocked ? '#dfbd68' : '#9ca7b4', fontSize: 20 },
        provenance,
      }),
      node('achievement-detail-summary', 'Text', {
        x: bounds.x + 22,
        y: bounds.y + imageHeight + 116,
        width: bounds.width - 44,
        height: Math.max(64, bounds.height - imageHeight - 138),
      }, {
        text: hidden
          ? achievement.summary ? 'Unlock to reveal details.' : ''
          : [achievement.summary, achievement.description].filter(Boolean).join('\n\n'),
        style: { color: '#c8ced6', fontSize: 20, whiteSpace: 'pre-wrap' },
        provenance,
      }),
    ],
  })
}

function createToastOverlay(
  context: NativeRendererFeatureSurfaceContext,
  notification: AchievementNotificationProjection,
  index: number,
  inherited: NativePackageProvenance,
) {
  const provenance = mergeProvenance(inherited, itemProvenance(notification))
  const width = Math.min(420, context.safeArea.width * 0.38)
  const height = 88
  const bounds = {
    x: context.safeArea.x + context.safeArea.width - width - 24,
    y: context.safeArea.y + 24 + index * (height + 14),
    width,
    height,
  }
  return {
    elementId: `achievement-toast-${notification.id}`,
    visible: true,
    renderMode: 'render-only' as const,
    interactive: true,
    overlayStack: stringValue(notification.overlayStack) || 'toast',
    stackPriority: finiteInteger(notification.stackPriority),
    zIndex: finiteInteger(notification.zIndex) ?? 0,
    surface: {
      key: ACHIEVEMENT_NATIVE_TOAST_SURFACE_KEY,
      root: node(`achievement-toast-root-${notification.id}`, 'Button', bounds, {
        text: [notification.title, notification.summary].filter(Boolean).join(' - '),
        image: assetImage(notification.icon),
        intent: uiIntent(ACTIONS.dismiss, {
          achievementId: notification.achievementId,
          notificationId: notification.id,
        }),
        provenance,
        style: {
          ...buttonStyle('#253140'),
          borderColor: '#c19a50',
          fontSize: 19,
          objectFit: 'cover',
        },
      }),
    },
    ...provenance,
  }
}

function progressLabel(achievement: AchievementProjectionItem): string {
  if (achievement.unlocked) {
    return 'Unlocked'
  }
  const max = achievement.maxProgress ?? achievement.progress?.maxValue
  return max !== undefined ? `${achievement.progress?.value || 0}/${max}` : 'Locked'
}

function assetImage(asset: { name: string, type: string } | undefined) {
  return asset?.type === 'images' && asset.name
    ? { assetName: asset.name, assetType: asset.type }
    : undefined
}

function centeredWindow(entries: readonly AchievementProjectionItem[], selectedId: string | undefined, size: number) {
  const selectedIndex = Math.max(0, entries.findIndex(item => item.id === selectedId))
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(size / 2), entries.length - size))
  return entries.slice(start, start + size)
}

function itemProvenance(item: { contentPackageId?: string, requiredRuntimePackages?: readonly string[] } | undefined) {
  return normalizeProvenance(item?.contentPackageId, item?.requiredRuntimePackages || [])
}

function node(
  id: string,
  kind: NativeUiSurfaceNodeProjection['kind'],
  bounds: NativeUiSurfaceRect,
  options: Omit<NativeUiSurfaceNodeProjection, 'bounds' | 'id' | 'kind' | 'visible'> = {},
): NativeUiSurfaceNodeProjection {
  return { id, kind, bounds, visible: true, ...options }
}

function uiIntent(action: string, metadata?: Record<string, boolean | string>) {
  return { action, event: 'ui/intent' as const, metadata }
}

function buttonStyle(backgroundColor: string) {
  return {
    backgroundColor,
    borderColor: '#65717f',
    borderRadius: 4,
    borderWidth: 1,
    color: '#f2f4f7',
    fontSize: 17,
    textAlign: 'center' as const,
  }
}

function stage(context: NativeRendererFeatureSurfaceContext): NativeUiSurfaceRect {
  return { x: 0, y: 0, width: context.logicalWidth, height: context.logicalHeight }
}

function inset(rect: NativeUiSurfaceRect, amount: number): NativeUiSurfaceRect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: Math.max(0, rect.width - amount * 2),
    height: Math.max(0, rect.height - amount * 2),
  }
}

function mergeProvenance(...items: readonly NativePackageProvenance[]) {
  return normalizeProvenance(
    items.map(item => item.contentPackageId).find(Boolean),
    items.flatMap(item => item.requiredRuntimePackages || []),
  )
}

function normalizeProvenance(contentPackageId: string | undefined, requiredRuntimePackages: readonly string[]) {
  const packages = [...new Set(requiredRuntimePackages.map(item => item.trim()).filter(Boolean))].sort()
  return {
    ...(contentPackageId ? { contentPackageId } : {}),
    ...(packages.length > 0 ? { requiredRuntimePackages: packages } : {}),
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Native achievement intent requires string payload field "${field}".`)
  }
  return value
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}
