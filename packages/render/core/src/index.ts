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
  SOUND_PLAY = 'sound/play',
  SOUND_STOP = 'sound/stop',
  SOUND_PAUSE = 'sound/pause',
  SOUND_RESUME = 'sound/resume',
  BGM_PLAY = 'bgm/play',
  BGM_STOP = 'bgm/stop',
  BGM_FADE = 'bgm/fade',
  DUB_PLAY = 'dub/play',
  DUB_STOP = 'dub/stop',
  AUDIO_INTENT = 'audio/intent',
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
  GAME_SAVE_REQUEST = 'game/save_request',
  GAME_LOAD_REQUEST = 'game/load_request',
  UI_REQUEST_OPEN = 'ui/request_open',
  UI_REQUEST_CLOSE = 'ui/request_close',
  UI_REQUEST_UPDATE = 'ui/request_update',
  VOLUME_CHANGE = 'volume/change',
  MUTE_TOGGLE = 'mute/toggle',
  WINDOW_FOCUS = 'window/focus',
  WINDOW_BLUR = 'window/blur',
  ASSET_LOADED = 'asset/loaded',
  ASSET_ERROR = 'asset/error',
  AUDIO_ENDED = 'audio/ended',
  RENDER_READY = 'render/ready',
  RENDER_DESTROYED = 'render/destroyed',
  SCENE_READY = 'scene/ready',
}

export type EngineEvents = LogicToRenderEvents | RenderToLogicEvents

export interface ViewBackgroundProjection {
  assetName?: string
  transition?: TransitionIntent
}

export interface ViewCharacterProjection {
  id: string
  name: string
  visible: boolean
  sprite?: string
  expression?: string
  position?: CharacterPosition
  layer?: number
  metadata?: Readonly<Record<string, unknown>>
}

export interface CharacterPosition {
  x?: number
  y?: number
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

export interface AudioChannelIntent {
  id: string
  assetName: string
  volume: number
  loop: boolean
  fadeIn?: number
  fadeOut?: number
  state: 'playing' | 'paused' | 'stopped' | 'fading'
}

export interface AudioIntentProjection {
  volumeSettings: VolumeSettings
  bgm?: AudioChannelIntent
  sounds: readonly AudioChannelIntent[]
  voices: readonly AudioChannelIntent[]
}

export interface QuaViewProjection {
  background?: Readonly<ViewBackgroundProjection>
  characters: readonly Readonly<ViewCharacterProjection>[]
  dialogue: Readonly<ViewDialogueProjection>
  choices: readonly Readonly<ViewChoiceProjection>[]
  ui: Readonly<ViewUiProjection>
  effects: readonly Readonly<ViewEffectProjection>[]
  audio: Readonly<AudioIntentProjection>
}

export interface TransitionIntent {
  type: 'fade' | 'slide' | 'instant' | string
  duration?: number
  easing?: string
}

export interface VolumeSettings {
  master: number
  bgm: number
  sound: number
  voice: number
}

export interface SceneInitPayload {
  sceneId: string
  config?: Record<string, unknown>
  stepId?: string
}

export interface SceneChangePayload {
  fromScene?: string
  toScene: string
  transition?: TransitionIntent
}

export interface BackgroundSetPayload {
  assetName: string
  transition?: TransitionIntent
}

export interface CharacterPayload {
  id: string
  name?: string
  sprite?: string
  expression?: string
  position?: CharacterPosition
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

export interface AudioPlayPayload {
  id?: string
  assetName: string
  volume?: number
  loop?: boolean
  fadeIn?: number
}

export interface AudioStopPayload {
  id?: string
  soundId?: string
  characterId?: string
}

export interface EffectPayload {
  id?: string
  type?: string
  target?: string
  duration?: number
  intensity?: number
}

export interface UserClickPayload {
  x?: number
  y?: number
  target?: string
}

export interface UserChoiceSelectPayload {
  choiceId: string
}

export interface VolumeChangePayload {
  type: keyof VolumeSettings
  value: number
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

export interface AudioEndedPayload {
  channel: 'bgm' | 'sound' | 'voice'
  id: string
  assetName?: string
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
  [LogicToRenderEvents.SOUND_PLAY]: AudioPlayPayload
  [LogicToRenderEvents.SOUND_STOP]: AudioStopPayload
  [LogicToRenderEvents.SOUND_PAUSE]: Record<string, never>
  [LogicToRenderEvents.SOUND_RESUME]: Record<string, never>
  [LogicToRenderEvents.BGM_PLAY]: AudioPlayPayload
  [LogicToRenderEvents.BGM_STOP]: Record<string, never>
  [LogicToRenderEvents.BGM_FADE]: { targetVolume: number, duration: number }
  [LogicToRenderEvents.DUB_PLAY]: AudioPlayPayload
  [LogicToRenderEvents.DUB_STOP]: AudioStopPayload
  [LogicToRenderEvents.AUDIO_INTENT]: { audio: AudioIntentProjection }
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
  [RenderToLogicEvents.GAME_SAVE_REQUEST]: { slotId?: string }
  [RenderToLogicEvents.GAME_LOAD_REQUEST]: { slotId?: string }
  [RenderToLogicEvents.UI_REQUEST_OPEN]: { elementId: string, config?: Record<string, unknown> }
  [RenderToLogicEvents.UI_REQUEST_CLOSE]: { elementId: string }
  [RenderToLogicEvents.UI_REQUEST_UPDATE]: { elementId: string, config: Record<string, unknown> }
  [RenderToLogicEvents.VOLUME_CHANGE]: VolumeChangePayload
  [RenderToLogicEvents.MUTE_TOGGLE]: { type: keyof VolumeSettings, muted: boolean }
  [RenderToLogicEvents.WINDOW_FOCUS]: Record<string, never>
  [RenderToLogicEvents.WINDOW_BLUR]: Record<string, never>
  [RenderToLogicEvents.ASSET_LOADED]: AssetLoadedPayload
  [RenderToLogicEvents.ASSET_ERROR]: AssetErrorPayload
  [RenderToLogicEvents.AUDIO_ENDED]: AudioEndedPayload
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
    payload: RenderToLogicEventPayloadMap[T]
  ) => Promise<void>
  onLogicToRender: <T extends LogicToRenderEvents>(
    type: T,
    handler: (payload: LogicToRenderEventPayloadMap[T], context: PipelineContext<LogicToRenderEventPayloadMap[T]>) => void | Promise<void>
  ) => () => void
  onRenderToLogic: <T extends RenderToLogicEvents>(
    type: T,
    handler: (payload: RenderToLogicEventPayloadMap[T], context: PipelineContext<RenderToLogicEventPayloadMap[T]>) => void | Promise<void>
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

    const abort = () => finish(() => reject(new Error(`Waiting for ${type} was cancelled`)))
    const listener: EventListener<EventPayload<T>> = (context) => {
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

export type EventPayload<T extends LogicToRenderEvents | RenderToLogicEvents> =
  T extends LogicToRenderEvents
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
