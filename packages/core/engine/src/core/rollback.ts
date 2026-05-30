import type { QuaStore } from '@quajs/store'
import type { EventPayload, LogicToRenderEvents, RenderToLogicEvents } from '../events/events'
import type {
  EngineCheckpoint,
  GameStep,
  RollbackAnchor,
  RollbackAnchorReason,
  RollbackConfig,
  RollbackConfigPatch,
  RollbackContext,
  RollbackEntry,
  RollbackJournal,
  RollbackNavigationOptions,
  RollbackRecordedInput,
  RollbackSegment,
  RollbackSnapshotSet,
  RollbackTarget,
  RollbackTargetInfo,
  StoryPoint,
} from './types'

export const DEFAULT_ROLLBACK_CONFIG: RollbackConfig = {
  enabled: true,
  boundary: {
    scene: 'stop',
    chapter: 'stop',
  },
  checkpoints: {
    interval: 8,
    anchorOn: ['segment-start', 'choice', 'save', 'load', 'runtime-package', 'developer'],
  },
  forward: {
    preserveFuture: true,
    truncateOnDivergence: true,
  },
  saves: {
    includeRollbackHistory: true,
  },
}

interface RollbackStepBeginResult {
  entry: RollbackEntry
  anchorReason?: RollbackAnchorReason
}

interface RollbackControllerCallbacks {
  ensureRuntimePackages: (packageIds: readonly string[]) => Promise<void>
  resolveStep?: (entry: RollbackEntry) => Promise<GameStep | undefined>
  replayEntry: (entry: RollbackEntry, step: GameStep) => Promise<void>
  notifyRollback: (hook: 'onBeforeRollback' | 'onAfterRollback', context: RollbackContext) => Promise<void>
  emitFinalProjection: (point: StoryPoint) => Promise<void>
  hydrateCheckpoints: (checkpoints: EngineCheckpoint[], currentCheckpointId?: string) => void
  getProtectedCheckpointIds?: () => ReadonlySet<string>
}

interface ReplayState {
  direction: 'rollback' | 'forward'
  entry?: RollbackEntry
  inputOffset: number
}

interface SerializedRollbackEntry extends RollbackEntry {}

export interface RollbackStoreSaveData {
  state: unknown
  snapshots: unknown[]
}

export interface SerializedRollbackJournal {
  entries: SerializedRollbackEntry[]
  anchors: RollbackAnchor[]
  segments: RollbackSegment[]
  cursor: number
  liveTail: number
  currentSegmentId?: string
  fixedUntilEntryIndex?: number
}

export class RollbackController {
  private readonly stores = new Map<string, QuaStore>()
  private readonly stepRegistry = new Map<number, GameStep>()
  private readonly checkpoints = new Map<string, EngineCheckpoint>()
  private journal: RollbackJournal = createEmptyRollbackJournal()
  private activeEntryIndex?: number
  private replayState?: ReplayState
  private pendingBoundary?: { reason: string, metadata?: Record<string, unknown> }
  private snapshotCounter = 0
  private segmentCounter = 0

  constructor(
    private config: RollbackConfig,
    private readonly callbacks: RollbackControllerCallbacks,
  ) {}

  getConfig(): RollbackConfig {
    return cloneRollbackConfig(this.config)
  }

