import type { EngineContext, QuaEngineInterface } from '@quajs/engine'
import type {
  ActiveAnimationProjection,
  AnimationCommitMode,
  AnimationDirection,
  AnimationFillMode,
  AnimationInterpolation,
  AnimationTime,
  AnimationTimingFunction,
  ResolvedAnimationTrackProjection,
  RichTextBlockProjection,
  RichTextDocumentProjection,
  RichTextSpanProjection,
  ViewBackgroundLayerProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
  ViewEffectProjection,
} from '@quajs/render-core'
import { BaseEnginePlugin } from '@quajs/engine'
import { isRichTextDocument } from '@quajs/render-core'
import { animationDecoratorMappings } from './decorators'

const ANIMATION_SETTINGS_SCOPE = '@quajs/plugin-animation' as const

export type AnimationTargetBindings = Readonly<Record<string, string>> | readonly string[]
export type { AnimationCommitMode, AnimationDirection }
export { ANIMATION_SETTINGS_SCOPE }

export interface AnimationKeyframe {
  at: AnimationTime
  value: unknown
  easing?: AnimationTimingFunction
}

export interface AnimationTrack {
  target?: string
  property: string
  keyframes: readonly AnimationKeyframe[]
  interpolation?: AnimationInterpolation
}

export interface AnimationTimeline {
  id?: string
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
  duration: number
  tracks: readonly AnimationTrack[]
  delay?: number
  playbackRate?: number
  loop?: boolean | number
  fill?: AnimationFillMode
  direction?: AnimationDirection
  commit?: AnimationCommitMode
  metadata?: Readonly<Record<string, unknown>>
}

export interface PlayAnimationOptions {
  id?: string
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
  bindings?: AnimationTargetBindings
  wait?: boolean
  defaultTarget?: string
  delay?: number
  playbackRate?: number
  loop?: boolean | number
  fill?: AnimationFillMode
  direction?: AnimationDirection
  commit?: AnimationCommitMode
  strictAdapters?: boolean
}

export interface AnimationPluginOptions {
  strictAdapters?: boolean
}

interface AnimationDeveloperSettings {
  strictAdapters: boolean
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
  delay: number
  playbackRate: number
  fill: AnimationFillMode
  direction: AnimationDirection
  commit: AnimationCommitMode
}

interface RuntimePlayback {
  id: string
  definition: NormalizedAnimationTimeline
  projection: ActiveAnimationProjection
  completionTimer?: ReturnType<typeof setTimeout>
  waiters: Set<() => void>
}

type AnimationCommitFinalMode = Exclude<NonNullable<AnimationTimeline['commit']>, 'none'>

interface AnimationRuntime {
  definitions: Map<string, NormalizedAnimationTimeline>
  playbacks: Map<string, RuntimePlayback>
  adapters: Map<string, AnimationTargetAdapter>
  strictAdapters: boolean
  warned: Set<string>
  counter: number
  settingsDisposer?: () => void
}

const runtimes = new WeakMap<object, AnimationRuntime>()
const globalAdapters = new Map<string, AnimationTargetAdapter>()

registerBuiltInAdapters()

