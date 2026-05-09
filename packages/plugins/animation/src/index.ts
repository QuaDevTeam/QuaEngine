import type { QuaEngineInterface } from '@quajs/engine'
import type {
  ActiveAnimationProjection,
  AnimationFillMode,
  AnimationInterpolation,
  AnimationKeyframeProjection,
  AnimationTime,
  ResolvedAnimationTrackProjection,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
  ViewEffectProjection,
} from '@quajs/render-core'
import { BaseEnginePlugin } from '@quajs/engine'
import { animationDecoratorMappings } from './script-compiler'

export type AnimationCommitMode = 'none' | 'final' | { properties: readonly string[] }
export type AnimationTargetBindings = Readonly<Record<string, string>> | readonly string[]

export interface AnimationKeyframe {
  at: AnimationTime
  value: unknown
  easing?: string
}

export interface AnimationTrack {
  target?: string
  property: string
  keyframes: readonly AnimationKeyframe[]
  interpolation?: AnimationInterpolation
}

export interface AnimationTimeline {
  id?: string
  duration: number
  tracks: readonly AnimationTrack[]
  playbackRate?: number
  loop?: boolean | number
  fill?: AnimationFillMode
  commit?: AnimationCommitMode
  metadata?: Readonly<Record<string, unknown>>
}

export interface PlayAnimationOptions {
  id?: string
  bindings?: AnimationTargetBindings
  wait?: boolean
  defaultTarget?: string
  playbackRate?: number
  loop?: boolean | number
  fill?: AnimationFillMode
  commit?: AnimationCommitMode
  strictAdapters?: boolean
}

export interface AnimationPluginOptions {
  strictAdapters?: boolean
}

export interface AnimationTargetAdapter {
  kind: string
  exists?: (engine: QuaEngineInterface, selector: string) => boolean
  commit?: (engine: QuaEngineInterface, selector: string, property: string, value: unknown) => void | Promise<void | boolean> | boolean
}

interface NormalizedAnimationTrack extends AnimationTrack {
  target?: string
  keyframes: readonly AnimationKeyframe[]
}

interface NormalizedAnimationTimeline extends AnimationTimeline {
  duration: number
  tracks: readonly NormalizedAnimationTrack[]
  playbackRate: number
  fill: AnimationFillMode
  commit: AnimationCommitMode
}

interface RuntimePlayback {
  id: string
  definition: NormalizedAnimationTimeline
  projection: ActiveAnimationProjection
  completionTimer?: ReturnType<typeof setTimeout>
  waiters: Set<() => void>
}

interface AnimationRuntime {
  definitions: Map<string, NormalizedAnimationTimeline>
  playbacks: Map<string, RuntimePlayback>
  adapters: Map<string, AnimationTargetAdapter>
  strictAdapters: boolean
  warned: Set<string>
  counter: number
}

const runtimes = new WeakMap<QuaEngineInterface, AnimationRuntime>()
const globalAdapters = new Map<string, AnimationTargetAdapter>()

registerBuiltInAdapters()

export class AnimationPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-animation'
  readonly id = 'animation'
  readonly version = '0.1.0'
  readonly description = 'Cross-plugin timeline animation APIs'

  protected setup(): void {
    const runtime = getRuntime(this.ctx!.engine)
    runtime.strictAdapters = Boolean((this.options as AnimationPluginOptions).strictAdapters)
  }

  override async destroy(): Promise<void> {
    if (this.ctx) {
      await clearAnimationRuntime(this.ctx.engine)
    }
    const baseDestroy = BaseEnginePlugin.prototype.destroy
    if (baseDestroy) {
      await baseDestroy.call(this)
    }
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'defineAnimation', fn: defineAnimation, module: this.name },
        { name: 'registerAnimationWithEngine', fn: registerAnimationWithEngine, module: this.name },
        { name: 'playAnimationWithEngine', fn: playAnimationWithEngine, module: this.name },
        { name: 'playTimelineWithEngine', fn: playTimelineWithEngine, module: this.name },
        { name: 'pauseAnimationWithEngine', fn: pauseAnimationWithEngine, module: this.name },
        { name: 'resumeAnimationWithEngine', fn: resumeAnimationWithEngine, module: this.name },
        { name: 'stopAnimationWithEngine', fn: stopAnimationWithEngine, module: this.name },
        { name: 'seekAnimationWithEngine', fn: seekAnimationWithEngine, module: this.name },
        { name: 'waitAnimationWithEngine', fn: waitAnimationWithEngine, module: this.name },
        { name: 'registerAnimationTargetAdapter', fn: registerAnimationTargetAdapter, module: this.name },
      ],
      decorators: animationDecoratorMappings,
    }
  }
}