  setConfig(patch: RollbackConfigPatch): RollbackConfig {
    this.config = mergeRollbackConfig(this.config, patch)
    return this.getConfig()
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  registerStore(name: string, store: QuaStore): void {
    this.stores.set(name, store)
  }

  unregisterStore(name: string): void {
    this.stores.delete(name)
  }

  isReplaying(): boolean {
    return Boolean(this.replayState)
  }

  getJournal(): RollbackJournal {
    return cloneRollbackJournal(this.journal)
  }

  serialize(): SerializedRollbackJournal {
    return cloneRollbackJournal(this.journal)
  }

  hydrate(serialized: SerializedRollbackJournal | undefined, checkpoints: EngineCheckpoint[] = []): void {
    if (!serialized) {
      this.journal = createEmptyRollbackJournal()
      this.stepRegistry.clear()
      this.checkpoints.clear()
      this.snapshotCounter = 0
      this.segmentCounter = 0
      return
    }

    const previousSteps = new Map(
      Array.from(this.stepRegistry.values()).map(step => [step.uuid, step]),
    )
    this.journal = cloneRollbackJournal(serialized)
    this.segmentCounter = Math.max(0, ...this.journal.segments.map(segment => parseCounterSuffix(segment.id, 'rollback-segment:')))
    this.snapshotCounter = Math.max(0, ...this.journal.anchors.map(anchor => parseSnapshotSetCounter(anchor.snapshotSet.id)))
    this.remapStepRegistry(previousSteps)
    this.replaceKnownCheckpoints(checkpoints)
  }

  async beginStep(step: GameStep, point: StoryPoint): Promise<RollbackStepBeginResult | undefined> {
    if (!this.config.enabled || this.replayState) {
      return undefined
    }

    if (
      this.journal.cursor < this.journal.liveTail
      && this.config.forward.truncateOnDivergence
    ) {
      if (
        this.journal.fixedUntilEntryIndex !== undefined
        && this.journal.cursor <= this.journal.fixedUntilEntryIndex
      ) {
        throw new Error('Cannot diverge inside fixed rollback history. Roll forward past the fixed range first.')
      }
      await this.truncateAfter(this.journal.cursor)
      this.hydrateKnownCheckpoints()
    }

    const segment = this.resolveSegment(point)
    const entryIndex = this.journal.entries.length
    const metadata = cloneUnknownRecord(step.metadata as Record<string, unknown> | undefined)
    const entry: RollbackEntry = {
      entryIndex,
      stepId: step.uuid,
      point: cloneStoryPoint(point),
      segmentId: segment.id,
      requiredRuntimePackages: mergeStrings(
        asStringArray(step.metadata?.requiredRuntimePackages),
        runtimePackagesFromPoint(point),
      ),
      inputs: [],
      replayable: true,
      decision: false,
      fixed: false,
      source: step.metadata?.runtimePackage
        ? {
            runtimePackageId: step.metadata.runtimePackage.packageId,
            scriptModuleId: step.metadata.runtimePackage.scriptModuleId,
            scriptModuleVersion: step.metadata.runtimePackage.scriptModuleVersion,
            scriptModuleLocale: step.metadata.runtimePackage.scriptModuleLocale,
          }
        : undefined,
      metadata,
    }

    this.journal.entries.push(entry)
    this.journal.cursor = entryIndex
    this.journal.liveTail = entryIndex
    this.activeEntryIndex = entryIndex
    this.stepRegistry.set(entryIndex, step)
    if (await this.pruneClosedSegmentAnchors()) {
      this.hydrateKnownCheckpoints()
    }

    const anchorReason = this.resolveStepAnchorReason(entry, segment)
    return { entry: cloneRollbackEntry(entry), anchorReason }
  }

  completeStep(): void {
    if (!this.replayState) {
      this.activeEntryIndex = undefined
    }
  }

  registerStepAnchor(
    checkpoint: EngineCheckpoint,
    reason: RollbackAnchorReason | string,
    snapshotSet: RollbackSnapshotSet,
    metadata?: Record<string, unknown>,
    replayStartEntryIndex?: number,
    replayable = true,
  ): RollbackAnchor | undefined {
    if (!this.config.enabled || this.replayState) {
      return undefined
    }
    const entryIndex = this.activeEntryIndex ?? this.journal.cursor
    const entry = this.journal.entries[entryIndex]
    if (!entry) {
      return undefined
    }

    return this.insertAnchor({
      id: checkpoint.id,
      entryIndex,
      replayStartEntryIndex: replayStartEntryIndex ?? entryIndex,
      segmentId: entry.segmentId,
      reason,
      replayable,
      snapshotSet,
      checkpointId: checkpoint.id,
      metadata,
    }, checkpoint)
  }

  getCurrentEntryIndex(): number | undefined {
    return this.activeEntryIndex ?? this.currentEntry()?.entryIndex
  }

  hasActiveEntry(): boolean {
    return this.activeEntryIndex !== undefined
  }

  async createSnapshotSet(idHint: string): Promise<RollbackSnapshotSet> {
    const id = `${idHint}:set:${++this.snapshotCounter}`
    const snapshotBase = sanitizeSnapshotPart(id)
    const storeSnapshots: Record<string, string> = {}
    const entries = Array.from(this.stores.entries())
    if (entries.length === 0) {
      throw new Error('Rollback requires at least one registered QuaStore.')
    }

    const createdSnapshots: Array<{ store: QuaStore, snapshotId: string }> = []
    try {
      for (const [name, store] of entries) {
        const snapshotId = entries.length === 1
          ? snapshotBase
          : `${snapshotBase}:${sanitizeSnapshotPart(name)}`
        storeSnapshots[name] = await store.snapshot(snapshotId)
        createdSnapshots.push({ store, snapshotId: storeSnapshots[name] })
      }
      return {
        id,
        storeSnapshots,
        createdAt: Date.now(),
      }
    }
    catch (error) {
      await Promise.allSettled(
        createdSnapshots.map(({ store, snapshotId }) => deleteStoreSnapshot(store, snapshotId)),
      )
      throw error
    }
  }

  async restoreSnapshotSet(snapshotSet: RollbackSnapshotSet): Promise<void> {
    for (const [name, snapshotId] of Object.entries(snapshotSet.storeSnapshots)) {
      const store = this.stores.get(name)
      if (!store) {
        throw new Error(`Rollback snapshot set "${snapshotSet.id}" references unregistered store "${name}".`)
      }
      await store.restore(snapshotId, { force: true })
    }
  }

  async deleteSnapshotSet(snapshotSet: RollbackSnapshotSet): Promise<void> {
    await Promise.all(Object.entries(snapshotSet.storeSnapshots).map(async ([name, snapshotId]) => {
      const store = this.stores.get(name)
      if (!store) {
        return
      }
      await deleteStoreSnapshot(store, snapshotId)
    }))
  }

  async exportStoreSaveData(primaryStoreName: string): Promise<Record<string, RollbackStoreSaveData>> {
    const output: Record<string, RollbackStoreSaveData> = {}
    for (const [name, store] of this.stores.entries()) {
      if (name === primaryStoreName) {
        continue
      }
      output[name] = await getStoreSaveDataExporter(store)()
    }
    return output
  }

  async importStoreSaveData(data: Record<string, RollbackStoreSaveData> | undefined, options: { force?: boolean } = {}): Promise<void> {
    if (!data) {
      return
    }
    for (const [name, saveData] of Object.entries(data)) {
      const store = this.stores.get(name)
      if (!store) {
        throw new Error(`Save rollback data references unregistered store "${name}".`)
      }
      await getStoreSaveDataImporter(store)(saveData, options)
    }
  }

  recordInput(event: LogicToRenderEvents | RenderToLogicEvents | string, payload: unknown): void {
    if (!this.config.enabled || this.replayState || this.activeEntryIndex === undefined) {
      return
    }
    const entry = this.journal.entries[this.activeEntryIndex]
    if (!entry) {
      return
    }

    entry.inputs.push({
      event: String(event),
      payload: cloneUnknownValue(payload),
    })
    if (String(event) === 'user/choice_select') {
      entry.decision = true
    }
  }

  consumeReplayInput<T extends LogicToRenderEvents | RenderToLogicEvents>(
    event: T,
    matcher?: (payload: EventPayload<T>) => boolean,
  ): EventPayload<T> {
    if (!this.replayState?.entry) {
      throw new Error(`Rollback replay cannot provide "${String(event)}" outside a replayed entry.`)
    }

    const inputs = this.replayState.entry.inputs
    for (let index = this.replayState.inputOffset; index < inputs.length; index++) {
      const input = inputs[index]
      if (input.event !== String(event)) {
        continue
      }
      const payload = cloneUnknownValue(input.payload) as EventPayload<T>
      if (matcher && !matcher(payload)) {
        continue
      }
      this.replayState.inputOffset = index + 1
      return payload
    }

    throw new Error(`Rollback replay is missing recorded input for "${String(event)}" at step "${this.replayState.entry.stepId}".`)
  }

  getTargets(): RollbackTargetInfo[] {
    const current = this.currentEntry()
    if (!current) {
      return []
    }
    return this.journal.entries
      .filter(entry =>
        entry.entryIndex < this.journal.cursor
        && entry.segmentId === current.segmentId
        && entry.replayable,
      )
      .map(toTargetInfo)
  }

  canRollback(): boolean {
    return this.getTargets().length > 0
  }

  canRollForward(): boolean {
    return this.journal.cursor < this.journal.liveTail
      && Boolean(this.journal.entries[this.journal.cursor + 1])
  }

  hasTarget(target: RollbackTarget): boolean {
    return this.resolveTargetIndex(target, 'rollback', false) !== undefined
  }

  async rollback(target?: RollbackTarget, options: RollbackNavigationOptions = {}): Promise<void> {
    await this.navigate('rollback', target, options)
  }

  async rollForward(target?: RollbackTarget, options: RollbackNavigationOptions = {}): Promise<void> {
    await this.navigate('forward', target, options)
  }

  async createManualAnchor(reason: RollbackAnchorReason | string = 'developer', metadata?: Record<string, unknown>): Promise<{ reason: RollbackAnchorReason | string, metadata?: Record<string, unknown> } | undefined> {
    if (!this.config.enabled || this.replayState) {
      return undefined
    }
    if (!this.currentEntry()) {
      return undefined
    }
    return { reason, metadata }
  }

  async markBoundary(reason = 'developer', metadata?: Record<string, unknown>): Promise<void> {
    if (!this.config.enabled || this.replayState) {
      return
    }
    const current = this.currentEntry()
    if (current) {
      this.closeSegment(current.segmentId)
      const nextSegment = this.startSegment(current.point, reason, current.entryIndex)
      current.segmentId = nextSegment.id
      for (const anchor of this.journal.anchors) {
        if (anchor.entryIndex === current.entryIndex) {
          anchor.segmentId = nextSegment.id
        }
      }
      for (const checkpoint of this.checkpoints.values()) {
        if (checkpoint.point.stepId === current.stepId) {
          checkpoint.point = cloneStoryPoint(current.point)
        }
      }
      void metadata
      return
    }
    this.pendingBoundary = { reason, metadata }
  }

  fixRollback(metadata?: Record<string, unknown>): void {
    void metadata
    if (!this.config.enabled) {
      return
    }
    this.journal.fixedUntilEntryIndex = this.journal.cursor
    for (const entry of this.journal.entries) {
      if (entry.entryIndex <= this.journal.cursor) {
        entry.fixed = true
      }
    }
  }

  hydrateKnownCheckpoints(): void {
    const currentAnchor = this.findNearestAnchor(this.journal.cursor)
    this.callbacks.hydrateCheckpoints(
      this.getHydratableCheckpoints(),
      currentAnchor?.checkpointId,
    )
  }

  private async navigate(
    direction: 'rollback' | 'forward',
    target: RollbackTarget | undefined,
    options: RollbackNavigationOptions,
  ): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Rollback is disabled.')
    }

