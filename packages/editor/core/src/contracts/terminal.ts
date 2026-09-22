/** Editor-local shell sessions; never game/runtime state. */
export interface EditorTerminalSession {
  id: string
  root: string
  shell: string
  pid: number
}
export type EditorTerminalEvent
  = | { type: 'data', id: string, sequence: number, data: string }
    | { type: 'exit', id: string, code: number }
    | { type: 'closed', id: string }
    | { type: 'error', message: string }