export function defineAnimation(timeline: AnimationTimeline): AnimationTimeline
export function defineAnimation(id: string, duration: number, tracks: readonly AnimationTrack[]): AnimationTimeline
export function defineAnimation(
  idOrTimeline: string | AnimationTimeline,
  duration?: number,
  tracks: readonly AnimationTrack[] = [],
): AnimationTimeline {
  if (typeof idOrTimeline === 'string') {
    if (duration === undefined) {
      throw new Error('defineAnimation requires a duration when the id overload is used.')
    }
    return normalizeTimeline({ id: idOrTimeline, duration, tracks })
  }
  return normalizeTimeline(idOrTimeline)
}

export function defineAnimationKeyframe(
  targetOrProperty: string,
  propertyOrAt: string | AnimationTime,
  atOrValue: AnimationTime | unknown,
  valueOrEasing?: unknown,
  easing?: string,
): AnimationTrack {
  const hasExplicitTarget = typeof propertyOrAt === 'string'
  return {
    target: hasExplicitTarget ? targetOrProperty : undefined,
    property: hasExplicitTarget ? propertyOrAt : targetOrProperty,
    keyframes: [{
      at: hasExplicitTarget ? atOrValue as AnimationTime : propertyOrAt as AnimationTime,
      value: hasExplicitTarget ? valueOrEasing : atOrValue,
      easing: hasExplicitTarget ? easing : valueOrEasing as string | undefined,
    }],
  }
}

export async function registerAnimationWithEngine(
  engine: QuaEngineInterface,
  timeline: AnimationTimeline,
): Promise<AnimationTimeline> {
  const normalized = normalizeTimeline(timeline)
  if (!normalized.id) {
    throw new Error('Named animation definitions require an id.')
  }
  getRuntime(engine).definitions.set(normalized.id, normalized)
  return normalized
}

export async function playAnimationWithEngine(
  engine: QuaEngineInterface,
  definitionId: string,
  options: PlayAnimationOptions = {},
): Promise<ActiveAnimationProjection> {
  const runtime = getRuntime(engine)
  const definition = runtime.definitions.get(definitionId)
  if (!definition) {
    throw new Error(`Animation definition "${definitionId}" is not registered.`)
  }
  return playNormalizedTimeline(engine, runtime, definition, {
    ...options,
    id: options.id,
  }, definitionId)
}

export async function playTimelineWithEngine(
  engine: QuaEngineInterface,
  timeline: AnimationTimeline,
  options: PlayAnimationOptions = {},
): Promise<ActiveAnimationProjection> {
  const runtime = getRuntime(engine)
  return playNormalizedTimeline(engine, runtime, normalizeTimeline(timeline), options)
}

export async function pauseAnimationWithEngine(
  engine: QuaEngineInterface,
  playbackId: string,
): Promise<void> {
  const runtime = getRuntime(engine)
  const playback = runtime.playbacks.get(playbackId)
  if (!playback || playback.projection.state !== 'running')
    return

  clearPlaybackTimer(playback)
  const pausedAt = Date.now()
  playback.projection = {
    ...playback.projection,
    state: 'paused',
    pausedAt,
  }
  await engine.setAnimationProjection(playback.projection)
}