    const targetIndex = this.resolveTargetIndex(target, direction, true)
    const targetEntry = this.journal.entries[targetIndex]
    if (!targetEntry) {
      throw new Error('Unable to resolve rollback target.')
    }
    if (!targetEntry.replayable && !options.force) {
      throw new Error(`Rollback target "${targetEntry.stepId}" is not replayable.`)
    }
    const current = this.currentEntry()
    if (direction === 'rollback' && current && targetEntry.segmentId !== current.segmentId && !options.force) {
      throw new Error(`Rollback target "${targetEntry.stepId}" is outside the current rollback boundary.`)
    }

    const anchor = this.findNearestAnchor(targetIndex)
    if (!anchor) {
      throw new Error(`Rollback target "${targetEntry.stepId}" has no retained checkpoint anchor.`)
    }
    const replayStart = Math.max(0, anchor.replayStartEntryIndex ?? anchor.entryIndex)
    const replayEntries = replayStart <= targetIndex
      ? this.journal.entries.slice(replayStart, targetIndex + 1)
      : []
    const replayInfos = replayEntries.map(toTargetInfo)
    const context: RollbackContext = {
      direction,
      reason: options.reason,
      target: toTargetInfo(targetEntry),
      anchor: cloneRollbackAnchor(anchor),
      replayedEntries: replayInfos,
    }

