import type { EditorWritingBridge } from '@quajs/editor-core'

declare global {
  interface Window {
    quaNovelWriter?: EditorWritingBridge & {
      dirty: (dirty: boolean) => void
      onCommand: (listener: (command: string) => void) => () => void
    }
  }
  namespace App {
  }
}

export {}