export class AnimationPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-animation'
  readonly id = 'animation'
  readonly version = '0.1.0'
  readonly description = 'Cross-plugin timeline animation APIs'

  registerAnimation(timeline: AnimationTimeline): Promise<AnimationTimeline> {
    return registerAnimationWithEngine(this.getEngine(), timeline)
  }

  playAnimation(definitionId: string, options?: PlayAnimationOptions): Promise<ActiveAnimationProjection> {
    return playAnimationWithEngine(this.getEngine(), definitionId, options)
  }

  playTimeline(timeline: AnimationTimeline, options?: PlayAnimationOptions): Promise<ActiveAnimationProjection> {
    return playTimelineWithEngine(this.getEngine(), timeline, options)
  }

  pause(playbackId: string): Promise<void> {
    return pauseAnimationWithEngine(this.getEngine(), playbackId)
  }

  resume(playbackId: string): Promise<void> {
    return resumeAnimationWithEngine(this.getEngine(), playbackId)
  }

  stop(playbackIdOrTarget?: string, definitionId?: string): Promise<number> {
    return stopAnimationWithEngine(this.getEngine(), playbackIdOrTarget, definitionId)
  }

  seek(playbackId: string, time: number): Promise<void> {
    return seekAnimationWithEngine(this.getEngine(), playbackId, time)
  }

  wait(playbackIdOrTarget?: string, definitionId?: string): Promise<void> {
    return waitAnimationWithEngine(this.getEngine(), playbackIdOrTarget, definitionId)
  }

  protected async setup(ctx: EngineContext): Promise<void> {
    const runtime = getRuntime(this.ctx!.engine)
    runtime.strictAdapters = Boolean((this.options as AnimationPluginOptions).strictAdapters)
    const settingsDisposer = await registerAnimationSettingsScope(ctx, runtime, this.getOptions())
    if (settingsDisposer) {
      runtime.settingsDisposer = settingsDisposer
    }
    reconcileAnimationRuntime(this.ctx!.engine)
  }

  override async onAfterJump(): Promise<void> {
    if (this.ctx) {
      reconcileAnimationRuntime(this.ctx.engine)
    }
  }

  override async onAfterRollback(): Promise<void> {
    if (this.ctx) {
      reconcileAnimationRuntime(this.ctx.engine)
    }
  }

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      await removeRuntimePackageAnimations(ctx.engine, packageId)
    }
  }

  override async destroy(): Promise<void> {
    if (this.ctx) {
      const runtime = getRuntime(this.ctx.engine)
      runtime.settingsDisposer?.()
      runtime.settingsDisposer = undefined
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
        { name: 'registerAnimation', fn: this.registerAnimation.bind(this), module: this.name },
        { name: 'playAnimation', fn: this.playAnimation.bind(this), module: this.name },
        { name: 'playTimeline', fn: this.playTimeline.bind(this), module: this.name },
        { name: 'pause', fn: this.pause.bind(this), module: this.name },
        { name: 'resume', fn: this.resume.bind(this), module: this.name },
        { name: 'stop', fn: this.stop.bind(this), module: this.name },
        { name: 'seek', fn: this.seek.bind(this), module: this.name },
        { name: 'wait', fn: this.wait.bind(this), module: this.name },
        { name: 'registerAnimationTargetAdapter', fn: registerAnimationTargetAdapter, module: this.name },
      ],
      decorators: animationDecoratorMappings,
    }
  }

  private getOptions(): AnimationPluginOptions {
    return this.options as AnimationPluginOptions
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
  easing?: AnimationTimingFunction,
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
  const normalized = withCurrentRuntimeAnimationPackage(engine, normalizeTimeline(timeline))
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
  return playNormalizedTimeline(engine, runtime, withCurrentRuntimeAnimationPackage(engine, normalizeTimeline(timeline)), options)
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
  const wallElapsed = ((playback.projection.delay ?? 0) + clamped) / playback.projection.playbackRate
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
  const delay = options.delay ?? definition.delay
  const playbackRate = options.playbackRate ?? definition.playbackRate
  if (!Number.isFinite(delay) || delay < 0) {
    throw new Error('Animation playback delay must be a non-negative number.')
  }
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
    throw new Error('Animation playbackRate must be greater than zero.')
  }
  const loop = options.loop ?? definition.loop
  const fill = options.fill ?? definition.fill
  const direction = options.direction ?? definition.direction
  const commit = options.commit ?? definition.commit
  const bindings = normalizeBindings(options.bindings)
  const contentPackageId = options.contentPackageId || definition.contentPackageId || contentPackageIdFromMetadata(definition.metadata) || currentRuntimePackageId(engine)
  const declaredRequiredRuntimePackages = mergeRuntimePackageIds(
    options.requiredRuntimePackages,
    definition.requiredRuntimePackages,
    requiredRuntimePackagesFromMetadata(definition.metadata),
  )
  const requiredRuntimePackages = declaredRequiredRuntimePackages.length > 0
    ? mergeRuntimePackageIds(contentPackageId ? [contentPackageId] : undefined, declaredRequiredRuntimePackages)
    : undefined
  const projection: ActiveAnimationProjection = {
    id,
    definitionId: definitionId || definition.id,
    contentPackageId,
    requiredRuntimePackages,
    bindings: Object.keys(bindings).length ? bindings : undefined,
    state: 'running',
    startedAt: Date.now(),
    duration: definition.duration,
    delay,
    playbackRate,
    loop,
    fill,
    direction,
    commit,
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
      delay,
      playbackRate,
      loop,
      fill,
      direction,
      commit,
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
  const totalWallDuration = ((playback.projection.delay ?? 0) + playback.projection.duration * loopCount) / playback.projection.playbackRate
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
  if (shouldKeepFilledProjection(playback, complete)) {
    playback.projection = {
      ...playback.projection,
      state: 'stopped',
      endedAt: Date.now(),
    }
    await engine.setAnimationProjection(playback.projection)
  }
  else {
    await engine.removeAnimationProjection(playback.id)
  }
  playback.waiters.forEach(resolve => resolve())
  playback.waiters.clear()
}