export async function resumeAnimationWithEngine(
  engine: QuaEngineInterface,
  playbackId: string,
): Promise<void> {
  const runtime = getRuntime(engine)
  const playback = runtime.playbacks.get(playbackId)
  if (!playback || playback.projection.state !== 'paused')
    return

  const pausedAt = playback.projection.pausedAt ?? Date.now()
  const elapsedBeforePause = pausedAt - playback.projection.startedAt
  playback.projection = {
    ...playback.projection,
    state: 'running',
    startedAt: Date.now() - elapsedBeforePause,
    pausedAt: undefined,
  }
  scheduleCompletion(engine, runtime, playback)
  await engine.setAnimationProjection(playback.projection)
}

export async function stopAnimationWithEngine(
  engine: QuaEngineInterface,
  playbackIdOrTarget?: string,
  definitionId?: string,
): Promise<number> {
  const runtime = getRuntime(engine)
  const matches = findPlaybacks(runtime, playbackIdOrTarget, definitionId)
  await Promise.all(matches.map(playback => finishPlayback(engine, runtime, playback, false)))
  return matches.length
}

export async function seekAnimationWithEngine(
  engine: QuaEngineInterface,
  playbackId: string,
  time: number,
): Promise<void> {
  const runtime = getRuntime(engine)
  const playback = runtime.playbacks.get(playbackId)
  if (!playback)
    return

  const clamped = Math.max(0, Math.min(playback.projection.duration, time))
  const wallElapsed = clamped / playback.projection.playbackRate
  const startedAt = Date.now() - wallElapsed
  playback.projection = {
    ...playback.projection,
    startedAt,
    pausedAt: playback.projection.state === 'paused' ? startedAt + wallElapsed : undefined,
  }
  if (playback.projection.state === 'running') {
    scheduleCompletion(engine, runtime, playback)
  }
  await engine.setAnimationProjection(playback.projection)
}

export async function waitAnimationWithEngine(
  engine: QuaEngineInterface,
  playbackIdOrTarget?: string,
  definitionId?: string,
): Promise<void> {
  const runtime = getRuntime(engine)
  const matches = findPlaybacks(runtime, playbackIdOrTarget, definitionId)
  if (matches.length === 0)
    return

  await Promise.all(matches.map(playback => new Promise<void>((resolve) => {
    playback.waiters.add(resolve)
  })))
}

export function registerAnimationTargetAdapter(kind: string, adapter: AnimationTargetAdapter): void {
  globalAdapters.set(kind, { ...adapter, kind })
}

async function playNormalizedTimeline(
  engine: QuaEngineInterface,
  runtime: AnimationRuntime,
  definition: NormalizedAnimationTimeline,
  options: PlayAnimationOptions,
  definitionId?: string,
): Promise<ActiveAnimationProjection> {
  const id = options.id || `${definitionId || definition.id || 'timeline'}:${Date.now()}:${++runtime.counter}`
  const playbackRate = options.playbackRate ?? definition.playbackRate
  const bindings = normalizeBindings(options.bindings)
  const projection: ActiveAnimationProjection = {
    id,
    definitionId: definitionId || definition.id,
    bindings: Object.keys(bindings).length ? bindings : undefined,
    state: 'running',
    startedAt: Date.now(),
    duration: definition.duration,
    playbackRate,
    loop: options.loop ?? definition.loop,
    fill: options.fill ?? definition.fill,
    resolvedTracks: resolveTracks(engine, runtime, definition, {
      bindings,
      defaultTarget: options.defaultTarget,
      strictAdapters: options.strictAdapters,
    }),
  }
  const playback: RuntimePlayback = {
    id,
    definition: {
      ...definition,
      playbackRate,
      loop: options.loop ?? definition.loop,
      fill: options.fill ?? definition.fill,
      commit: options.commit ?? definition.commit,
    },
    projection,
    waiters: new Set(),
  }

  runtime.playbacks.set(id, playback)
  scheduleCompletion(engine, runtime, playback)
  await engine.setAnimationProjection(projection)

  if (options.wait) {
    await waitAnimationWithEngine(engine, id)
  }

  return projection
}

