import type { createWorkspaceController } from './workspace-controller.svelte'

/** Optional desktop ergonomics. The same writing UI still runs in a normal browser. */
export function connectDesktop(workspace: ReturnType<typeof createWorkspaceController>): () => void {
  const bridge = window.quaNovelWriter
  const command = (action: string): void => {
    if (action === 'settings') {
      workspace.openConfigDialog()
    }
    else if ((action === 'save' || action === 'save-all') && workspace.selectedArtifact
      && workspace.artifactMarkdownEdit !== workspace.selectedArtifact.markdown) {
      void workspace.submitApproval('manual_edit')
    }
  }
  const dispose = bridge?.onCommand(command)
  const keyboard = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey)
      return
    if (event.key === 's' || event.key === ',') {
      event.preventDefault()
      command(event.key === ',' ? 'settings' : 'save')
    }
  }
  window.addEventListener('keydown', keyboard)
  return () => {
    dispose?.()
    window.removeEventListener('keydown', keyboard)
  }
}
