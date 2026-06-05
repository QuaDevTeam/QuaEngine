import type { ViewDialogueProjection } from '@quajs/render-core'

export type DialoguePresencePhase = 'enter' | 'exit'

export interface DialoguePresenceProjectResult {
  dialogue?: Readonly<ViewDialogueProjection>
  phase: DialoguePresencePhase
}

export interface DialoguePresenceRuntimeOptions {
  exitDurationMs?: number
  refresh?: () => void
}

export const DEFAULT_DIALOGUE_PRESENCE_EXIT_MS = 170

export class DialoguePresenceRuntime {
  private renderedDialogue?: Readonly<ViewDialogueProjection>
  private phase: DialoguePresencePhase = 'enter'
  private exitTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly options: DialoguePresenceRuntimeOptions = {}) {}

  project(dialogue: Readonly<ViewDialogueProjection> | undefined, chromeAllowed = true): DialoguePresenceProjectResult {
    if (chromeAllowed && dialogue?.visible) {
      this.clearExitTimer()
      this.renderedDialogue = dialogue
      this.phase = 'enter'
      return {
        dialogue,
        phase: this.phase,
      }
    }

    if (!this.renderedDialogue) {
      return {
        phase: 'exit',
      }
    }

    if (this.phase !== 'exit') {
      this.phase = 'exit'
      this.scheduleExitClear()
    }

    return {
      dialogue: this.renderedDialogue,
      phase: this.phase,
    }
  }

  destroy(): void {
    this.clearExitTimer()
    this.renderedDialogue = undefined
    this.phase = 'enter'
  }

  private scheduleExitClear(): void {
    this.clearExitTimer()
    this.exitTimer = setTimeout(() => {
      this.exitTimer = undefined
      this.renderedDialogue = undefined
      this.phase = 'enter'
      this.options.refresh?.()
    }, this.options.exitDurationMs ?? DEFAULT_DIALOGUE_PRESENCE_EXIT_MS)
  }

  private clearExitTimer(): void {
    if (this.exitTimer) {
      clearTimeout(this.exitTimer)
      this.exitTimer = undefined
    }
  }
}