function resolveTracks(
  engine: QuaEngineInterface,
  runtime: AnimationRuntime,
  definition: NormalizedAnimationTimeline,
  options: {
    bindings: Record<string, string>
    defaultTarget?: string
    strictAdapters?: boolean
  },
): ResolvedAnimationTrackProjection[] {
  return definition.tracks.map((track) => {
    const target = resolveTarget(track.target, options.bindings, options.defaultTarget)
    assertAdapter(engine, runtime, target, options.strictAdapters)
    return {
      target,
      property: track.property,
      interpolation: track.interpolation,
      keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
    }
  })
}

function resolveTarget(target: string | undefined, bindings: Record<string, string>, defaultTarget?: string): string {
  const candidate = target || 'self'
  if (isConcreteSelector(candidate)) {
    return candidate
  }
  if (bindings[candidate]) {
    return bindings[candidate]
  }
  if (candidate === 'self' && defaultTarget) {
    return defaultTarget
  }
  throw new Error(`Animation target "${candidate}" requires a binding.`)
}

function scheduleCompletion(
  engine: QuaEngineInterface,
  runtime: AnimationRuntime,
  playback: RuntimePlayback,
): void {
  clearPlaybackTimer(playback)

  const loop = playback.projection.loop
  if (loop === true)
    return

  const loopCount = typeof loop === 'number' ? Math.max(1, loop) : 1
  const totalWallDuration = (playback.projection.duration * loopCount) / playback.projection.playbackRate
  const elapsed = Date.now() - playback.projection.startedAt
  const remaining = Math.max(0, totalWallDuration - elapsed)
  playback.completionTimer = setTimeout(() => {
    finishPlayback(engine, runtime, playback, true).catch((error) => {
      warn(runtime, `Animation "${playback.id}" failed to complete: ${String(error)}`, false)
    })
  }, remaining)
}

async function finishPlayback(
  engine: QuaEngineInterface,
  runtime: AnimationRuntime,
  playback: RuntimePlayback,
  complete: boolean,
): Promise<void> {
  if (!runtime.playbacks.has(playback.id))
    return

  clearPlaybackTimer(playback)
  runtime.playbacks.delete(playback.id)
  if (complete) {
    await commitFinalValues(engine, runtime, playback)
  }
  await engine.removeAnimationProjection(playback.id)
  playback.waiters.forEach(resolve => resolve())
  playback.waiters.clear()
}

async function commitFinalValues(
  engine: QuaEngineInterface,
  runtime: AnimationRuntime,
  playback: RuntimePlayback,
): Promise<void> {
  const commit = playback.definition.commit
  if (commit === 'none')
    return

  const properties = commit === 'final' ? undefined : new Set(commit.properties)
  for (const track of playback.projection.resolvedTracks) {
    if (properties && !properties.has(track.property))
      continue

    const final = getFinalKeyframe(track)
    if (!final)
      continue

    const adapter = getAdapter(runtime, track.target)
    if (!adapter?.commit) {
      assertAdapter(engine, runtime, track.target, false)
      continue
    }

    const committed = await adapter.commit(engine, track.target, track.property, final.value)
    if (committed === false) {
      warn(runtime, `Animation adapter "${targetKind(track.target)}" could not commit ${track.target}.${track.property}.`, false)
    }
  }
}

function getFinalKeyframe(track: Readonly<ResolvedAnimationTrackProjection>): Readonly<AnimationKeyframeProjection> | undefined {
  return [...track.keyframes]
    .sort((left, right) => resolveAt(left.at, 1) - resolveAt(right.at, 1))
    .slice(-1)[0]
}

