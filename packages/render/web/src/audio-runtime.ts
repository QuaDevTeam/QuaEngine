import type { AssetChange, QuaAssets } from '@quajs/assets'
import type {
  AudioAutomationProjection,
  AudioBusId,
  AudioEqBand,
  AudioRenderToLogicEvent,
  AudioRenderToLogicEventPayloadMap,
  AudioTrackEventPayload,
  AudioTrackProjection,
  AudioViewProjection,
} from '@quajs/plugin-audio/contracts'
import {
  AudioRenderToLogicEvents,
  cloneAudioProjection,
  createInitialAudioProjection,
  dbToGain,
} from '@quajs/plugin-audio/contracts'

interface AudioRuntimeCallbacks {
  emit: <T extends AudioRenderToLogicEvent>(
    type: T,
    payload: AudioRenderToLogicEventPayloadMap[T],
  ) => Promise<void> | void
}

interface SlotRuntime {
  kind: AudioTrackProjection['kind']
  source?: AudioBufferSourceNode
  gainNode: GainNode
  eqNodes: BiquadFilterNode[]
  controlSignature?: string
  fxSignature?: string
  offsetSeconds: number
  startedAt?: number
  currentTrack?: AudioTrackProjection
  stopReason?: string
  pendingStart?: boolean
  staleBuffer?: boolean
  assetKey?: string
  targetPackageId?: string
  generation: number
}

interface BusRuntime {
  input: GainNode
  eqNodes: BiquadFilterNode[]
  gainNode: GainNode
}

export class WebAudioAudioRuntime {
  private context?: AudioContext
  private masterGain?: GainNode
  private masterEqNodes: BiquadFilterNode[] = []
  private readonly buses: Record<AudioBusId, BusRuntime | undefined> = {
    master: undefined,
    bgm: undefined,
    voice: undefined,
    sfx: undefined,
    ambient: undefined,
  }

  private readonly singleSlots: Record<'bgm' | 'voice', SlotRuntime | undefined> = {
    bgm: undefined,
    voice: undefined,
  }

  private readonly collectionSlots: Record<'sfx' | 'ambient', Map<string, SlotRuntime>> = {
    sfx: new Map(),
    ambient: new Map(),
  }

  private readonly bufferCache = new Map<string, Promise<AudioBuffer>>()
  private projection = createInitialAudioProjection()
  private destroyed = false
  private unlocked = false
  private autoResumeAttempted = false

  constructor(
    private readonly assets: () => QuaAssets | undefined,
    private readonly callbacks: AudioRuntimeCallbacks,
  ) {}

  get isUnlocked(): boolean {
    return this.unlocked
  }

  async sync(nextProjection: AudioViewProjection): Promise<void> {
    if (this.destroyed) {
      return
    }

    const context = this.ensureContext()
    await this.markUnlockedIfRunning(context)
    this.projection = cloneAudioProjection(nextProjection || createInitialAudioProjection())

    this.syncBus('master', this.projection.buses.master)
    this.syncBus('bgm', this.projection.buses.bgm)
    this.syncBus('voice', this.projection.buses.voice)
    this.syncBus('sfx', this.projection.buses.sfx)
    this.syncBus('ambient', this.projection.buses.ambient)

    await this.syncSingleTrack('bgm', this.projection.bgm)
    await this.syncSingleTrack('voice', selectActiveVoice(this.projection.voices))
    await this.syncTrackCollection('sfx', this.projection.sfx)
    await this.syncTrackCollection('ambient', this.projection.ambients)
  }

  async unlock(): Promise<boolean> {
    const context = this.ensureContext()
    if (context.state !== 'running') {
      try {
        await context.resume()
      }
      catch {
        return false
      }
    }
    return await this.markUnlockedIfRunning(context)
  }

  async tryAutoUnlock(): Promise<boolean> {
    const context = this.ensureContext()
    const unlocked = await this.markUnlockedIfRunning(context)
    if (unlocked || this.unlocked || this.autoResumeAttempted || context.state === 'closed') {
      return unlocked
    }

    this.autoResumeAttempted = true
    void context.resume()
      .then(() => this.markUnlockedIfRunning(context))
      .catch(() => {
        // Browser autoplay policy blocks are expected. Keep sources pending until a user gesture unlocks audio.
      })
    return false
  }

