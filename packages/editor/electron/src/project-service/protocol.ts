import type { EditorProjectChange, EditorProjectCheck } from '@quajs/editor-core'

export type ProjectRequestMethod = 'writingContext' | 'setPlugins' | 'open' | 'current' | 'refresh' | 'read' | 'save' | 'analyze' | 'complete' | 'hover' | 'signature' | 'define' | 'format' | 'thumbnail' | 'imageMetadata' | 'importAssets' | 'check' | 'fileOperation' | 'mutationPath' | 'syncDocuments' | 'configure'
export interface ProjectReply {
  id?: number
  result?: unknown
  error?: string
  change?: EditorProjectChange
  check?: EditorProjectCheck
}
