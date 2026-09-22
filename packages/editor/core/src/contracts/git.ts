export interface EditorGitChange {
  /** Paths relative to the opened project, not the enclosing repository. */
  path: string
  previousPath?: string
  index: string
  worktree: string
  conflict: boolean
  submodule: boolean
  outsideRename: boolean
}
export interface EditorGitState {
  root: string
  state: 'ready' | 'not-repository' | 'unavailable' | 'error'
  repositoryRoot?: string
  branch?: string
  oid?: string
  upstream?: string
  ahead: number
  behind: number
  changes: EditorGitChange[]
  message?: string
}
export interface EditorGitDiff {
  path: string
  staged: boolean
  before: string
  after: string
  binary: boolean
}

export type EditorGitSwitchResult
  = | { status: 'switched', state: EditorGitState }
    | { status: 'save-required' | 'cancelled' }
    | { status: 'blocked' | 'failed', message: string }