    const origin = await this.createSnapshotSet(`rollback-origin:${Date.now()}`)
    try {
      await this.callbacks.ensureRuntimePackages(mergeStrings(
        targetEntry.requiredRuntimePackages,
        ...replayEntries.map(entry => entry.requiredRuntimePackages),
        anchor.metadata?.requiredRuntimePackages,
      ))
      await this.callbacks.notifyRollback('onBeforeRollback', context)
      await this.restoreSnapshotSet(anchor.snapshotSet)
      this.hydrateKnownCheckpoints()
      this.replayState = { direction, inputOffset: 0 }
      for (const entry of replayEntries) {
        const step = await this.resolveReplayStep(entry)
        if (!step) {
          throw new Error(`Rollback replay cannot resolve step "${entry.stepId}".`)
        }
        this.replayState.entry = entry
        this.replayState.inputOffset = 0
        await this.callbacks.replayEntry(entry, step)
      }
      this.replayState = undefined
      this.journal.cursor = targetIndex
      this.journal.currentSegmentId = targetEntry.segmentId
      if (direction === 'rollback' && !this.config.forward.preserveFuture) {
        await this.truncateAfter(targetIndex)
      }
      this.hydrateKnownCheckpoints()
      await this.callbacks.notifyRollback('onAfterRollback', context)
      await this.callbacks.emitFinalProjection(targetEntry.point)
    }
    catch (error) {
      this.replayState = undefined
      await this.restoreSnapshotSet(origin)
      this.hydrateKnownCheckpoints()
      throw error
    }
    finally {
      await this.deleteSnapshotSet(origin)
    }
  }

  private resolveTargetIndex(
    target: RollbackTarget | undefined,
    direction: 'rollback' | 'forward',
    throwOnMissing: true,
  ): number
  private resolveTargetIndex(
    target: RollbackTarget | undefined,
    direction: 'rollback' | 'forward',
    throwOnMissing: false,
  ): number | undefined
  private resolveTargetIndex(
    target: RollbackTarget | undefined,
    direction: 'rollback' | 'forward',
    throwOnMissing: boolean,
  ): number | undefined {
    let index: number | undefined
    if (target === undefined) {
      index = direction === 'rollback'
        ? this.journal.cursor - 1
        : this.journal.cursor + 1
    }
    else if (typeof target === 'number') {
      index = target
    }
    else if (typeof target === 'string') {
      index = this.journal.entries.find(entry => entry.stepId === target)?.entryIndex
    }
    else if ('entryIndex' in target || 'point' in target) {
      if (typeof target.entryIndex === 'number') {
        index = target.entryIndex
      }
      else {
        const point = target.point
        if (point) {
          index = this.journal.entries.find(entry => storyPointMatches(entry.point, point))?.entryIndex
        }
      }
    }
    else {
      index = this.journal.entries.find(entry => storyPointMatches(entry.point, target as StoryPoint))?.entryIndex
    }

    const entry = typeof index === 'number' ? this.journal.entries[index] : undefined
    const valid = entry
      && (direction === 'forward'
        ? index! > this.journal.cursor && index! <= this.journal.liveTail
        : index! < this.journal.cursor)
    if (valid) {
      return index
    }
    if (throwOnMissing) {
      throw new Error(`Unable to resolve ${direction === 'forward' ? 'roll-forward' : 'rollback'} target.`)
    }
    return undefined
  }

  private resolveSegment(point: StoryPoint): RollbackSegment {
    const current = this.currentSegment()
    const previous = this.currentEntry()
    const pendingBoundary = this.pendingBoundary
    if (!current || pendingBoundary) {
      this.pendingBoundary = undefined
      return this.startSegment(point, pendingBoundary?.reason || 'segment-start')
    }

    if (
      this.config.boundary.scene === 'stop'
      && previous?.point.sceneId
      && point.sceneId
      && previous.point.sceneId !== point.sceneId
    ) {
      this.closeSegment(current.id)
      return this.startSegment(point, 'scene')
    }

    if (
      this.config.boundary.chapter === 'stop'
      && previous?.point.chapterId
      && point.chapterId
      && previous.point.chapterId !== point.chapterId
    ) {
      this.closeSegment(current.id)
      return this.startSegment(point, 'chapter')
    }

    return current
  }

  private startSegment(point: StoryPoint, reason: string, startEntryIndex = this.journal.entries.length): RollbackSegment {
    const segment: RollbackSegment = {
      id: `rollback-segment:${++this.segmentCounter}`,
      startEntryIndex,
      reason,
      sceneId: point.sceneId,
      chapterId: point.chapterId,
      createdAt: Date.now(),
    }
    this.journal.segments.push(segment)
    this.journal.currentSegmentId = segment.id
    return segment
  }

  private closeSegment(segmentId: string): void {
    const segment = this.journal.segments.find(item => item.id === segmentId)
    if (segment && !segment.closedAt) {
      segment.closedAt = Date.now()
    }
  }

  private resolveStepAnchorReason(entry: RollbackEntry, segment: RollbackSegment): RollbackAnchorReason | undefined {
    const segmentEntryCount = this.journal.entries.filter(item => item.segmentId === segment.id).length
    if (segmentEntryCount === 1 && this.shouldAnchorOn('segment-start')) {
      return 'segment-start'
    }

    const interval = Math.max(1, Math.floor(this.config.checkpoints.interval || 1))
    if ((segmentEntryCount - 1) % interval === 0) {
      return 'interval'
    }

    if (entry.requiredRuntimePackages.length > 0 && this.shouldAnchorOn('runtime-package')) {
      const previous = this.journal.entries[entry.entryIndex - 1]
      const previousPackages = previous?.requiredRuntimePackages || []
      if (entry.requiredRuntimePackages.some(packageId => !previousPackages.includes(packageId))) {
        return 'runtime-package'
      }
    }

    return undefined
  }

  private shouldAnchorOn(reason: RollbackAnchorReason): boolean {
    return this.config.checkpoints.anchorOn.includes(reason)
  }

  private insertAnchor(anchor: RollbackAnchor, checkpoint?: EngineCheckpoint): RollbackAnchor {
    const existing = this.journal.anchors.findIndex(item => item.id === anchor.id)
    const cloned = cloneRollbackAnchor(anchor)
    if (existing >= 0) {
      this.journal.anchors[existing] = cloned
    }
    else {
      this.journal.anchors.push(cloned)
    }
    this.journal.anchors.sort((a, b) => a.entryIndex - b.entryIndex)
    if (checkpoint) {
      this.checkpoints.set(checkpoint.id, cloneCheckpoint(checkpoint))
    }
    return cloneRollbackAnchor(cloned)
  }

  private async resolveReplayStep(entry: RollbackEntry): Promise<GameStep | undefined> {
    const registered = this.stepRegistry.get(entry.entryIndex)
    if (registered) {
      return registered
    }
    const resolved = await this.callbacks.resolveStep?.(cloneRollbackEntry(entry))
    if (resolved) {
      this.stepRegistry.set(entry.entryIndex, resolved)
    }
    return resolved
  }

  private getHydratableCheckpoints(): EngineCheckpoint[] {
    const visibleCheckpointIds = new Set(
      this.journal.anchors
        .filter(anchor => anchor.entryIndex <= this.journal.cursor)
        .map(anchor => anchor.checkpointId)
        .filter((id): id is string => Boolean(id)),
    )
    return Array.from(this.checkpoints.values())
      .filter(checkpoint => visibleCheckpointIds.has(checkpoint.id))
  }

  private remapStepRegistry(previousSteps: Map<string, GameStep>): void {
    this.stepRegistry.clear()
    for (const entry of this.journal.entries) {
      const step = previousSteps.get(entry.stepId)
      if (step) {
        this.stepRegistry.set(entry.entryIndex, step)
      }
    }
  }

  private replaceKnownCheckpoints(checkpoints: EngineCheckpoint[]): void {
    this.checkpoints.clear()
    for (const checkpoint of checkpoints) {
      this.checkpoints.set(checkpoint.id, cloneCheckpoint(checkpoint))
    }
  }

  private findNearestAnchor(entryIndex: number): RollbackAnchor | undefined {
    const entry = this.journal.entries[entryIndex]
    if (!entry) {
      return undefined
    }

    for (let index = this.journal.anchors.length - 1; index >= 0; index--) {
      const anchor = this.journal.anchors[index]
      const replayStart = anchor.replayStartEntryIndex ?? anchor.entryIndex
      if (
        anchor.replayable === false
        && anchor.segmentId === entry.segmentId
        && anchor.entryIndex === entryIndex
        && anchor.reason === 'choice'
        && replayStart > entryIndex
      ) {
        return anchor
      }
    }

    for (let index = this.journal.anchors.length - 1; index >= 0; index--) {
      const anchor = this.journal.anchors[index]
      if (anchor.replayable !== false && anchor.segmentId === entry.segmentId && anchor.entryIndex <= entryIndex) {
        return anchor
      }
    }
    return undefined
  }

  private currentEntry(): RollbackEntry | undefined {
    return this.journal.entries[this.journal.cursor]
  }

  private currentSegment(): RollbackSegment | undefined {
    const segmentId = this.journal.currentSegmentId
    return segmentId ? this.journal.segments.find(segment => segment.id === segmentId) : undefined
  }

  private async truncateAfter(entryIndex: number): Promise<void> {
    const removedAnchors = this.journal.anchors.filter(anchor => anchor.entryIndex > entryIndex)
    this.journal.entries = this.journal.entries.filter(entry => entry.entryIndex <= entryIndex)
    this.journal.anchors = this.journal.anchors.filter(anchor => anchor.entryIndex <= entryIndex)
    this.journal.segments = this.journal.segments.filter(segment => segment.startEntryIndex <= entryIndex)
    this.journal.liveTail = Math.min(this.journal.liveTail, entryIndex)
    this.journal.currentSegmentId = this.currentEntry()?.segmentId
    for (const anchor of removedAnchors) {
      await this.deleteSnapshotSet(anchor.snapshotSet)
      if (anchor.checkpointId) {
        this.checkpoints.delete(anchor.checkpointId)
      }
    }
    for (const key of Array.from(this.stepRegistry.keys())) {
      if (key > entryIndex) {
        this.stepRegistry.delete(key)
      }
    }
  }

  private async pruneClosedSegmentAnchors(): Promise<boolean> {
    const currentSegmentId = this.journal.currentSegmentId
    const closedSegmentIds = new Set(
      this.journal.segments
        .filter(segment => segment.closedAt && segment.id !== currentSegmentId)
        .map(segment => segment.id),
    )
    if (closedSegmentIds.size === 0) {
      return false
    }
    const protectedCheckpointIds = this.callbacks.getProtectedCheckpointIds?.() || new Set<string>()
    const removedAnchors = this.journal.anchors.filter(anchor =>
      closedSegmentIds.has(anchor.segmentId)
      && (!anchor.checkpointId || !protectedCheckpointIds.has(anchor.checkpointId)),
    )
    if (removedAnchors.length === 0) {
      return false
    }

    const removedAnchorIds = new Set(removedAnchors.map(anchor => anchor.id))
    this.journal.anchors = this.journal.anchors.filter(anchor => !removedAnchorIds.has(anchor.id))
    for (const anchor of removedAnchors) {
      await this.deleteSnapshotSet(anchor.snapshotSet)
      if (anchor.checkpointId && !protectedCheckpointIds.has(anchor.checkpointId)) {
        this.checkpoints.delete(anchor.checkpointId)
      }
    }
    return true
  }
}