  interruptVoice(reason = 'user-advance'): AudioTrackEventPayload[] {
    const slot = this.singleSlots.voice
    const currentTrack = slot?.currentTrack
    if (!slot || !currentTrack || currentTrack.interruptible === false) {
      return []
    }

    const payload = this.createTrackPayload(currentTrack, reason)
    this.stopSlot(slot, 0, reason, true)
    return [payload]
  }

  handleAssetChange(change: AssetChange): void {
    const assetKey = this.resolveAssetKey(change)
    if (!assetKey) {
      return
    }

    if (change.assetId.startsWith('locale:')) {
      this.bufferCache.clear()
      for (const slot of this.getAllSlots()) {
        if (slot) {
          slot.staleBuffer = true
        }
      }
      return
    }

    for (const key of this.bufferCache.keys()) {
      if (key === assetKey || key.startsWith(`${assetKey}::`)) {
        this.bufferCache.delete(key)
      }
    }
    for (const slot of this.getAllSlots()) {
      if (slot?.assetKey === assetKey) {
        slot.staleBuffer = true
      }
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    for (const slot of this.getAllSlots()) {
      this.stopSlot(slot, 0, 'destroy', true)
    }
    this.collectionSlots.sfx.clear()
    this.collectionSlots.ambient.clear()
    this.bufferCache.clear()

    if (this.context) {
      await this.context.close().catch(() => {})
      this.context = undefined
    }
  }

  private ensureContext(): AudioContext {
    if (this.context) {
      return this.context
    }

    const Ctor = globalThis.AudioContext
      || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!Ctor) {
      throw new Error('AudioContext is not available in this environment.')
    }

    this.context = new Ctor({ latencyHint: 'interactive' })

    if (!this.masterGain) {
      this.masterGain = this.context.createGain()
      this.masterGain.gain.value = 1
      this.connectMasterChain()
    }

    return this.context
  }

  private syncBus(
    busId: AudioBusId,
    projection: { gainDb?: number, eq?: readonly AudioEqBand[], automation?: readonly AudioAutomationProjection[] },
  ): void {
    const context = this.ensureContext()

    if (busId === 'master') {
      if (!this.masterGain) {
        this.masterGain = context.createGain()
        this.masterGain.gain.value = 1
      }
      this.applyGainAutomation(this.masterGain.gain, projection.gainDb ?? 0)
      this.applyEqChain(this.masterEqNodes, projection.eq || [])
      this.connectMasterChain()
      this.scheduleAutomation(this.masterGain.gain, projection.automation || [])
      this.scheduleAutomationChain(this.masterEqNodes, projection.automation || [])
      return
    }

    const bus = this.getOrCreateBus(busId, context)
    this.applyGainAutomation(bus.gainNode.gain, projection.gainDb ?? 0)
    this.applyEqChain(bus.eqNodes, projection.eq || [])
    this.connectBusChain(bus)
    this.scheduleAutomation(bus.gainNode.gain, projection.automation || [])
    this.scheduleAutomationChain(bus.eqNodes, projection.automation || [])
  }

  private async syncSingleTrack(kind: 'bgm' | 'voice', projection?: AudioTrackProjection): Promise<void> {
    const context = this.ensureContext()
    const bus = this.getOrCreateBus(kind, context)
    const slot = this.singleSlots[kind] || this.createSlot(kind, context, bus)
    this.singleSlots[kind] = slot

    if (!projection || projection.state === 'stopped') {
      this.stopSlot(slot, projection?.fadeOutMs ?? 0, 'stopped', true)
      return
    }

    await this.syncSlotProjection(kind, projection, slot, bus, context)
  }