function findPlaybacks(
  runtime: AnimationRuntime,
  playbackIdOrTarget?: string,
  definitionId?: string,
): RuntimePlayback[] {
  const playbacks = [...runtime.playbacks.values()]
  if (!playbackIdOrTarget) {
    return definitionId
      ? playbacks.filter(playback => playback.projection.definitionId === definitionId)
      : playbacks
  }

  const byId = runtime.playbacks.get(playbackIdOrTarget)
  if (byId) {
    return definitionId && byId.projection.definitionId !== definitionId ? [] : [byId]
  }

  return playbacks.filter((playback) => {
    if (definitionId && playback.projection.definitionId !== definitionId)
      return false
    return playback.projection.resolvedTracks.some(track => track.target === playbackIdOrTarget)
  })
}

function normalizeTimeline(timeline: AnimationTimeline): NormalizedAnimationTimeline {
  if (!Number.isFinite(timeline.duration) || timeline.duration < 0) {
    throw new Error('Animation timeline duration must be a non-negative number.')
  }

  return {
    ...timeline,
    duration: timeline.duration,
    playbackRate: timeline.playbackRate ?? 1,
    fill: timeline.fill ?? 'forwards',
    commit: timeline.commit ?? 'final',
    tracks: mergeTracks(timeline.tracks || [], timeline.duration),
  }
}

function mergeTracks(tracks: readonly AnimationTrack[], duration: number): NormalizedAnimationTrack[] {
  const merged = new Map<string, NormalizedAnimationTrack>()
  for (const track of tracks) {
    if (!track.property) {
      throw new Error('Animation tracks require a property.')
    }
    const target = track.target || 'self'
    const key = `${target}\u0000${track.property}`
    const existing = merged.get(key)
    const keyframes = normalizeKeyframes(track.keyframes || [], duration)
    if (existing) {
      merged.set(key, {
        ...existing,
        keyframes: normalizeKeyframes([...existing.keyframes, ...keyframes], duration),
      })
    }
    else {
      merged.set(key, {
        ...track,
        target,
        keyframes,
      })
    }
  }
  return [...merged.values()]
}

function normalizeKeyframes(keyframes: readonly AnimationKeyframe[], duration: number): AnimationKeyframe[] {
  return keyframes
    .map((keyframe) => {
      if (keyframe.at === undefined || keyframe.at === null) {
        throw new Error('Animation keyframes require an at time.')
      }
      return { ...keyframe }
    })
    .sort((left, right) => resolveAt(left.at, duration) - resolveAt(right.at, duration))
}

function normalizeBindings(bindings: AnimationTargetBindings | undefined): Record<string, string> {
  if (!bindings)
    return {}
  if (isBindingArray(bindings)) {
    return Object.fromEntries(bindings.map((binding) => {
      const index = binding.indexOf('=')
      if (index === -1) {
        throw new Error(`Animation binding "${binding}" must use alias=selector syntax.`)
      }
      return [binding.slice(0, index).trim(), binding.slice(index + 1).trim()]
    }))
  }

  return { ...bindings }
}

function isBindingArray(bindings: AnimationTargetBindings): bindings is readonly string[] {
  return Array.isArray(bindings)
}

function getRuntime(engine: QuaEngineInterface): AnimationRuntime {
  const current = runtimes.get(engine)
  if (current)
    return current

  const runtime: AnimationRuntime = {
    definitions: new Map(),
    playbacks: new Map(),
    adapters: new Map(globalAdapters),
    strictAdapters: false,
    warned: new Set(),
    counter: 0,
  }
  runtimes.set(engine, runtime)
  return runtime
}

async function clearAnimationRuntime(engine: QuaEngineInterface): Promise<void> {
  const runtime = getRuntime(engine)
  await Promise.all([...runtime.playbacks.values()].map(playback => finishPlayback(engine, runtime, playback, false)))
  runtime.definitions.clear()
  runtime.warned.clear()
  await engine.clearAnimationProjections()
}