export function mergeRollbackConfig(
  base: RollbackConfig = DEFAULT_ROLLBACK_CONFIG,
  patch: RollbackConfigPatch = {},
): RollbackConfig {
  const interval = patch.checkpoints?.interval ?? base.checkpoints.interval
  return {
    enabled: patch.enabled ?? base.enabled,
    boundary: {
      ...base.boundary,
      ...(patch.boundary || {}),
    },
    checkpoints: {
      interval: Math.max(1, Math.floor(interval || 1)),
      anchorOn: [...(patch.checkpoints?.anchorOn || base.checkpoints.anchorOn)],
    },
    forward: {
      ...base.forward,
      ...(patch.forward || {}),
    },
    saves: {
      ...base.saves,
      ...(patch.saves || {}),
    },
  }
}

export function createRollbackConfig(patch: RollbackConfigPatch = {}): RollbackConfig {
  return mergeRollbackConfig(DEFAULT_ROLLBACK_CONFIG, patch)
}

export function isSerializedRollbackJournal(value: unknown): value is SerializedRollbackJournal {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<SerializedRollbackJournal>
  return Array.isArray(candidate.entries)
    && Array.isArray(candidate.anchors)
    && Array.isArray(candidate.segments)
    && typeof candidate.cursor === 'number'
    && typeof candidate.liveTail === 'number'
}