  private async syncTrackCollection(kind: 'sfx' | 'ambient', projections: readonly AudioTrackProjection[]): Promise<void> {
    const context = this.ensureContext()
    const bus = this.getOrCreateBus(kind, context)
    const slots = this.collectionSlots[kind]
    const projectedIds = new Set<string>()

    for (const projection of projections) {
      projectedIds.add(projection.id)
      let slot = slots.get(projection.id)
      if (!slot) {
        slot = this.createSlot(kind, context, bus)
        slots.set(projection.id, slot)
      }

      if (projection.state === 'stopped') {
        this.stopSlot(slot, projection.fadeOutMs ?? 0, 'stopped', true)
        slots.delete(projection.id)
        continue
      }

      await this.syncSlotProjection(kind, projection, slot, bus, context)
    }

    for (const [id, slot] of slots) {
      if (!projectedIds.has(id)) {
        this.stopSlot(slot, 0, 'stopped', true)
        slots.delete(id)
      }
    }
  }

  private async syncSlotProjection(
    kind: AudioTrackProjection['kind'],
    projection: AudioTrackProjection,
    slot: SlotRuntime,
    bus: BusRuntime,
    context: AudioContext,
  ): Promise<void> {
    const targetPackageId = this.resolveTrackTargetPackageId(projection)
    slot.assetKey = projection.assetKey
    const controlSignature = this.createControlSignature(projection)
    const fxSignature = this.createFxSignature(projection)

    if (projection.state === 'paused') {
      slot.currentTrack = projection
      slot.controlSignature = controlSignature
      slot.fxSignature = fxSignature
      if (slot.source) {
        this.pauseSlot(slot, projection)
      }
      this.applyTrackFx(slot, projection)
      return
    }

    const resumingPausedTrack = slot.currentTrack?.state === 'paused'
      && slot.currentTrack.id === projection.id
      && !slot.source

    const needsSource = !slot.source
      || slot.staleBuffer
      || slot.targetPackageId !== targetPackageId
      || slot.controlSignature !== controlSignature
      || resumingPausedTrack

    if (needsSource) {
      this.stopSlot(slot, 0, 'replaced', true)
      await this.startTrackSource(kind, projection, slot, bus, context, resumingPausedTrack ? slot.offsetSeconds : undefined, targetPackageId)
      slot.controlSignature = controlSignature
      slot.staleBuffer = false
    }

    if (slot.fxSignature !== fxSignature) {
      this.applyTrackFx(slot, projection)
      slot.fxSignature = fxSignature
    }

    if (projection.state === 'playing') {
      if (slot.pendingStart && slot.source && this.unlocked) {
        this.startSlot(slot, projection)
      }
      else if (slot.source && slot.currentTrack?.state !== 'playing' && this.unlocked) {
        this.startSlot(slot, projection)
      }
    }
    else if (projection.state === 'stopping') {
      this.stopSlot(slot, projection.fadeOutMs ?? 0, 'stopped')
    }
  }

