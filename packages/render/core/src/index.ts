import type { EventListener, Pipeline, PipelineContext } from '@quajs/pipeline'

export enum LogicToRenderEvents {
  SCENE_INIT = 'scene/init',
  SCENE_CHANGE = 'scene/change',
  SCENE_DESTROY = 'scene/destroy',
  VIEW_UPDATE = 'view/update',
  BACKGROUND_SET = 'background/set',
  BACKGROUND_CLEAR = 'background/clear',
  UI_SHOW = 'ui/show',
  UI_HIDE = 'ui/hide',
  UI_UPDATE = 'ui/update',
  CHARACTER_SHOW = 'character/show',
  CHARACTER_HIDE = 'character/hide',
  CHARACTER_MOVE = 'character/move',
  CHARACTER_EXPRESSION = 'character/expression',
  CHARACTER_SPRITE = 'character/sprite',
  DIALOGUE_SHOW = 'dialogue/show',
  DIALOGUE_HIDE = 'dialogue/hide',
  DIALOGUE_UPDATE = 'dialogue/update',
  DIALOGUE_CHOICE = 'dialogue/choice',
  EFFECT_FADE_IN = 'effect/fade_in',
  EFFECT_FADE_OUT = 'effect/fade_out',
  EFFECT_SHAKE = 'effect/shake',
  EFFECT_FLASH = 'effect/flash',
  GAME_SAVE = 'game/save',
  GAME_LOAD = 'game/load',
  GAME_PAUSE = 'game/pause',
  GAME_RESUME = 'game/resume',
  ASSET_CHANGED = 'asset/changed',
  SYSTEM_MESSAGE = 'system/message',
  SYSTEM_ERROR = 'system/error',
}

export enum RenderToLogicEvents {
  USER_CLICK = 'user/click',
  USER_KEY_PRESS = 'user/key_press',
  USER_ADVANCE = 'user/advance',
  USER_CHOICE_SELECT = 'user/choice_select',
  FLOW_CONTROL_SET_MODE_REQUEST = 'flow_control/set_mode_request',
  FLOW_CONTROL_START_AUTO_REQUEST = 'flow_control/start_auto_request',
  FLOW_CONTROL_STOP_AUTO_REQUEST = 'flow_control/stop_auto_request',
  FLOW_CONTROL_START_SKIP_REQUEST = 'flow_control/start_skip_request',
  FLOW_CONTROL_STOP_SKIP_REQUEST = 'flow_control/stop_skip_request',
  FLOW_CONTROL_START_FAST_FORWARD_REQUEST = 'flow_control/start_fast_forward_request',
  FLOW_CONTROL_STOP_FAST_FORWARD_REQUEST = 'flow_control/stop_fast_forward_request',
  GAME_SAVE_REQUEST = 'game/save_request',
  GAME_LOAD_REQUEST = 'game/load_request',
  UI_REQUEST_OPEN = 'ui/request_open',
  UI_REQUEST_CLOSE = 'ui/request_close',
  UI_REQUEST_UPDATE = 'ui/request_update',
  WINDOW_FOCUS = 'window/focus',
  WINDOW_BLUR = 'window/blur',
  ASSET_LOADED = 'asset/loaded',
  ASSET_ERROR = 'asset/error',
  RENDER_READY = 'render/ready',
  RENDER_DESTROYED = 'render/destroyed',
  SCENE_READY = 'scene/ready',
}

export type EngineEvents = LogicToRenderEvents | RenderToLogicEvents

export type ViewLayoutOrientation = 'landscape' | 'portrait'
export type ViewLayoutScaleMode = 'fit'
export type ViewLayoutPreset = ViewLayoutOrientation

export interface ViewLayoutProjection {
  orientation: ViewLayoutOrientation
  width: number
  height: number
  /** Preferred/reference aspect ratio. Renderers resolve the active ratio from the container and clamp it into the min/max interval. */
  aspectRatio: number
  minAspectRatio: number
  maxAspectRatio: number
  scaleMode: ViewLayoutScaleMode
}

export type ViewLayoutInput
  = | ViewLayoutPreset
    | (Partial<ViewLayoutProjection> & {
      preset?: ViewLayoutPreset
    })