function createEmptyRollbackJournal(): RollbackJournal {
  return {
    entries: [],
    anchors: [],
    segments: [],
    cursor: -1,
    liveTail: -1,
  }
}

function toTargetInfo(entry: RollbackEntry): RollbackTargetInfo {
  return {
    entryIndex: entry.entryIndex,
    stepId: entry.stepId,
    point: cloneStoryPoint(entry.point),
    segmentId: entry.segmentId,
    fixed: entry.fixed,
    decision: entry.decision,
    requiredRuntimePackages: [...entry.requiredRuntimePackages],
  }
}

function cloneRollbackConfig(config: RollbackConfig): RollbackConfig {
  return {
    enabled: config.enabled,
    boundary: { ...config.boundary },
    checkpoints: {
      interval: config.checkpoints.interval,
      anchorOn: [...config.checkpoints.anchorOn],
    },
    forward: { ...config.forward },
    saves: { ...config.saves },
  }
}

function cloneRollbackJournal(journal: RollbackJournal): RollbackJournal {
  return {
    entries: journal.entries.map(cloneRollbackEntry),
    anchors: journal.anchors.map(cloneRollbackAnchor),
    segments: journal.segments.map(segment => ({ ...segment })),
    cursor: journal.cursor,
    liveTail: journal.liveTail,
    currentSegmentId: journal.currentSegmentId,
    fixedUntilEntryIndex: journal.fixedUntilEntryIndex,
  }
}