  private async startTrackSource(
    _kind: AudioTrackProjection['kind'],
    projection: AudioTrackProjection,
    slot: SlotRuntime,
    bus: BusRuntime,
    context: AudioContext,
    resumeOffsetSeconds?: number,
    targetPackageId = this.resolveTrackTargetPackageId(projection),
  ): Promise<void> {
    const generation = ++slot.generation
    const buffer = await this.loadBuffer(projection.assetKey, targetPackageId)
    if (this.destroyed || generation !== slot.generation || !buffer) {
      return
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = projection.loop ?? false

    this.applyTrackFx(slot, projection)
    this.connectSlotNodes(slot, bus, source)

    const offsetSeconds = resumeOffsetSeconds !== undefined
      ? Math.max(0, resumeOffsetSeconds)
      : Math.max(0, projection.seekMs ?? projection.offsetMs ?? 0) / 1000

    slot.offsetSeconds = offsetSeconds
    slot.currentTrack = projection
    slot.pendingStart = !this.unlocked || projection.state !== 'playing'
    slot.startedAt = undefined
    slot.stopReason = undefined
    slot.assetKey = projection.assetKey
    slot.targetPackageId = targetPackageId

    source.onended = () => {
      const current = slot.currentTrack
      if (this.destroyed || generation !== slot.generation || !current) {
        return
      }

      const reason = slot.stopReason || 'natural'
      if (reason === 'paused') {
        slot.source = undefined
        slot.pendingStart = false
        return
      }

      const payload = this.createTrackPayload(current, reason)
      slot.currentTrack = undefined
      slot.source = undefined
      slot.pendingStart = false

      void this.callbacks.emit(
        reason === 'interrupted'
          ? AudioRenderToLogicEvents.INTERRUPTED
          : AudioRenderToLogicEvents.ENDED,
        payload,
      )
    }

    slot.source = source
    if (this.unlocked && projection.state === 'playing') {
      this.startSlot(slot, projection)
    }
  }

  private startSlot(slot: SlotRuntime, projection: AudioTrackProjection): void {
    if (!slot.source || slot.currentTrack?.id !== projection.id) {
      return
    }

    const now = this.ensureContext().currentTime
    const gainNode = slot.gainNode.gain
    const targetGain = dbToGain(projection.gainDb ?? 0)

    gainNode.cancelScheduledValues(now)
    gainNode.setValueAtTime(0, now)
    if ((projection.fadeInMs ?? 0) > 0) {
      gainNode.linearRampToValueAtTime(targetGain, now + (projection.fadeInMs || 0) / 1000)
    }
    else {
      gainNode.setValueAtTime(targetGain, now)
    }

    try {
      slot.source.start(0, slot.offsetSeconds)
      slot.pendingStart = false
      slot.startedAt = now - slot.offsetSeconds
    }
    catch {
      // Ignore races with rapid restarts.
    }
  }

  private pauseSlot(slot: SlotRuntime, projection: AudioTrackProjection): void {
    if (!slot.source) {
      return
    }

    const context = this.ensureContext()
    const elapsed = Math.max(0, context.currentTime - (slot.startedAt ?? context.currentTime))
    slot.offsetSeconds = elapsed
    slot.stopReason = 'paused'
    slot.pendingStart = false
    slot.generation += 1

    try {
      slot.source.stop()
    }
    catch {
      // Ignore stop races.
    }

    slot.source = undefined
    slot.currentTrack = projection
    slot.startedAt = undefined
  }

  private stopSlot(slot: SlotRuntime | undefined, fadeOutMs = 0, reason = 'stopped', clearTrack = false): void {
    if (!slot) {
      return
    }

    slot.stopReason = reason
    slot.pendingStart = false
    if (clearTrack || reason === 'replaced' || reason === 'destroy') {
      slot.generation += 1
    }

    if (!slot.source) {
      if (clearTrack) {
        slot.currentTrack = undefined
      }
      return
    }

    const now = this.ensureContext().currentTime
    const gainNode = slot.gainNode.gain
    gainNode.cancelScheduledValues(now)

    if (fadeOutMs > 0) {
      gainNode.setValueAtTime(gainNode.value, now)
      gainNode.linearRampToValueAtTime(0, now + fadeOutMs / 1000)
      globalThis.setTimeout(() => {
        try {
          slot.source?.stop()
        }
        catch {
          // Ignore stop races.
        }
      }, fadeOutMs)
    }
    else {
      gainNode.setValueAtTime(0, now)
      try {
        slot.source.stop()
      }
      catch {
        // Ignore stop races.
      }
    }

    if (clearTrack) {
      slot.currentTrack = undefined
    }
  }

  private connectSlotNodes(slot: SlotRuntime, bus: BusRuntime, source: AudioBufferSourceNode): void {
    source.disconnect()
    slot.gainNode.disconnect()
    slot.eqNodes.forEach(node => node.disconnect())
    connectChain([source, slot.gainNode, ...slot.eqNodes, bus.input])
  }

  private applyTrackFx(slot: SlotRuntime, projection: AudioTrackProjection): void {
    const now = this.ensureContext().currentTime
    const gainNode = slot.gainNode.gain
    gainNode.cancelScheduledValues(now)
    gainNode.setValueAtTime(dbToGain(projection.gainDb ?? 0), now)

    this.applyEqChain(slot.eqNodes, projection.eq || [])
    if (slot.source) {
      const bus = this.getOrCreateBus(projection.kind, this.ensureContext())
      this.connectSlotNodes(slot, bus, slot.source)
    }

    this.scheduleAutomation(gainNode, projection.automation || [])
    this.scheduleAutomationChain(slot.eqNodes, projection.automation || [])
  }

  private applyGainAutomation(param: AudioParam, gainDb = 0): void {
    const now = this.ensureContext().currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(dbToGain(gainDb), now)
  }

  private applyEqChain(filters: BiquadFilterNode[], bands: readonly AudioEqBand[]): void {
    const context = this.ensureContext()
    ensureFilterCount(filters, bands.length, () => context.createBiquadFilter())

    bands.forEach((band, index) => {
      const filter = filters[index]
      filter.type = band.type || 'peaking'
      filter.frequency.setValueAtTime(band.frequency, context.currentTime)
      filter.gain.setValueAtTime(band.gainDb ?? 0, context.currentTime)
      filter.Q.setValueAtTime(band.q ?? 1, context.currentTime)
      filter.detune.setValueAtTime(band.detune ?? 0, context.currentTime)
    })

    for (let index = bands.length; index < filters.length; index++) {
      filters[index].disconnect()
    }
    filters.length = bands.length
  }

  private scheduleAutomation(param: AudioParam, automation: readonly AudioAutomationProjection[]): void {
    if (automation.length === 0) {
      return
    }

    const now = this.ensureContext().currentTime
    for (const item of automation) {
      if (item.propertyPath !== 'gainDb') {
        continue
      }

      const points = item.curve.points
      if (points.length === 0) {
        continue
      }

      param.cancelScheduledValues(now)
      param.setValueAtTime(dbToGain(points[0].value), now + points[0].at / 1000)
      for (let index = 1; index < points.length; index++) {
        const point = points[index]
        param.linearRampToValueAtTime(dbToGain(point.value), now + point.at / 1000)
      }
    }
  }

  private scheduleAutomationChain(filters: BiquadFilterNode[], automation: readonly AudioAutomationProjection[]): void {
    for (const item of automation) {
      const match = item.propertyPath.match(/^eq\[(\d+)\]\.(gainDb|frequency|q|detune)$/)
      if (!match) {
        continue
      }

      const index = Number(match[1])
      const property = match[2]
      const filter = filters[index]
      if (!filter) {
        continue
      }

      const param = filter[property as keyof BiquadFilterNode]
      if (!param || typeof param !== 'object' || !('setValueAtTime' in param)) {
        continue
      }

      this.scheduleAutomation(param as AudioParam, [item])
    }
  }

  private async loadBuffer(assetKey: string, targetPackageId?: string): Promise<AudioBuffer> {
    const cacheKey = `${assetKey}::${targetPackageId || ''}`
    const cached = this.bufferCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const promise = (async () => {
      const assets = this.assets()
      if (!assets) {
        throw new Error('Audio runtime requires assets access.')
      }

      const asset = await assets.getAsset('audio', assetKey, { targetPackageId })
      const context = this.ensureContext()
      const bytes = asset.data.buffer.slice(
        asset.data.byteOffset,
        asset.data.byteOffset + asset.data.byteLength,
      ) as ArrayBuffer
      return await context.decodeAudioData(bytes)
    })()

    this.bufferCache.set(cacheKey, promise)
    return promise
  }

  private getOrCreateBus(busId: AudioBusId, context: AudioContext): BusRuntime {
    if (busId === 'master') {
      throw new Error('Master bus is represented by the master gain node.')
    }

    const existing = this.buses[busId]
    if (existing) {
      return existing
    }

    const input = context.createGain()
    const gainNode = context.createGain()
    const bus: BusRuntime = {
      input,
      eqNodes: [],
      gainNode,
    }
    this.buses[busId] = bus
    this.connectBusChain(bus)
    return bus
  }

  private createSlot(kind: AudioTrackProjection['kind'], context: AudioContext, bus: BusRuntime): SlotRuntime {
    const gainNode = context.createGain()
    const eqNodes: BiquadFilterNode[] = []
    const slot: SlotRuntime = {
      kind,
      gainNode,
      eqNodes,
      offsetSeconds: 0,
      generation: 0,
    }
    gainNode.connect(bus.input)
    return slot
  }

  private connectBusChain(bus: BusRuntime): void {
    bus.input.disconnect()
    bus.eqNodes.forEach(node => node.disconnect())
    bus.gainNode.disconnect()
    connectChain([bus.input, ...bus.eqNodes, bus.gainNode, this.masterGain || this.ensureContext().destination])
  }

  private connectMasterChain(): void {
    if (!this.masterGain) {
      return
    }

    this.masterGain.disconnect()
    this.masterEqNodes.forEach(node => node.disconnect())
    connectChain([this.masterGain, ...this.masterEqNodes, this.ensureContext().destination])
  }

  private createControlSignature(track: AudioTrackProjection): string {
    return JSON.stringify({
      id: track.id,
      assetKey: track.assetKey,
      state: track.state,
      loop: track.loop ?? false,
      seekMs: track.seekMs ?? 0,
      offsetMs: track.offsetMs ?? 0,
      chapterId: track.chapterId,
      lineId: track.lineId,
    })
  }

  private createFxSignature(track: AudioTrackProjection): string {
    return JSON.stringify({
      gainDb: track.gainDb ?? 0,
      eq: track.eq || [],
      automation: track.automation || [],
      fadeInMs: track.fadeInMs ?? 0,
      fadeOutMs: track.fadeOutMs ?? 0,
      crossfadeMs: track.crossfadeMs ?? 0,
    })
  }

  private createTrackPayload(track: AudioTrackProjection, reason: string): AudioTrackEventPayload {
    return {
      channel: track.kind,
      id: track.id,
      assetKey: track.assetKey,
      chapterId: track.chapterId,
      lineId: track.lineId,
      reason,
      metadata: track.metadata,
    }
  }

  private resolveAssetKey(change: AssetChange): string | undefined {
    return change.record?.name || change.path || change.assetId.split(':').pop()
  }

  private resolveTrackTargetPackageId(projection: AudioTrackProjection): string | undefined {
    return projection.contentPackageId || contentPackageIdFromMetadata(projection.metadata)
  }

  private async startPendingSources(): Promise<void> {
    await Promise.all(this.getAllSlots().map(async (slot) => {
      if (!slot?.source || !slot.currentTrack || !slot.pendingStart || slot.currentTrack.state !== 'playing') {
        return
      }
      this.startSlot(slot, slot.currentTrack)
    }))
  }

  private async markUnlockedIfRunning(context: AudioContext): Promise<boolean> {
    if (this.destroyed || this.unlocked || context.state !== 'running') {
      return false
    }

    this.unlocked = true
    await this.startPendingSources()
    await this.callbacks.emit(AudioRenderToLogicEvents.UNLOCKED, { timestamp: Date.now() })
    return true
  }

  private getAllSlots(): SlotRuntime[] {
    return [
      ...Object.values(this.singleSlots).filter((slot): slot is SlotRuntime => Boolean(slot)),
      ...this.collectionSlots.sfx.values(),
      ...this.collectionSlots.ambient.values(),
    ]
  }
}

function selectActiveVoice(voices: readonly AudioTrackProjection[]): AudioTrackProjection | undefined {
  for (let index = voices.length - 1; index >= 0; index--) {
    const track = voices[index]
    if (track.state !== 'stopped') {
      return track
    }
  }
  return undefined
}

function connectChain(nodes: AudioNode[]): void {
  for (let index = 0; index < nodes.length - 1; index++) {
    nodes[index].connect(nodes[index + 1])
  }
}

function ensureFilterCount(filters: BiquadFilterNode[], count: number, create: () => BiquadFilterNode): void {
  while (filters.length < count) {
    filters.push(create())
  }
}

function contentPackageIdFromMetadata(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}