export const QUA_LANDSCAPE_LAYOUT: ViewLayoutProjection = {
  orientation: 'landscape',
  width: 1920,
  height: 1080,
  aspectRatio: 16 / 9,
  minAspectRatio: 16 / 10,
  maxAspectRatio: 16 / 9,
  scaleMode: 'fit',
}

export const QUA_PORTRAIT_LAYOUT: ViewLayoutProjection = {
  orientation: 'portrait',
  width: 1080,
  height: 2340,
  aspectRatio: 9 / 19.5,
  minAspectRatio: 9 / 21,
  maxAspectRatio: 9 / 16,
  scaleMode: 'fit',
}

export const QUA_LAYOUT_PRESETS: Readonly<Record<ViewLayoutPreset, ViewLayoutProjection>> = {
  landscape: QUA_LANDSCAPE_LAYOUT,
  portrait: QUA_PORTRAIT_LAYOUT,
}

export function createViewLayoutProjection(input: ViewLayoutInput = 'landscape'): ViewLayoutProjection {
  const patch: Partial<ViewLayoutProjection> & { preset?: ViewLayoutPreset } = typeof input === 'string' ? {} : input
  const base = getViewLayoutPreset(typeof input === 'string' ? input : patch.preset || patch.orientation || 'landscape')
  const width = positiveNumber(patch.width, base.width)
  const height = positiveNumber(patch.height, base.height)
  const preferredAspectRatio = positiveNumber(patch.aspectRatio, width / height)
  let minAspectRatio = positiveNumber(patch.minAspectRatio, base.minAspectRatio)
  let maxAspectRatio = positiveNumber(patch.maxAspectRatio, base.maxAspectRatio)

  if (minAspectRatio > maxAspectRatio) {
    const nextMin = maxAspectRatio
    maxAspectRatio = minAspectRatio
    minAspectRatio = nextMin
  }

  return {
    orientation: base.orientation,
    width,
    height,
    aspectRatio: clamp(preferredAspectRatio, minAspectRatio, maxAspectRatio),
    minAspectRatio,
    maxAspectRatio,
    scaleMode: patch.scaleMode || base.scaleMode,
  }
}

export type BackgroundMode = 'image' | 'video' | 'layered'

export type BackgroundLayerAssetType = 'images' | 'video' | 'characters' | string
export type BackgroundFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
export type BackgroundBlendMode
  = | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'color-dodge'
    | 'color-burn'
    | 'hard-light'
    | 'soft-light'
    | 'difference'
    | 'exclusion'
    | 'hue'
    | 'saturation'
    | 'color'
    | 'luminosity'
    | string

export interface BackgroundFilterProjection {
  blur?: number
  brightness?: number
  contrast?: number
  saturate?: number
  hueRotate?: number
  grayscale?: number
  sepia?: number
  dropShadow?: string
}

export interface BackgroundMaskProjection {
  assetName?: string
  assetType?: BackgroundLayerAssetType
  mode?: 'alpha' | 'luminance' | 'match-source' | string
  position?: string
  size?: string
  repeat?: string
}

export interface BackgroundCompositionProjection {
  blendMode?: BackgroundBlendMode
  isolation?: boolean
  filter?: Readonly<BackgroundFilterProjection>
  mask?: Readonly<BackgroundMaskProjection>
}

export interface ViewVideoBackgroundProjection {
  assetName: string
  loop?: boolean
  muted?: boolean
  volume?: number
  playbackRate?: number
  poster?: string
  transition?: TransitionIntent
  metadata?: Readonly<Record<string, unknown>>
}

export interface ViewBackgroundLayerProjection {
  id: string
  assetName: string
  assetType?: BackgroundLayerAssetType
  visible?: boolean
  fit?: BackgroundFit
  origin?: string
  width?: number | string
  height?: number | string
  x?: number
  y?: number
  scale?: number
  rotation?: number
  opacity?: number
  composition?: Readonly<BackgroundCompositionProjection>
  zIndex?: number
  transition?: TransitionIntent
  metadata?: Readonly<Record<string, unknown>>
}