function shouldKeepFilledProjection(playback: RuntimePlayback, complete: boolean): boolean {
  if (!complete || playback.definition.commit !== 'none') {
    return false
  }
  return playback.projection.fill === 'forwards' || playback.projection.fill === 'both'
}

async function commitFinalValues(
  engine: QuaEngineInterface,
  runtime: AnimationRuntime,
  playback: RuntimePlayback,
): Promise<void> {
  const commit = playback.definition.commit
  if (commit === 'none')
    return

  await withPlaybackRuntimePackageContext(engine, playback, async (commitEngine) => {
    await commitFinalValuesInContext(commitEngine, runtime, playback, commit)
  })
}

async function commitFinalValuesInContext(
  engine: QuaEngineInterface,
  runtime: AnimationRuntime,
  playback: RuntimePlayback,
  commit: AnimationCommitFinalMode,
): Promise<void> {
  const properties = commit === 'final' ? undefined : new Set(commit.properties)
  for (const track of playback.projection.resolvedTracks) {
    if (properties && !properties.has(track.property))
      continue

    const committedValue = getCommittedTrackValue(track, playback)
    if (!committedValue)
      continue

    const adapter = getAdapter(runtime, track.target)
    if (!adapter?.commit) {
      assertAdapter(engine, runtime, track.target, false)
      continue
    }

    const committed = await adapter.commit(engine, track.target, track.property, committedValue.value)
    if (committed === false) {
      warn(runtime, `Animation adapter "${targetKind(track.target)}" could not commit ${track.target}.${track.property}.`, false)
    }
  }
}

async function withPlaybackRuntimePackageContext<T>(
  engine: QuaEngineInterface,
  playback: RuntimePlayback,
  operation: (engine: QuaEngineInterface) => T | Promise<T>,
): Promise<T> {
  const packageId = playback.projection.contentPackageId
  if (!packageId) {
    return await operation(engine)
  }
  if (engine.withRuntimePackageContext) {
    return await engine.withRuntimePackageContext(packageId, operation)
  }
  return await operation(createRuntimePackageEngineFacade(engine, packageId))
}

function getCommittedTrackValue(
  track: Readonly<ResolvedAnimationTrackProjection>,
  playback: RuntimePlayback,
): { value: unknown } | undefined {
  const keyframes = [...track.keyframes]
    .sort((left, right) => resolveAt(left.at, playback.projection.duration) - resolveAt(right.at, playback.projection.duration))
  if (keyframes.length === 0)
    return undefined

  const terminalTime = getTerminalLocalTime(playback)
  if (terminalTime <= resolveAt(keyframes[0].at, playback.projection.duration)) {
    return { value: keyframes[0].value }
  }

  return { value: keyframes[keyframes.length - 1].value }
}