function cloneRollbackEntry(entry: RollbackEntry): RollbackEntry {
  return {
    ...entry,
    point: cloneStoryPoint(entry.point),
    requiredRuntimePackages: [...entry.requiredRuntimePackages],
    inputs: entry.inputs.map(cloneRecordedInput),
    source: entry.source ? { ...entry.source } : undefined,
    metadata: entry.metadata ? cloneUnknownRecord(entry.metadata) : undefined,
  }
}

function cloneRecordedInput(input: RollbackRecordedInput): RollbackRecordedInput {
  return {
    event: input.event,
    payload: cloneUnknownValue(input.payload),
  }
}

function cloneRollbackAnchor(anchor: RollbackAnchor): RollbackAnchor {
  return {
    ...anchor,
    replayStartEntryIndex: anchor.replayStartEntryIndex ?? anchor.entryIndex,
    snapshotSet: {
      ...anchor.snapshotSet,
      storeSnapshots: { ...anchor.snapshotSet.storeSnapshots },
    },
    metadata: anchor.metadata ? cloneUnknownRecord(anchor.metadata) : undefined,
  }
}

function cloneCheckpoint(checkpoint: EngineCheckpoint): EngineCheckpoint {
  return {
    ...checkpoint,
    point: cloneStoryPoint(checkpoint.point),
    metadata: checkpoint.metadata ? cloneUnknownRecord(checkpoint.metadata) : undefined,
  }
}