export interface ViewBackgroundProjection {
  mode: BackgroundMode
  assetName?: string
  fit?: BackgroundFit
  origin?: string
  width?: number | string
  height?: number | string
  x?: number
  y?: number
  scale?: number
  rotation?: number
  opacity?: number
  composition?: Readonly<BackgroundCompositionProjection>
  transition?: TransitionIntent
  video?: Readonly<ViewVideoBackgroundProjection>
  layers?: readonly Readonly<ViewBackgroundLayerProjection>[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface ViewCharacterProjection {
  id: string
  name: string
  visible: boolean
  sprite?: string
  expression?: string
  position?: CharacterPosition
  opacity?: number
  layer?: number
  metadata?: Readonly<Record<string, unknown>>
}

export interface CharacterPosition {
  x?: number
  y?: number
  xPercent?: number
  yPercent?: number
  scale?: number
  rotation?: number
  anchor?: 'left' | 'center' | 'right' | string
}

export interface ViewDialogueProjection {
  visible: boolean
  characterId?: string
  characterName?: string
  text: string
  mode?: 'say' | 'narration'
}

export interface ViewChoiceProjection {
  id: string
  text: string
  enabled: boolean
  metadata?: Readonly<Record<string, unknown>>
}

export interface ViewUiProjection {
  visible: boolean
  overlays?: Readonly<Record<string, unknown>>
}

export interface ViewEffectProjection {
  id: string
  type: string
  target?: string
  duration?: number
  intensity?: number
  options?: Readonly<Record<string, unknown>>
}

export type FlowControlMode = 'normal' | 'auto' | 'skip' | 'fast-forward'
export type FlowControlSkipMode = 'read' | 'all'

export interface FlowControlPolicy {
  skippable?: boolean
  fastForwardable?: boolean
  autoAdvanceable?: boolean
  tags?: readonly string[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface ResolvedFlowControlPolicy {
  skippable: boolean
  fastForwardable: boolean
  autoAdvanceable: boolean
  tags?: readonly string[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface FlowControlTimingProjection {
  skipAdvanceDelayMs: number
  fastForwardAdvanceDelayMs: number
  autoAdvanceDelayMs: number
}

export interface FlowControlControlsProjection {
  canSkip: boolean
  canFastForward: boolean
  canAutoAdvance: boolean
}

export interface FlowControlAdvanceProjection {
  mode: Exclude<FlowControlMode, 'normal'>
  source: string
  timestamp: number
}

export interface FlowControlProjectionInput {
  revision?: number
  mode?: FlowControlMode
  skipMode?: FlowControlSkipMode
  policy?: FlowControlPolicy
  defaultPolicy?: FlowControlPolicy
  timings?: Partial<FlowControlTimingProjection>
  stopAtChoices?: boolean
  lastAdvance?: FlowControlAdvanceProjection
}

export interface ViewFlowControlProjection {
  revision: number
  mode: FlowControlMode
  skipMode: FlowControlSkipMode
  policy: Readonly<ResolvedFlowControlPolicy>
  defaultPolicy: Readonly<ResolvedFlowControlPolicy>
  controls: Readonly<FlowControlControlsProjection>
  timings: Readonly<FlowControlTimingProjection>
  stopAtChoices: boolean
  lastAdvance?: Readonly<FlowControlAdvanceProjection>
}

export const QUA_DEFAULT_FLOW_CONTROL_POLICY: ResolvedFlowControlPolicy = {
  skippable: true,
  fastForwardable: true,
  autoAdvanceable: true,
}

export const QUA_DEFAULT_FLOW_CONTROL_TIMINGS: FlowControlTimingProjection = {
  skipAdvanceDelayMs: 0,
  fastForwardAdvanceDelayMs: 80,
  autoAdvanceDelayMs: 1200,
}

export function createFlowControlProjection(input: FlowControlProjectionInput = {}): ViewFlowControlProjection {
  const defaultPolicy = normalizeFlowControlPolicy(input.defaultPolicy, QUA_DEFAULT_FLOW_CONTROL_POLICY)
  const policy = normalizeFlowControlPolicy(input.policy, defaultPolicy)
  return {
    revision: input.revision ?? 0,
    mode: input.mode || 'normal',
    skipMode: input.skipMode || 'read',
    policy,
    defaultPolicy,
    controls: createFlowControlControls(policy),
    timings: {
      skipAdvanceDelayMs: nonNegativeNumber(input.timings?.skipAdvanceDelayMs, QUA_DEFAULT_FLOW_CONTROL_TIMINGS.skipAdvanceDelayMs),
      fastForwardAdvanceDelayMs: nonNegativeNumber(input.timings?.fastForwardAdvanceDelayMs, QUA_DEFAULT_FLOW_CONTROL_TIMINGS.fastForwardAdvanceDelayMs),
      autoAdvanceDelayMs: nonNegativeNumber(input.timings?.autoAdvanceDelayMs, QUA_DEFAULT_FLOW_CONTROL_TIMINGS.autoAdvanceDelayMs),
    },
    stopAtChoices: input.stopAtChoices !== false,
    lastAdvance: input.lastAdvance ? { ...input.lastAdvance } : undefined,
  }
}

export type AnimationTime = number | `${number}%`
export type AnimationInterpolation = 'number' | 'step' | 'discrete' | 'color' | 'array' | 'vector'
export type AnimationPlaybackState = 'running' | 'paused' | 'stopped'
export type AnimationFillMode = 'none' | 'forwards' | 'backwards' | 'both'
export type AnimationDirection = 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
export type AnimationCommitMode = 'none' | 'final' | { properties: readonly string[] }

export interface AnimationKeyframeProjection {
  at: AnimationTime
  value: unknown
  easing?: string
}

export interface ResolvedAnimationTrackProjection {
  target: string
  property: string
  keyframes: readonly Readonly<AnimationKeyframeProjection>[]
  interpolation?: AnimationInterpolation
}

export interface ActiveAnimationProjection {
  id: string
  definitionId?: string
  bindings?: Readonly<Record<string, string>>
  state: AnimationPlaybackState
  startedAt: number
  duration: number
  playbackRate: number
  delay?: number
  pausedAt?: number
  endedAt?: number
  loop?: boolean | number
  fill?: AnimationFillMode
  direction?: AnimationDirection
  commit?: AnimationCommitMode
  resolvedTracks: readonly Readonly<ResolvedAnimationTrackProjection>[]
}

export interface QuaViewProjection {
  layout: Readonly<ViewLayoutProjection>
  background?: Readonly<ViewBackgroundProjection>
  characters: readonly Readonly<ViewCharacterProjection>[]
  dialogue: Readonly<ViewDialogueProjection>
  choices: readonly Readonly<ViewChoiceProjection>[]
  ui: Readonly<ViewUiProjection>
  flowControl: Readonly<ViewFlowControlProjection>
  effects: readonly Readonly<ViewEffectProjection>[]
  animations: readonly Readonly<ActiveAnimationProjection>[]
  plugins: Readonly<ViewPluginProjectionMap>
}

export interface ViewPluginProjectionMap {
  [pluginId: string]: unknown
}

export interface TransitionIntent {
  type: 'fade' | 'slide' | 'instant' | string
  duration?: number
  easing?: string
}

export type SceneTransitionType
  = | 'instant'
    | 'fade'
    | 'crossfade'
    | 'wipe'
    | 'slide_left'
    | 'slide_right'
    | 'slide_up'
    | 'slide_down'
    | 'zoom_in'
    | 'zoom_out'
    | (string & {})

export interface SceneTransitionIntent extends Omit<TransitionIntent, 'type'> {
  type: SceneTransitionType
  waitForRenderer?: boolean
  rendererReadyTimeout?: number
}

export interface SceneInitPayload {
  sceneId: string
  config?: Record<string, unknown>
  stepId?: string
}

export interface SceneChangePayload {
  fromScene?: string
  toScene: string
  transition?: SceneTransitionIntent
}

export interface BackgroundSetPayload extends ViewBackgroundProjection {}

export interface CharacterPayload {
  id: string
  name?: string
  sprite?: string
  expression?: string
  position?: CharacterPosition
  opacity?: number
  layer?: number
}

export interface DialogueShowPayload {
  characterId?: string
  characterName?: string
  text: string
  choices?: ViewChoiceProjection[]
}

export interface ChoiceShowPayload {
  choices: ViewChoiceProjection[]
}

export interface EffectPayload {
  id?: string
  type?: string
  target?: string
  duration?: number
  intensity?: number
}

export interface UserClickPayload {
  /** Logical stage x coordinate. Raw browser coordinates must use explicitly named fields instead. */
  x?: number
  /** Logical stage y coordinate. Raw browser coordinates must use explicitly named fields instead. */
  y?: number
  target?: string
}

export interface UserChoiceSelectPayload {
  choiceId: string
}

export interface FlowControlSetModePayload {
  mode: FlowControlMode
  source?: string
}

export interface RendererLifecyclePayload {
  rendererId?: string
  timestamp?: number
}

export interface AssetLoadedPayload {
  assetId: string
  type?: string
  name?: string
}

export interface AssetErrorPayload {
  assetId?: string
  type?: string
  name?: string
  error: string
}

export interface LogicToRenderEventPayloadMap {
  [LogicToRenderEvents.SCENE_INIT]: SceneInitPayload
  [LogicToRenderEvents.SCENE_CHANGE]: SceneChangePayload
  [LogicToRenderEvents.SCENE_DESTROY]: { sceneId: string }
  [LogicToRenderEvents.VIEW_UPDATE]: { view: QuaViewProjection }
  [LogicToRenderEvents.BACKGROUND_SET]: BackgroundSetPayload
  [LogicToRenderEvents.BACKGROUND_CLEAR]: Record<string, never>
  [LogicToRenderEvents.UI_SHOW]: { elementId: string, config?: Record<string, unknown> }
  [LogicToRenderEvents.UI_HIDE]: { elementId: string }
  [LogicToRenderEvents.UI_UPDATE]: { elementId: string, config?: Record<string, unknown> }
  [LogicToRenderEvents.CHARACTER_SHOW]: CharacterPayload
  [LogicToRenderEvents.CHARACTER_HIDE]: { id: string }
  [LogicToRenderEvents.CHARACTER_MOVE]: Pick<CharacterPayload, 'id' | 'position'>
  [LogicToRenderEvents.CHARACTER_EXPRESSION]: Pick<CharacterPayload, 'id' | 'expression'>
  [LogicToRenderEvents.CHARACTER_SPRITE]: Pick<CharacterPayload, 'id' | 'sprite'>
  [LogicToRenderEvents.DIALOGUE_SHOW]: DialogueShowPayload
  [LogicToRenderEvents.DIALOGUE_HIDE]: Record<string, never>
  [LogicToRenderEvents.DIALOGUE_UPDATE]: DialogueShowPayload
  [LogicToRenderEvents.DIALOGUE_CHOICE]: ChoiceShowPayload
  [LogicToRenderEvents.EFFECT_FADE_IN]: EffectPayload
  [LogicToRenderEvents.EFFECT_FADE_OUT]: EffectPayload
  [LogicToRenderEvents.EFFECT_SHAKE]: EffectPayload
  [LogicToRenderEvents.EFFECT_FLASH]: EffectPayload
  [LogicToRenderEvents.GAME_SAVE]: { slotId?: string }
  [LogicToRenderEvents.GAME_LOAD]: { slotId?: string }
  [LogicToRenderEvents.GAME_PAUSE]: Record<string, never>
  [LogicToRenderEvents.GAME_RESUME]: Record<string, never>
  [LogicToRenderEvents.ASSET_CHANGED]: unknown
  [LogicToRenderEvents.SYSTEM_MESSAGE]: { type?: string, message: string }
  [LogicToRenderEvents.SYSTEM_ERROR]: { message: string, error?: unknown }
}

export interface RenderToLogicEventPayloadMap {
  [RenderToLogicEvents.USER_CLICK]: UserClickPayload
  [RenderToLogicEvents.USER_KEY_PRESS]: { key: string, code?: string }
  [RenderToLogicEvents.USER_ADVANCE]: { source?: string }
  [RenderToLogicEvents.USER_CHOICE_SELECT]: UserChoiceSelectPayload
  [RenderToLogicEvents.FLOW_CONTROL_SET_MODE_REQUEST]: FlowControlSetModePayload
  [RenderToLogicEvents.FLOW_CONTROL_START_AUTO_REQUEST]: { source?: string }
  [RenderToLogicEvents.FLOW_CONTROL_STOP_AUTO_REQUEST]: { source?: string }
  [RenderToLogicEvents.FLOW_CONTROL_START_SKIP_REQUEST]: { source?: string }
  [RenderToLogicEvents.FLOW_CONTROL_STOP_SKIP_REQUEST]: { source?: string }
  [RenderToLogicEvents.FLOW_CONTROL_START_FAST_FORWARD_REQUEST]: { source?: string }
  [RenderToLogicEvents.FLOW_CONTROL_STOP_FAST_FORWARD_REQUEST]: { source?: string }
  [RenderToLogicEvents.GAME_SAVE_REQUEST]: { slotId?: string }
  [RenderToLogicEvents.GAME_LOAD_REQUEST]: { slotId?: string }
  [RenderToLogicEvents.UI_REQUEST_OPEN]: { elementId: string, config?: Record<string, unknown> }
  [RenderToLogicEvents.UI_REQUEST_CLOSE]: { elementId: string }
  [RenderToLogicEvents.UI_REQUEST_UPDATE]: { elementId: string, config: Record<string, unknown> }
  [RenderToLogicEvents.WINDOW_FOCUS]: Record<string, never>
  [RenderToLogicEvents.WINDOW_BLUR]: Record<string, never>
  [RenderToLogicEvents.ASSET_LOADED]: AssetLoadedPayload
  [RenderToLogicEvents.ASSET_ERROR]: AssetErrorPayload
  [RenderToLogicEvents.RENDER_READY]: RendererLifecyclePayload
  [RenderToLogicEvents.RENDER_DESTROYED]: RendererLifecyclePayload
  [RenderToLogicEvents.SCENE_READY]: RendererLifecyclePayload & { sceneId?: string }
}

export interface RendererPluginContext {
  getPipeline: () => Pipeline
  getViewState: () => Readonly<QuaViewProjection>
  refresh: () => void
  addDisposer: (disposer: () => void) => void
  emitRenderToLogic: <T extends RenderToLogicEvents>(
    type: T,
    payload: RenderToLogicEventPayloadMap[T],
  ) => Promise<void>
  onLogicToRender: <T extends LogicToRenderEvents>(
    type: T,
    handler: (payload: LogicToRenderEventPayloadMap[T], context: PipelineContext<LogicToRenderEventPayloadMap[T]>) => void | Promise<void>,
  ) => () => void
  onRenderToLogic: <T extends RenderToLogicEvents>(
    type: T,
    handler: (payload: RenderToLogicEventPayloadMap[T], context: PipelineContext<RenderToLogicEventPayloadMap[T]>) => void | Promise<void>,
  ) => () => void
}

export interface RendererPlugin {
  readonly name: string
  setup: (context: RendererPluginContext) => void | Promise<void>
  destroy?: () => void | Promise<void>
}

export class RendererPluginHost {
  private readonly plugins: RendererPlugin[]
  private readonly disposers: Array<() => void> = []
  private initialized = false

  constructor(plugins: readonly RendererPlugin[] = []) {
    this.plugins = [...plugins]
  }

  async init(context: Omit<RendererPluginContext, 'addDisposer'>): Promise<void> {
    if (this.initialized)
      return

    const pluginContext: RendererPluginContext = {
      ...context,
      addDisposer: disposer => this.disposers.push(disposer),
    }

    for (const plugin of this.plugins) {
      await plugin.setup(pluginContext)
    }

    this.initialized = true
  }

  async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }

    await Promise.all(this.plugins.map(plugin => plugin.destroy?.()))
    this.initialized = false
  }
}

export type LogicToRenderPayload<T extends LogicToRenderEvents> = LogicToRenderEventPayloadMap[T]
export type RenderToLogicPayload<T extends RenderToLogicEvents> = RenderToLogicEventPayloadMap[T]

export function emitLogicToRender<T extends LogicToRenderEvents>(
  pipeline: Pipeline,
  type: T,
  payload: LogicToRenderEventPayloadMap[T],
): Promise<void> {
  return pipeline.emit(type, payload)
}

export function onLogicToRender<T extends LogicToRenderEvents>(
  pipeline: Pipeline,
  type: T,
  handler: (payload: LogicToRenderEventPayloadMap[T], context: PipelineContext<LogicToRenderEventPayloadMap[T]>) => void | Promise<void>,
): () => void {
  const listener: EventListener<LogicToRenderEventPayloadMap[T]> = async (context) => {
    await handler(context.event.payload, context)
  }
  pipeline.on(type, listener)
  return () => pipeline.off(type, listener)
}

export function emitRenderToLogic<T extends RenderToLogicEvents>(
  pipeline: Pipeline,
  type: T,
  payload: RenderToLogicEventPayloadMap[T],
): Promise<void> {
  return pipeline.emit(type, payload)
}

export function onRenderToLogic<T extends RenderToLogicEvents>(
  pipeline: Pipeline,
  type: T,
  handler: (payload: RenderToLogicEventPayloadMap[T], context: PipelineContext<RenderToLogicEventPayloadMap[T]>) => void | Promise<void>,
): () => void {
  const listener: EventListener<RenderToLogicEventPayloadMap[T]> = async (context) => {
    await handler(context.event.payload, context)
  }
  pipeline.on(type, listener)
  return () => pipeline.off(type, listener)
}

export function waitForPipelineEvent<
  T extends LogicToRenderEvents | RenderToLogicEvents,
>(
  pipeline: Pipeline,
  type: T,
  matcher?: (payload: EventPayload<T>) => boolean,
  options: { timeout?: number, signal?: AbortSignalLike } = {},
): Promise<EventPayload<T>> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timeout: unknown
    const timers = getTimers()
    let abort: () => void
    let listener: EventListener<EventPayload<T>>

    const cleanup = () => {
      pipeline.off(type, listener as EventListener)
      if (timeout)
        timers.clearTimeout(timeout)
      options.signal?.removeEventListener?.('abort', abort)
    }

    const finish = (fn: () => void) => {
      if (settled)
        return
      settled = true
      cleanup()
      fn()
    }

    abort = () => finish(() => reject(new Error(`Waiting for ${type} was cancelled`)))
    listener = (context) => {
      const payload = context.event.payload
      if (!matcher || matcher(payload)) {
        finish(() => resolve(payload))
      }
    }

    pipeline.on(type, listener)
    options.signal?.addEventListener?.('abort', abort)

    if (options.timeout !== undefined) {
      timeout = timers.setTimeout(() => {
        finish(() => reject(new Error(`Timed out waiting for pipeline event: ${type}`)))
      }, options.timeout)
    }
  })
}

export type EventPayload<T extends LogicToRenderEvents | RenderToLogicEvents>
  = T extends LogicToRenderEvents
    ? LogicToRenderEventPayloadMap[T]
    : T extends RenderToLogicEvents
      ? RenderToLogicEventPayloadMap[T]
      : never

export interface AbortSignalLike {
  aborted?: boolean
  addEventListener?: (type: 'abort', listener: () => void) => void
  removeEventListener?: (type: 'abort', listener: () => void) => void
}

function getTimers(): {
  setTimeout: (handler: () => void, timeout?: number) => unknown
  clearTimeout: (id: unknown) => void
} {
  const runtime = globalThis as unknown as {
    setTimeout?: (handler: () => void, timeout?: number) => unknown
    clearTimeout?: (id: unknown) => void
  }
  return {
    setTimeout: runtime.setTimeout || (() => undefined),
    clearTimeout: runtime.clearTimeout || (() => {}),
  }
}

function getViewLayoutPreset(preset: ViewLayoutPreset): ViewLayoutProjection {
  return preset === 'portrait' ? QUA_PORTRAIT_LAYOUT : QUA_LANDSCAPE_LAYOUT
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback
}

function nonNegativeNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0 ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeFlowControlPolicy(
  policy: FlowControlPolicy | undefined,
  base: ResolvedFlowControlPolicy,
): ResolvedFlowControlPolicy {
  return {
    skippable: policy?.skippable ?? base.skippable,
    fastForwardable: policy?.fastForwardable ?? base.fastForwardable,
    autoAdvanceable: policy?.autoAdvanceable ?? base.autoAdvanceable,
    tags: policy?.tags ? [...policy.tags] : base.tags ? [...base.tags] : undefined,
    metadata: policy?.metadata ? { ...policy.metadata } : base.metadata ? { ...base.metadata } : undefined,
  }
}

function createFlowControlControls(policy: ResolvedFlowControlPolicy): FlowControlControlsProjection {
  return {
    canSkip: policy.skippable,
    canFastForward: policy.fastForwardable,
    canAutoAdvance: policy.autoAdvanceable,
  }
}
