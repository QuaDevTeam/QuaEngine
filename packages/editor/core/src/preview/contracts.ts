import type { PreviewTarget } from '../contracts/project.js'
import type { PreviewDebugRequest, PreviewDebugSnapshot } from './debug.js'
import type { PreviewPerformanceReading } from './performance.js'
import type { PreviewStorageRequest, PreviewStorageResult } from './storage.js'

export const EDITOR_PREVIEW_PROTOCOL_VERSION = 2
export interface PreviewIdentity {
  sessionId: string
  buildRevision: string
  target: PreviewTarget
}
export interface PreviewState {
  nativeViewport?: { width: number, height: number }
  progress?: PreviewBuildProgress
  muted?: boolean
  phase: 'idle' | 'starting' | 'running' | 'stopping' | 'error'
  identity?: PreviewIdentity
  error?: string
  reloading?: boolean
  renderError?: string
  detached?: boolean
  message?: string
}
export interface PreviewBuildProgress {
  stage: 'build' | 'contracts' | 'scripts' | 'assets' | 'native' | 'connect'
  label: string
  detail?: string
}
export interface PreviewStart extends PreviewIdentity {
  progress?: (progress: PreviewBuildProgress) => void
  muted?: boolean
  projectRoot: string
  script: string
  signal: AbortSignal
  log: (message: string) => void
  failed: (error: Error) => void
  issue?: (message?: string) => void
  reloading?: boolean
}
export interface PreviewPointer {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved'
  /** Normalized coordinates within the native surface, excluding editor letterbox. */
  x: number
  y: number
  button: 'left' | 'right' | 'middle'
}
export type PreviewCommand = { action: 'status' | 'step' } | { action: 'seek', path: string, stepIndex: number } | { action: 'storage', request: PreviewStorageRequest }
  | { action: 'debug', request: PreviewDebugRequest }
  | { action: 'animation-scene' | 'animation-release' }
  | { action: 'animation-sample', sample: import('./animation.js').EditorAnimationSample }
export interface PreviewCommandResult {
  debug?: PreviewDebugSnapshot
  animationScene?: import('./animation.js').EditorAnimationSceneResult
  storage?: PreviewStorageResult
  message: string
  stepId?: string
  path?: string
  stepIndex?: number
}
export interface PreviewHandle {
  nativeViewport?: { width: number, height: number }
  storage?: (request: PreviewStorageRequest) => Promise<PreviewStorageResult>
  /** Read-only sampling lease; false releases all optional instrumentation. */
  performance?: (enabled: boolean) => Promise<PreviewPerformanceReading | undefined>
  /** Host output control only; never changes engine audio settings or playback. */
  setMuted?: (muted: boolean) => Promise<void>
  command?: (command: PreviewCommand) => Promise<PreviewCommandResult>
  stop: () => Promise<void>
  pointer?: (event: PreviewPointer) => Promise<void>
  cdp?: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>
  reload?: () => Promise<void>
}
export interface PreviewDriver {
  start: (request: PreviewStart) => Promise<PreviewHandle>
}
