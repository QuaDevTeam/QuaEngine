import type { EditorSourceEdit } from '@quajs/editor-core'
import type { AnimationTimeline } from '@quajs/plugin-animation'

export const ANIMATION_EDITOR_ID = 'qua.animation'
export interface AnimationRecord {
  bindings?: AnimationSceneBinding[]
  path: string
  timeline: AnimationTimeline
  edit: Omit<EditorSourceEdit, 'newText'>
}
export interface AnimationCatalog {
  scenes?: AnimationSceneSource[]
  animations: AnimationRecord[]
  issues: string[]
}

export interface AnimationSceneBinding {
  path: string
  stepIndex: number
  sceneId?: string
  self?: string
}
export interface AnimationSceneSource {
  path: string
  steps: { index: number, line: number, label: string, sceneId?: string }[]
}