function assertAdapter(
  engine: QuaEngineInterface,
  runtime: AnimationRuntime,
  selector: string,
  strictOverride?: boolean,
): void {
  const adapter = getAdapter(runtime, selector)
  const strict = strictOverride ?? runtime.strictAdapters
  if (!adapter) {
    warn(runtime, `No animation target adapter registered for "${targetKind(selector)}".`, strict)
    return
  }
  if (adapter.exists && !adapter.exists(engine, selector)) {
    warn(runtime, `Animation target "${selector}" is not currently available.`, strict)
  }
}

function getAdapter(runtime: AnimationRuntime, selector: string): AnimationTargetAdapter | undefined {
  const kind = targetKind(selector)
  return runtime.adapters.get(kind) || globalAdapters.get(kind)
}

function warn(runtime: AnimationRuntime, message: string, strict: boolean): void {
  if (strict)
    throw new Error(message)
  if (runtime.warned.has(message))
    return
  runtime.warned.add(message)
  console.warn(`[quajs:animation] ${message}`)
}

function isConcreteSelector(value: string): boolean {
  return /^[A-Z][\w-]*:.+/i.test(value)
}

function targetKind(selector: string): string {
  const index = selector.indexOf(':')
  return index === -1 ? selector : selector.slice(0, index)
}

function targetId(selector: string): string {
  const index = selector.indexOf(':')
  return index === -1 ? selector : selector.slice(index + 1)
}

function clearPlaybackTimer(playback: RuntimePlayback): void {
  if (playback.completionTimer) {
    clearTimeout(playback.completionTimer)
    playback.completionTimer = undefined
  }
}

function resolveAt(at: AnimationTime, duration: number): number {
  if (typeof at === 'number')
    return at
  return Number.parseFloat(at) / 100 * duration
}

function registerBuiltInAdapters(): void {
  registerAnimationTargetAdapter('character', {
    kind: 'character',
    exists: (engine, selector) => engine.getViewState().characters.some(character => character.id === targetId(selector)),
    commit: async (engine, selector, property, value) => {
      const id = targetId(selector)
      const current = engine.getViewState().characters.find(character => character.id === id)
      if (!current)
        return false

      if (property.startsWith('position.')) {
        const positionKey = property.slice('position.'.length)
        await engine.moveCharacter(id, {
          ...(current.position || {}),
          [positionKey]: value,
        })
        return true
      }

      if (property === 'sprite') {
        await engine.setCharacterSprite(id, value as string | undefined)
        return true
      }

      if (property === 'expression') {
        await engine.setCharacterExpression(id, value as string | undefined)
        return true
      }

      if (property === 'visible') {
        if (value === false) {
          await engine.hideCharacter(id)
        }
        else {
          await engine.showCharacter({ ...cloneCharacter(current), visible: true })
        }
        return true
      }

      if (['opacity', 'layer'].includes(property) || property.startsWith('metadata.')) {
        const next = cloneCharacter(current)
        setPath(next as unknown as Record<string, unknown>, property, value)
        await engine.showCharacter(next)
        return true
      }

      return false
    },
  })

  registerAnimationTargetAdapter('background', {
    kind: 'background',
    exists: engine => Boolean(engine.getViewState().background),
    commit: async (engine, _selector, property, value) => {
      const current = engine.getViewState().background
      if (!current)
        return false
      const next = cloneBackground(current)
      setPath(next as unknown as Record<string, unknown>, property, value)
      await engine.setBackgroundProjection(next)
      return true
    },
  })

  registerAnimationTargetAdapter('backgroundLayer', {
    kind: 'backgroundLayer',
    exists: (engine, selector) => Boolean(engine.getViewState().background?.layers?.some(layer => layer.id === targetId(selector))),
    commit: async (engine, selector, property, value) => {
      const current = engine.getViewState().background
      const layerId = targetId(selector)
      if (!current?.layers?.some(layer => layer.id === layerId))
        return false
      await engine.setBackgroundProjection({
        ...cloneBackground(current),
        mode: 'layered',
        layers: current.layers.map((layer) => {
          if (layer.id !== layerId)
            return cloneBackgroundLayer(layer)
          const next = cloneBackgroundLayer(layer)
          setPath(next as unknown as Record<string, unknown>, property, value)
          return next
        }),
      })
      return true
    },
  })

  registerAnimationTargetAdapter('ui', {
    kind: 'ui',
    exists: (engine, selector) => Boolean(engine.getViewState().ui.overlays?.[targetId(selector)]),
    commit: async (engine, selector, property, value) => {
      const elementId = targetId(selector)
      const current = (engine.getViewState().ui.overlays?.[elementId] || {}) as Readonly<Record<string, unknown>>
      const next = cloneUnknownRecord(current)
      setPath(next, property, value)
      await engine.updateUI(elementId, next)
      return true
    },
  })

  registerAnimationTargetAdapter('effect', {
    kind: 'effect',
    exists: (engine, selector) => engine.getViewState().effects.some(effect => effect.id === targetId(selector)),
    commit: (engine, selector, property, value) => {
      const id = targetId(selector)
      const current = engine.getViewState().effects.find(effect => effect.id === id)
      if (!current)
        return false
      const next = cloneEffect(current)
      if (property.startsWith('options.')) {
        next.options = cloneUnknownRecord(next.options || {})
      }
      setPath(next as unknown as Record<string, unknown>, property, value)
      engine.getStore().commit('upsertEffect', next)
      return true
    },
  })
}