function cloneStoryPoint(point: StoryPoint): StoryPoint {
  return { ...point }
}

function cloneUnknownRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined
  }
  return cloneUnknownValue(value) as Record<string, unknown>
}

function cloneUnknownValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneUnknownValue(item)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneUnknownValue(item)]),
    ) as T
  }
  return value
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function runtimePackagesFromPoint(point: StoryPoint): string[] {
  return mergeStrings(
    point.contentPackageId ? [point.contentPackageId] : [],
    point.requiredRuntimePackages,
  )
}

function mergeStrings(...values: unknown[]): string[] {
  const output: string[] = []
  for (const value of values) {
    if (typeof value === 'string') {
      if (!output.includes(value)) {
        output.push(value)
      }
      continue
    }
    if (!Array.isArray(value)) {
      continue
    }
    for (const item of value) {
      if (typeof item === 'string' && !output.includes(item)) {
        output.push(item)
      }
    }
  }
  return output
}

function storyPointMatches(point: StoryPoint, target: StoryPoint): boolean {
  return Object.entries(target).every(([key, value]) => {
    if (value === undefined) {
      return true
    }
    return point[key as keyof StoryPoint] === value
  })
}

function sanitizeSnapshotPart(value: string): string {
  return value.replace(/[^\w.:-]/g, '_')
}

function parseCounterSuffix(value: string, prefix: string): number {
  if (!value.startsWith(prefix)) {
    return 0
  }
  const parsed = Number(value.slice(prefix.length))
  return Number.isFinite(parsed) ? parsed : 0
}

function parseSnapshotSetCounter(value: string): number {
  const match = value.match(/:set:(\d+)$/)
  if (!match) {
    return 0
  }
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : 0
}

async function deleteStoreSnapshot(store: QuaStore, snapshotId: string): Promise<void> {
  const snapshotStore = store as QuaStore & {
    deleteSnapshot?: (id: string) => Promise<void>
  }
  if (typeof snapshotStore.deleteSnapshot !== 'function') {
    return
  }
  await snapshotStore.deleteSnapshot(snapshotId)
}

function getStoreSaveDataExporter(store: QuaStore): () => Promise<RollbackStoreSaveData> {
  return store.exportSaveData.bind(store) as () => Promise<RollbackStoreSaveData>
}

function getStoreSaveDataImporter(store: QuaStore): (data: RollbackStoreSaveData, options?: { force?: boolean }) => Promise<void> {
  return store.importSaveData.bind(store) as (data: RollbackStoreSaveData, options?: { force?: boolean }) => Promise<void>
}
