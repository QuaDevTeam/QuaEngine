import type { ChoiceIntent, StoryPoint } from '@quajs/engine'

export const BACKLOG_PLUGIN_ID = 'backlog' as const

export const BacklogRenderToLogicEvents = {
  OPEN_REQUEST: 'backlog/open_request',
  CLOSE_REQUEST: 'backlog/close_request',
  JUMP_REQUEST: 'backlog/jump_request',
  REPLAY_VOICE_REQUEST: 'backlog/replay_voice_request',
} as const

export type BacklogEntryKind = 'dialogue' | 'choice'
export type BacklogRetentionScope = 'chapter' | 'route' | 'timeline' | 'global'

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
  requiredRuntimePackages?: readonly string[]
  entries: readonly BacklogEntry[]
  retention: {
    scope: BacklogRetentionScope
    maxEntries: number
  }
  defaultPolicy: Required<Pick<BacklogPolicy, 'include' | 'rewindable' | 'voiceReplay'>>
  pendingPolicy?: BacklogPolicy
}
