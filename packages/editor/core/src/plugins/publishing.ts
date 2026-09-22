import type { QuaPluginMetadata } from './marketplace.js'

export interface EditorPluginProject {
  name: string
  version: string
  metadata?: QuaPluginMetadata
  error?: string
}
export interface EditorPublication {
  root: string
  name: string
  version: string
  metadata: QuaPluginMetadata
  artifact: string
  integrity: string
  bytes: number
  files: string[]
  fileCount: number
  registry: string
}
export interface EditorRegistryAccount {
  id: string
  login: string
}
export interface EditorPluginSubmission {
  name: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  version: string
  reason?: string
  official?: boolean
}
export interface EditorPublishingState {
  registryUrl: string
  account?: EditorRegistryAccount
  project?: EditorPluginProject
  submissions: EditorPluginSubmission[]
  error?: string
}
