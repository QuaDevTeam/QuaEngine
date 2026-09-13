/** Platform-neutral, stateless UI presentation. No resources, store, or event routing. */
export type MenuActionId = 'continue' | 'save' | 'load' | 'settings' | 'backlog' | 'title'
export function createMenuActionPresentation(options: {
  showBacklog?: boolean
  showTitle?: boolean
  titleActionLabel?: string
} = {}): readonly { id: MenuActionId, label: string }[] {
  return [
    { id: 'continue', label: 'Continue' },
    { id: 'save', label: 'Save' },
    { id: 'load', label: 'Load' },
    { id: 'settings', label: 'Settings' },
    ...(options.showBacklog === false ? [] : [{ id: 'backlog', label: 'Backlog' }]),
    ...(options.showTitle === false ? [] : [{ id: 'title', label: options.titleActionLabel || 'Title' }]),
  ] as { id: MenuActionId, label: string }[]
}

export interface SaveSlotGridOptions {
  slots?: readonly SaveSlotProjection[]
  slotCount?: number
  slotPrefix?: string
}
const DEFAULT_SAVE_SLOT_COUNT = 12

export interface SaveSlotProjection {
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

export function createSaveSlotGrid(config: SaveSlotGridOptions | undefined, listedSlots: readonly SaveSlotProjection[] = []): SaveSlotProjection[] {
  const byId = new Map([...listedSlots, ...(config?.slots || [])].map(slot => [slot.slotId, slot]))
  const requestedCount = config?.slotCount
  const count = Math.max(
    typeof requestedCount === 'number' && Number.isFinite(requestedCount)
      ? Math.max(0, Math.floor(requestedCount)) : DEFAULT_SAVE_SLOT_COUNT,
    config?.slots?.length || 0,
  )
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

export function saveSlotMeta(slot: SaveSlotProjection): string {
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

export function saveSlotDisplayName(slot: SaveSlotProjection, index: number): string {
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

export function isFilledSaveSlot(slot: SaveSlotProjection): boolean {
  return Boolean(
    slot.timestamp != null
    || slot.name
    || slot.preview
    || (slot.previewStatus && slot.previewStatus !== 'none')
    || slot.metadata?.sceneName
    || slot.metadata?.stepId,
  )
}

export function previewStatusLabel(slot: SaveSlotProjection, filled: boolean): string {
  if (slot.previewStatus === 'pending') {
    return 'Pending'
  }
  if (slot.previewStatus === 'error') {
    return 'Retry'
  }
  return filled ? 'Saved' : 'Empty'
}

function formatTimestamp(timestamp: SaveSlotProjection['timestamp']): string | undefined {
  if (timestamp == null) {
    return undefined
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
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

