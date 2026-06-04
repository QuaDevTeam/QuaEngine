import type { ChoiceIntent, StoryPoint } from '@quajs/engine'

export const BACKLOG_PLUGIN_ID = 'backlog' as const
export const BACKLOG_WEB_RENDERER_ENTRY = '@quajs/renderer-web/plugins/backlog' as const
export const BACKLOG_VUE_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/backlog' as const
export const BACKLOG_COCOS_RENDERER_ENTRY = '@quajs/renderer-cocos/plugins/backlog' as const

export const BacklogRenderToLogicEvents = {
  OPEN_REQUEST: 'backlog/open_request',
  CLOSE_REQUEST: 'backlog/close_request',
  JUMP_REQUEST: 'backlog/jump_request',
  REPLAY_VOICE_REQUEST: 'backlog/replay_voice_request',
} as const

export type BacklogEntryKind = 'dialogue' | 'choice'
export type BacklogRetentionScope = 'chapter' | 'route' | 'timeline' | 'global'

export type BacklogUiScenePresentation = 'overlay' | 'scene'

export interface BacklogUiSceneOverlayProjection extends Readonly<Record<string, unknown>> {
  variant?: string
  skinId?: string
  background?: Readonly<Record<string, unknown>>
  hideHud?: boolean
  hideDialogue?: boolean
}

export interface BacklogUiSceneProjection extends Readonly<Record<string, unknown>> {
  id: string
  presentation?: BacklogUiScenePresentation
  overlay?: Readonly<BacklogUiSceneOverlayProjection>
}

export interface BacklogUiProjection extends Readonly<Record<string, unknown>> {
  source?: string
  scene?: Readonly<BacklogUiSceneProjection>
}

export interface BacklogOpenRequestPayload extends BacklogUiProjection {}

export interface BacklogCloseRequestPayload extends Readonly<Record<string, unknown>> {
  source?: string
}

export interface BacklogEntry {
  id: string
  kind: BacklogEntryKind
  point?: StoryPoint
  checkpointId?: string
  speaker?: string
  text?: string
  choices?: readonly ChoiceIntent[]
  voice?: BacklogVoiceReference
  requiredRuntimePackages?: readonly string[]
  rewindable: boolean
  voiceReplay: boolean
  tags?: readonly string[]
  timestamp: number
}

export interface BacklogVoiceReference {
  assetKey: string
  chapterId?: string
  lineId?: string
  characterId?: string
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface BacklogPolicy {
  include?: boolean
  rewindable?: boolean
  voiceReplay?: boolean
  tags?: readonly string[]
}

export interface BacklogProjection {
  revision: number
  visible: boolean
  ui?: Readonly<BacklogUiProjection>
  requiredRuntimePackages?: readonly string[]
  entries: readonly BacklogEntry[]
  retention: {
    scope: BacklogRetentionScope
    maxEntries: number
  }
  defaultPolicy: Required<Pick<BacklogPolicy, 'include' | 'rewindable' | 'voiceReplay'>>
  pendingPolicy?: BacklogPolicy
}