function cloneCharacter(character: Readonly<ViewCharacterProjection>) {
  return {
    ...character,
    position: character.position ? { ...character.position } : undefined,
    metadata: character.metadata ? cloneUnknownRecord(character.metadata) : undefined,
  }
}

function cloneBackground(background: Readonly<ViewBackgroundProjection>): ViewBackgroundProjection {
  return {
    ...background,
    transition: background.transition ? { ...background.transition } : undefined,
    video: background.video
      ? {
          ...background.video,
          transition: background.video.transition ? { ...background.video.transition } : undefined,
          metadata: background.video.metadata ? cloneUnknownRecord(background.video.metadata) : undefined,
        }
      : undefined,
    layers: background.layers?.map(layer => cloneBackgroundLayer(layer)),
    metadata: background.metadata ? cloneUnknownRecord(background.metadata) : undefined,
  }
}

function cloneBackgroundLayer(layer: Readonly<ViewBackgroundLayerProjection>): ViewBackgroundLayerProjection {
  return {
    ...layer,
    transition: layer.transition ? { ...layer.transition } : undefined,
    metadata: layer.metadata ? cloneUnknownRecord(layer.metadata) : undefined,
  }
}

function cloneEffect(effect: Readonly<ViewEffectProjection>): ViewEffectProjection {
  return {
    ...effect,
    options: effect.options ? cloneUnknownRecord(effect.options) : undefined,
  }
}

function cloneUnknownRecord<T extends Readonly<Record<string, unknown>>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneUnknownValue(item)]))
}

function cloneUnknownValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneUnknownValue)
  }
  if (value && typeof value === 'object') {
    return cloneUnknownRecord(value as Readonly<Record<string, unknown>>)
  }
  return value
}

function setPath(target: Record<string, unknown>, property: string, value: unknown): void {
  const keys = property.split('.').filter(Boolean)
  if (keys.length === 0)
    return

  let cursor = target
  for (const key of keys.slice(0, -1)) {
    const current = cursor[key]
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[keys[keys.length - 1]] = value
}

export const metadata = {
  name: '@quajs/plugin-animation',
  version: '0.1.0',
  description: 'Cross-plugin timeline animation APIs and QuaScript decorators',
  category: 'visual',
} as const

export const decorators = animationDecoratorMappings
export { animationDecoratorMappings, createAnimationDecoratorCompiler, scriptCompiler } from './script-compiler'
export const Plugin = AnimationPlugin
