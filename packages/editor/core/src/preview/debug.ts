/** Development protocol. Source offsets address the exact compiled QS bytes. */
export interface PreviewSource {
  path: string
  stepIndex: number
  line: number
  start: number
  end: number
  expectedText: string
}
export type PreviewPickKind = 'dialogue' | 'character' | 'background' | 'audio'
export interface PreviewSourceRequest {
  id: number
  kind: PreviewPickKind
  source?: PreviewSource
  target?: string
  text?: string
  expectedText?: string
}
export interface PreviewAudioIntent {
  id: string
  kind: 'bgm' | 'voice' | 'sfx' | 'ambient'
  assetKey: string
  state: string
  loop?: boolean
  contentPackageId?: string
}
export interface PreviewAudioPlayback {
  id: string
  positionMs: number
  durationMs: number
  state: 'playing' | 'scheduled' | 'paused' | 'pending' | 'suspended' | 'stopped'
}
export interface PreviewDebugClip {
  id: number
  kind: 'dialogue' | 'bgm' | 'voice' | 'sfx' | 'ambient'
  lane: string
  label: string
  startMs: number
  endMs?: number
  source?: PreviewSource
  track?: PreviewAudioIntent
  playback?: PreviewAudioPlayback
}
export interface PreviewDebugSnapshot {
  picking: boolean
  timeMs: number
  clips: PreviewDebugClip[]
  requests: PreviewSourceRequest[]
  current?: PreviewSource
  flow: string
  audioControl: boolean
  renderer: boolean
  truncated: boolean
}
export type PreviewDebugRequest
  = | { kind: 'read', after: number }
    | { kind: 'pick', enabled: boolean }
    | { kind: 'clear' }
    | { kind: 'flow', mode: 'auto' | 'manual' }
    | { kind: 'audio', action: 'pause' | 'resume' | 'stop' | 'seek', target: string, positionMs?: number }
    | { kind: 'reply', id: number, message: string, error: boolean }

export function validateDebugRequest(value: unknown): PreviewDebugRequest {
  if (!value || typeof value !== 'object')
    throw new Error('无效的场景调试命令。')
  const input = value as Record<string, unknown>
  const safeNumber = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  if (input.kind === 'read' && safeNumber(input.after))
    return { kind: 'read', after: input.after as number }
  if (input.kind === 'pick' && typeof input.enabled === 'boolean')
    return { kind: 'pick', enabled: input.enabled }
  if (input.kind === 'clear')
    return { kind: 'clear' }
  if (input.kind === 'flow' && (input.mode === 'auto' || input.mode === 'manual'))
    return { kind: 'flow', mode: input.mode }
  if (input.kind === 'audio' && ['pause', 'resume', 'stop', 'seek'].includes(String(input.action)) && typeof input.target === 'string' && input.target.length > 0 && input.target.length <= 512 && (input.action !== 'seek' || (safeNumber(input.positionMs) && (input.positionMs as number) <= 86400000)))
    return { kind: 'audio', action: input.action as 'pause', target: input.target, positionMs: input.positionMs as number | undefined }
  if (input.kind === 'reply' && safeNumber(input.id) && typeof input.message === 'string' && input.message.length <= 1000 && typeof input.error === 'boolean')
    return { kind: 'reply', id: input.id as number, message: input.message, error: input.error }
  throw new Error('无效的场景调试命令。')
}