function getTerminalLocalTime(playback: RuntimePlayback): number {
  const duration = Math.max(0, playback.projection.duration)
  if (duration === 0)
    return 0

  const loop = playback.projection.loop
  const loopCount = typeof loop === 'number' ? Math.max(1, loop) : 1
  const iteration = loopCount - 1
  const direction = playback.projection.direction ?? 'normal'
  const reversed = direction === 'reverse'
    || (direction === 'alternate' && iteration % 2 === 1)
    || (direction === 'alternate-reverse' && iteration % 2 === 0)
  return reversed ? 0 : duration
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
  if (timeline.delay !== undefined && (!Number.isFinite(timeline.delay) || timeline.delay < 0)) {
    throw new Error('Animation timeline delay must be a non-negative number.')
  }
  if (timeline.playbackRate !== undefined && (!Number.isFinite(timeline.playbackRate) || timeline.playbackRate <= 0)) {
    throw new Error('Animation timeline playbackRate must be greater than zero.')
  }

  return {
    ...timeline,
    duration: timeline.duration,
    delay: Math.max(0, timeline.delay ?? 0),
    playbackRate: timeline.playbackRate ?? 1,
    fill: timeline.fill ?? 'forwards',
    direction: timeline.direction ?? 'normal',
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
  const key = animationRuntimeKey(engine)
  const current = runtimes.get(key)
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
  runtimes.set(key, runtime)
  return runtime
}

async function registerAnimationSettingsScope(
  ctx: EngineContext,
  runtime: AnimationRuntime,
  options: AnimationPluginOptions,
): Promise<(() => void) | undefined> {
  try {
    const settings = await import('@quajs/plugin-settings')
    const unregister = settings.registerSettingsScope(ctx.engine, {
      scope: ANIMATION_SETTINGS_SCOPE,
      version: 1,
      title: 'Animation',
      description: 'Animation runtime validation behavior.',
      developer: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            strictAdapters: {
              type: 'boolean',
              title: 'Strict Target Adapters',
              default: false,
            },
          },
        },
        defaults: {
          strictAdapters: false,
        } satisfies AnimationDeveloperSettings,
        values: {
          strictAdapters: options.strictAdapters === true,
        } satisfies AnimationDeveloperSettings,
      },
      apply: async ({ developer }) => {
        runtime.strictAdapters = developer.strictAdapters === true
        reconcileAnimationRuntime(ctx.engine)
      },
    })
    await settings.getSettingsBridge(ctx.engine)?.rebuildProjection({ reason: 'rebuild', apply: true, persist: false })
    return unregister
  }
  catch (error) {
    if (isOptionalPluginUnavailableError(error, '@quajs/plugin-settings')) {
      return undefined
    }
    throw error
  }
}

function animationRuntimeKey(engine: QuaEngineInterface): object {
  return engine.getStore()
}

async function clearAnimationRuntime(engine: QuaEngineInterface): Promise<void> {
  const runtime = getRuntime(engine)
  await Promise.all([...runtime.playbacks.values()].map(playback => finishPlayback(engine, runtime, playback, false)))
  runtime.definitions.clear()
  runtime.warned.clear()
  await engine.clearAnimationProjections()
}

async function removeRuntimePackageAnimations(engine: QuaEngineInterface, packageId: string): Promise<void> {
  const runtime = getRuntime(engine)
  const playbacks = [...runtime.playbacks.values()]
    .filter(playback =>
      animationProjectionRequiresPackage(playback.projection, packageId)
      || timelineRequiresPackage(playback.definition, packageId),
    )
  await Promise.all(playbacks.map(playback => finishPlayback(engine, runtime, playback, false)))

  const packageProjectionIds = (engine.getViewState().animations || [])
    .filter(projection => animationProjectionRequiresPackage(projection, packageId))
    .map(projection => projection.id)
  await Promise.all(packageProjectionIds.map(id => engine.removeAnimationProjection(id)))

  for (const [id, definition] of runtime.definitions.entries()) {
    if (timelineRequiresPackage(definition, packageId)) {
      runtime.definitions.delete(id)
    }
  }
}

function reconcileAnimationRuntime(engine: QuaEngineInterface): void {
  const runtime = getRuntime(engine)
  for (const playback of runtime.playbacks.values()) {
    clearPlaybackTimer(playback)
    playback.waiters.forEach(resolve => resolve())
    playback.waiters.clear()
  }
  runtime.playbacks.clear()

  for (const projection of engine.getViewState().animations || []) {
    if (projection.state === 'stopped') {
      continue
    }
    const definition = timelineFromProjection(projection)
    const playback: RuntimePlayback = {
      id: projection.id,
      definition,
      projection: {
        ...projection,
        resolvedTracks: projection.resolvedTracks.map(track => ({
          ...track,
          keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
        })),
      },
      waiters: new Set(),
    }
    runtime.playbacks.set(playback.id, playback)
    if (projection.state === 'running') {
      scheduleCompletion(engine, runtime, playback)
    }
  }
}

function timelineFromProjection(projection: Readonly<ActiveAnimationProjection>): NormalizedAnimationTimeline {
  return {
    id: projection.definitionId || projection.id,
    contentPackageId: projection.contentPackageId,
    requiredRuntimePackages: projection.requiredRuntimePackages,
    duration: projection.duration,
    delay: Math.max(0, projection.delay ?? 0),
    playbackRate: projection.playbackRate,
    loop: projection.loop,
    fill: projection.fill ?? 'forwards',
    direction: projection.direction ?? 'normal',
    commit: projection.commit ?? 'none',
    tracks: projection.resolvedTracks.map(track => ({
      target: track.target,
      property: track.property,
      interpolation: track.interpolation,
      keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
    })),
  }
}

