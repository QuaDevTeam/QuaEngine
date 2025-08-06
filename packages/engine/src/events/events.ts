/**
 * Events for communication between logic layer and render layer
 */
export enum LogicToRenderEvents {
  // Scene Management
  SCENE_INIT = 'scene/init',
  SCENE_CHANGE = 'scene/change',
  SCENE_DESTROY = 'scene/destroy',

  // Background and UI
  BACKGROUND_SET = 'background/set',
  BACKGROUND_CLEAR = 'background/clear',
  UI_SHOW = 'ui/show',
  UI_HIDE = 'ui/hide',
  UI_UPDATE = 'ui/update',

  // Character System
  CHARACTER_SHOW = 'character/show',
  CHARACTER_HIDE = 'character/hide',
  CHARACTER_MOVE = 'character/move',
  CHARACTER_EXPRESSION = 'character/expression',

  // Dialogue System
  DIALOGUE_SHOW = 'dialogue/show',
  DIALOGUE_HIDE = 'dialogue/hide',
  DIALOGUE_UPDATE = 'dialogue/update',
  DIALOGUE_CHOICE = 'dialogue/choice',

  // Audio System
  SOUND_PLAY = 'sound/play',
  SOUND_STOP = 'sound/stop',
  SOUND_PAUSE = 'sound/pause',
  SOUND_RESUME = 'sound/resume',
  BGM_PLAY = 'bgm/play',
  BGM_STOP = 'bgm/stop',
  BGM_FADE = 'bgm/fade',
  DUB_PLAY = 'dub/play',
  DUB_STOP = 'dub/stop',

  // Visual Effects
  EFFECT_FADE_IN = 'effect/fade_in',
  EFFECT_FADE_OUT = 'effect/fade_out',
  EFFECT_SHAKE = 'effect/shake',
  EFFECT_FLASH = 'effect/flash',

  // Game State
  GAME_SAVE = 'game/save',
  GAME_LOAD = 'game/load',
  GAME_PAUSE = 'game/pause',
  GAME_RESUME = 'game/resume',

  // System
  SYSTEM_MESSAGE = 'system/message',
  SYSTEM_ERROR = 'system/error'
}

export enum RenderToLogicEvents {
  // User Interactions
  USER_CLICK = 'user/click',
  USER_KEY_PRESS = 'user/key_press',
  USER_CHOICE_SELECT = 'user/choice_select',

  // Game Controls
  GAME_SAVE_REQUEST = 'game/save_request',
  GAME_LOAD_REQUEST = 'game/load_request',
  GAME_SETTINGS_OPEN = 'game/settings_open',
  GAME_MENU_OPEN = 'game/menu_open',

  // Audio Controls
  VOLUME_CHANGE = 'volume/change',
  MUTE_TOGGLE = 'mute/toggle',

  // System Events
  WINDOW_FOCUS = 'window/focus',
  WINDOW_BLUR = 'window/blur',

  // Asset Events
  ASSET_LOADED = 'asset/loaded',
  ASSET_ERROR = 'asset/error',

  // Ready States
  RENDER_READY = 'render/ready',
  SCENE_READY = 'scene/ready'
}

// Combined event types for type safety
export type EngineEvents = LogicToRenderEvents | RenderToLogicEvents

// Event payload interfaces
export interface SceneInitPayload {
  sceneId: string
  config: Record<string, unknown>
}

export interface BackgroundSetPayload {
  assetName: string
  transition?: {
    type: 'fade' | 'slide' | 'instant'
    duration?: number
  }
}

export interface DialogueShowPayload {
  characterName?: string
  text: string
  choices?: Array<{
    id: string
    text: string
    enabled: boolean
  }>
}

export interface AudioPlayPayload {
  assetName: string
  volume?: number
  loop?: boolean
  fadeIn?: number
}

export interface UserClickPayload {
  x: number
  y: number
  target?: string
}

export interface UserChoiceSelectPayload {
  choiceId: string
}

export interface VolumeChangePayload {
  type: 'master' | 'bgm' | 'sound' | 'voice'
  value: number
}