function contentPackageIdFromMetadata(metadata?: Readonly<Record<string, unknown>>): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}

function requiredRuntimePackagesFromMetadata(metadata?: Readonly<Record<string, unknown>>): string[] {
  return Array.isArray(metadata?.requiredRuntimePackages)
    ? metadata.requiredRuntimePackages.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function animationProjectionRequiresPackage(projection: Readonly<ActiveAnimationProjection>, packageId: string): boolean {
  return projection.contentPackageId === packageId
    || projection.requiredRuntimePackages?.includes(packageId) === true
}

function timelineRequiresPackage(timeline: Readonly<AnimationTimeline>, packageId: string): boolean {
  return timeline.contentPackageId === packageId
    || timeline.requiredRuntimePackages?.includes(packageId) === true
    || contentPackageIdFromMetadata(timeline.metadata) === packageId
    || requiredRuntimePackagesFromMetadata(timeline.metadata).includes(packageId)
}

function mergeRuntimePackageIds(...groups: Array<readonly string[] | undefined>): string[] {
  return Array.from(new Set(groups.flatMap(group => group || []).filter(Boolean)))
}

function withCurrentRuntimeAnimationPackage<TTimeline extends NormalizedAnimationTimeline>(
  engine: QuaEngineInterface,
  timeline: TTimeline,
): TTimeline {
  const packageId = currentRuntimePackageId(engine)
  if (!packageId) {
    return timeline
  }
  if (timeline.contentPackageId) {
    return timeline
  }
  const metadataPackageId = contentPackageIdFromMetadata(timeline.metadata)
  if (metadataPackageId) {
    return {
      ...timeline,
      requiredRuntimePackages: mergeRuntimePackageIds(
        timeline.requiredRuntimePackages,
        [metadataPackageId],
        requiredRuntimePackagesFromMetadata(timeline.metadata),
        metadataPackageId !== packageId ? [packageId] : undefined,
      ),
    }
  }
  return {
    ...timeline,
    contentPackageId: packageId,
  }
}

function currentRuntimePackageId(engine: QuaEngineInterface): string | undefined {
  return (engine as Partial<QuaEngineInterface>).getCurrentRuntimePackageId?.()
    || (engine as Partial<QuaEngineInterface>).getStoryPoint?.()?.contentPackageId
}

function withCurrentRuntimeMetadata(
  engine: QuaEngineInterface,
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  const packageId = currentRuntimePackageId(engine)
  return packageId
    ? mergeRuntimePackageRecord(metadata || {}, packageId)
    : metadata ? cloneUnknownRecord(metadata) : undefined
}

function withCurrentRuntimeProjectionRecord<TRecord extends Record<string, unknown>>(
  engine: QuaEngineInterface,
  record: TRecord,
): TRecord {
  const packageId = currentRuntimePackageId(engine)
  return packageId ? mergeRuntimePackageRecord(record, packageId) as TRecord : record
}

function mergeRuntimePackageRecord(
  record: Readonly<Record<string, unknown>>,
  packageId: string,
): Record<string, unknown> {
  const next = cloneUnknownRecord(record)
  const currentPackageId = contentPackageIdFromMetadata(next)
  const requiredRuntimePackages = requiredRuntimePackagesFromMetadata(next)
  if (!currentPackageId && requiredRuntimePackages.length === 0) {
    next.contentPackageId = packageId
    return next
  }
  if (currentPackageId === packageId && requiredRuntimePackages.length === 0) {
    return next
  }
  next.requiredRuntimePackages = mergeRuntimePackageIds(
    currentPackageId ? [currentPackageId] : undefined,
    requiredRuntimePackages,
    [packageId],
  )
  return next
}

function createRuntimePackageEngineFacade(engine: QuaEngineInterface, packageId: string): QuaEngineInterface {
  return new Proxy(engine, {
    get(target, property, receiver) {
      if (property === 'getCurrentRuntimePackageId') {
        return () => packageId
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(receiver) : value
    },
  })
}

function isOptionalPluginUnavailableError(error: unknown, packageName: string): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return error.message.includes(packageName)
    && (
      error.message.includes('Cannot find package')
      || error.message.includes('Cannot find module')
      || error.message.includes('Failed to resolve')
    )
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
          next.metadata = withCurrentRuntimeMetadata(engine, next.metadata)
          return next
        }),
      })
      return true
    },
  })

  registerAnimationTargetAdapter('stage', {
    kind: 'stage',
    exists: () => true,
    commit: async (engine, _selector, property, value) => {
      const current = engine.getPluginProjection<Readonly<Record<string, unknown>>>('stage') || {}
      const next = cloneUnknownRecord(current)
      setPath(next, property, value)
      await engine.setPluginProjection('stage', withCurrentRuntimeProjectionRecord(engine, next))
      return true
    },
  })

  registerAnimationTargetAdapter('camera', {
    kind: 'camera',
    exists: () => true,
    commit: async (engine, _selector, property, value) => {
      const current = engine.getPluginProjection<Readonly<Record<string, unknown>>>('camera') || {}
      const next = cloneUnknownRecord(current)
      setPath(next, property, value)
      await engine.setPluginProjection('camera', withCurrentRuntimeProjectionRecord(engine, next))
      return true
    },
  })

  registerAnimationTargetAdapter('dialogue', {
    kind: 'dialogue',
    exists: engine => engine.getViewState().dialogue.visible,
    commit: async (engine, _selector, property, value) => {
      if (!isDialogueStateProperty(property)) {
        const current = engine.getPluginProjection<Readonly<Record<string, unknown>>>('dialogue') || {}
        const next = cloneUnknownRecord(current)
        setPath(next, property, value)
        await engine.setPluginProjection('dialogue', withCurrentRuntimeProjectionRecord(engine, next))
        return true
      }

      const next = cloneUnknownRecord(engine.getViewState().dialogue as unknown as Readonly<Record<string, unknown>>)
      setPath(next, property, value)
      if (next.visible === false) {
        await engine.hideDialogue()
      }
      else {
        await engine.showDialogue(next as any)
      }
      return true
    },
  })

  registerAnimationTargetAdapter('richText', {
    kind: 'richText',
    exists: (engine, selector) => Boolean(getRichTextDocument(engine, parseRichTextSelector(selector).prefix)),
    commit: async (engine, selector, property, value) => {
      const { prefix } = parseRichTextSelector(selector)
      const current = getRichTextDocument(engine, prefix)
      if (!current)
        return false

      const next = cloneRichTextDocument(current)
      setPath(next as unknown as Record<string, unknown>, property, value)
      await commitRichTextDocument(engine, prefix, next)
      return true
    },
  })

  registerAnimationTargetAdapter('richTextBlock', {
    kind: 'richTextBlock',
    exists: (engine, selector) => {
      const { prefix, itemId } = parseRichTextSelector(selector)
      const current = getRichTextDocument(engine, prefix)
      return Boolean(current && itemId && findRichTextBlock(current, itemId))
    },
    commit: async (engine, selector, property, value) => {
      const { prefix, itemId } = parseRichTextSelector(selector)
      const current = getRichTextDocument(engine, prefix)
      if (!current || !itemId)
        return false

      const next = cloneRichTextDocument(current)
      const block = findRichTextBlock(next, itemId)
      if (!block)
        return false

      setPath(block as unknown as Record<string, unknown>, property, value)
      await commitRichTextDocument(engine, prefix, next)
      return true
    },
  })

  registerAnimationTargetAdapter('richTextSpan', {
    kind: 'richTextSpan',
    exists: (engine, selector) => {
      const { prefix, itemId } = parseRichTextSelector(selector)
      const current = getRichTextDocument(engine, prefix)
      return Boolean(current && itemId && findRichTextSpans(current, itemId).length > 0)
    },
    commit: async (engine, selector, property, value) => {
      const { prefix, itemId } = parseRichTextSelector(selector)
      const current = getRichTextDocument(engine, prefix)
      if (!current || !itemId)
        return false

      const next = cloneRichTextDocument(current)
      const spans = findRichTextSpans(next, itemId)
      if (spans.length === 0)
        return false

      for (const span of spans) {
        setPath(span as unknown as Record<string, unknown>, property, value)
      }
      await commitRichTextDocument(engine, prefix, next)
      return true
    },
  })

  registerAnimationTargetAdapter('choices', {
    kind: 'choices',
    exists: engine => engine.getViewState().choices.length > 0,
    commit: async (engine, _selector, property, value) => {
      const current = engine.getPluginProjection<Readonly<Record<string, unknown>>>('choices') || {}
      const next = cloneUnknownRecord(current)
      setPath(next, property, value)
      await engine.setPluginProjection('choices', withCurrentRuntimeProjectionRecord(engine, next))
      return true
    },
  })

  registerAnimationTargetAdapter('choice', {
    kind: 'choice',
    exists: (engine, selector) => engine.getViewState().choices.some(choice => choice.id === targetId(selector)),
    commit: async (engine, selector, property, value) => {
      const choiceId = targetId(selector)
      const choices = engine.getViewState().choices
      if (!choices.some(choice => choice.id === choiceId))
        return false
      if (!isChoiceStateProperty(property)) {
        const current = engine.getPluginProjection<Readonly<Record<string, unknown>>>('choices') || {}
        const next = cloneUnknownRecord(current)
        const choiceMap = next.choices && typeof next.choices === 'object' && !Array.isArray(next.choices)
          ? cloneUnknownRecord(next.choices as Readonly<Record<string, unknown>>)
          : {}
        const currentChoice = choiceMap[choiceId]
        const nextChoice = currentChoice && typeof currentChoice === 'object' && !Array.isArray(currentChoice)
          ? cloneUnknownRecord(currentChoice as Readonly<Record<string, unknown>>)
          : {}
        setPath(nextChoice, property, value)
        choiceMap[choiceId] = nextChoice
        next.choices = choiceMap
        await engine.setPluginProjection('choices', withCurrentRuntimeProjectionRecord(engine, next))
        return true
      }
      await engine.showChoices(choices.map((choice) => {
        if (choice.id !== choiceId)
          return { ...choice }
        const next = cloneUnknownRecord(choice as unknown as Readonly<Record<string, unknown>>)
        setPath(next, property, value)
        return next as any
      }))
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

  registerAnimationTargetAdapter('audioBus', {
    kind: 'audioBus',
    exists: engine => Boolean(engine.getPluginProjection<Readonly<Record<string, unknown>>>('audio')),
    commit: async (engine, selector, property, value) => {
      const audio = engine.getPluginProjection<Readonly<Record<string, unknown>>>('audio')
      if (!audio)
        return false
      const next = cloneUnknownRecord(audio)
      setPath(next, `buses.${targetId(selector)}.${property}`, value)
      await engine.setPluginProjection('audio', withCurrentRuntimeProjectionRecord(engine, next))
      return true
    },
  })

  registerAnimationTargetAdapter('audioTrack', {
    kind: 'audioTrack',
    exists: engine => Boolean(engine.getPluginProjection<Readonly<Record<string, unknown>>>('audio')),
    commit: async (engine, selector, property, value) => {
      const audio = engine.getPluginProjection<Readonly<Record<string, unknown>>>('audio')
      if (!audio)
        return false
      const next = cloneUnknownRecord(audio)
      const trackId = targetId(selector)
      if (setAudioTrackPath(next, trackId, property, value)) {
        await engine.setPluginProjection('audio', withCurrentRuntimeProjectionRecord(engine, next))
        return true
      }
      return false
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
    composition: background.composition ? cloneUnknownRecord(background.composition) : undefined,
    metadata: background.metadata ? cloneUnknownRecord(background.metadata) : undefined,
  }
}

function cloneBackgroundLayer(layer: Readonly<ViewBackgroundLayerProjection>): ViewBackgroundLayerProjection {
  return {
    ...layer,
    composition: layer.composition ? cloneUnknownRecord(layer.composition) : undefined,
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

function getRichTextDocument(
  engine: QuaEngineInterface,
  prefix: string | undefined,
): Readonly<RichTextDocumentProjection> | undefined {
  const dialogue = engine.getViewState().dialogue
  if (!dialogue.visible)
    return undefined

  if (prefix === 'dialogue') {
    return isRichTextDocument(dialogue.text) ? dialogue.text : undefined
  }
  if (prefix === 'speaker') {
    return isRichTextDocument(dialogue.speaker) ? dialogue.speaker : undefined
  }
  return undefined
}

async function commitRichTextDocument(
  engine: QuaEngineInterface,
  prefix: string | undefined,
  document: RichTextDocumentProjection,
): Promise<boolean> {
  const dialogue = engine.getViewState().dialogue
  if (!dialogue.visible)
    return false

  if (prefix === 'dialogue') {
    await engine.showDialogue({
      ...dialogue,
      text: document,
    } as any)
    return true
  }
  if (prefix === 'speaker') {
    await engine.showDialogue({
      ...dialogue,
      speaker: document,
    } as any)
    return true
  }
  return false
}

function parseRichTextSelector(selector: string): { prefix?: string, itemId?: string } {
  const parts = selector.split(':')
  return {
    prefix: parts[1],
    itemId: parts.length > 2 ? parts.slice(2).join(':') : undefined,
  }
}

function findRichTextBlock(
  document: Readonly<RichTextDocumentProjection>,
  itemId: string,
): RichTextBlockProjection | undefined {
  return document.blocks.find((block, index) => richTextItemMatches(block.id, index, itemId)) as RichTextBlockProjection | undefined
}

function findRichTextSpans(
  document: Readonly<RichTextDocumentProjection>,
  itemId: string,
): RichTextSpanProjection[] {
  const spans: RichTextSpanProjection[] = []
  for (const block of document.blocks) {
    block.spans.forEach((span, index) => {
      if (richTextItemMatches(span.id, index, itemId)) {
        spans.push(span as RichTextSpanProjection)
      }
    })
  }
  return spans
}

function richTextItemMatches(id: string | undefined, index: number, itemId: string): boolean {
  return id === itemId || (!id && String(index) === itemId)
}

function cloneRichTextDocument(document: Readonly<RichTextDocumentProjection>): RichTextDocumentProjection {
  return {
    ...document,
    metadata: document.metadata ? cloneUnknownRecord(document.metadata) : undefined,
    blocks: document.blocks.map(block => cloneRichTextBlock(block)),
  }
}

function cloneRichTextBlock(block: Readonly<RichTextBlockProjection>): RichTextBlockProjection {
  return {
    ...block,
    metadata: block.metadata ? cloneUnknownRecord(block.metadata) : undefined,
    spans: block.spans.map(span => cloneRichTextSpan(span)),
  }
}

function cloneRichTextSpan(span: Readonly<RichTextSpanProjection>): RichTextSpanProjection {
  return {
    ...span,
    metadata: span.metadata ? cloneUnknownRecord(span.metadata) : undefined,
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

function isDialogueStateProperty(property: string): boolean {
  return property === 'visible'
    || property === 'text'
    || property.startsWith('text.')
    || property === 'speaker'
    || property.startsWith('speaker.')
    || property === 'speakerStyle'
    || property.startsWith('speakerStyle.')
    || property === 'characterId'
    || property === 'characterName'
    || property === 'mode'
}

function isChoiceStateProperty(property: string): boolean {
  return property === 'id'
    || property === 'text'
    || property === 'enabled'
    || property === 'metadata'
    || property.startsWith('metadata.')
}

function setAudioTrackPath(audio: Record<string, unknown>, trackId: string, property: string, value: unknown): boolean {
  if (audio.bgm && typeof audio.bgm === 'object' && (audio.bgm as Record<string, unknown>).id === trackId) {
    setPath(audio.bgm as Record<string, unknown>, property, value)
    return true
  }

  for (const collection of ['voices', 'sfx', 'ambients']) {
    const tracks = audio[collection]
    if (!Array.isArray(tracks))
      continue

    const index = tracks.findIndex(track => track && typeof track === 'object' && (track as Record<string, unknown>).id === trackId)
    if (index === -1)
      continue

    const nextTrack = cloneUnknownRecord(tracks[index] as Readonly<Record<string, unknown>>)
    setPath(nextTrack, property, value)
    tracks[index] = nextTrack
    return true
  }

  return false
}

export const metadata = {
  name: '@quajs/plugin-animation',
  version: '0.1.0',
  description: 'Cross-plugin timeline animation APIs and QuaScript decorators',
  category: 'visual',
} as const

export { animationDecoratorMappings, decorators } from './decorators'
export {
  backgroundCrossfade,
  characterBlink,
  characterBreath,
  characterEnter,
  characterExit,
  characterHop,
  choicesStagger,
  dialogueTransition,
  stageFade,
  stageFlash,
  stageShake,
  visualNovelMotionPresets,
} from './presets'
export type {
  BackgroundCrossfadeOptions,
  ChoicesStaggerOptions,
  VisualNovelMotionOptions,
} from './presets'
export const Plugin = AnimationPlugin
