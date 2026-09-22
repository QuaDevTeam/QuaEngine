import type { EditorBridge, PreviewState } from '@quajs/editor-core'

/** Input/accessibility placeholder only. Electron hosts the real native layer above it. */
export class NativeSurfacePreview {
  private sessionId?: string
  private generation = 0
  private pointerPending = false
  suspended = false
  private viewport = { width: 960, height: 540 }
  private readonly observer: ResizeObserver
  constructor(private readonly surface: HTMLElement, bridge: EditorBridge, error: (message: string) => void) {
    this.observer = new ResizeObserver(() => this.fit())
    this.observer.observe(surface.parentElement!)
    surface.addEventListener('contextmenu', event => event.preventDefault())
    for (const [eventName, type] of [['pointerdown', 'mousePressed'], ['pointerup', 'mouseReleased'], ['pointermove', 'mouseMoved']] as const) {
      surface.addEventListener(eventName, (event) => {
        if (!this.sessionId || this.suspended || (type === 'mouseMoved' && this.pointerPending))
          return
        const rect = surface.getBoundingClientRect()
        const x = (event.clientX - rect.left) / rect.width
        const y = (event.clientY - rect.top) / rect.height
        if (type === 'mousePressed')
          surface.setPointerCapture(event.pointerId)
        if (type === 'mouseReleased' && surface.hasPointerCapture(event.pointerId))
          surface.releasePointerCapture(event.pointerId)
        const generation = this.generation
        this.pointerPending = true
        void bridge.previewPointer(this.sessionId, { type, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left' })
          .catch((cause) => {
            if (generation === this.generation)
              error(String(cause))
          })
          .finally(() => {
            if (generation === this.generation)
              this.pointerPending = false
          })
      })
    }
  }

  setState(state: PreviewState): void {
    const sessionId = state.phase === 'running' && state.identity?.target === 'native' ? state.identity.sessionId : undefined
    this.viewport = state.nativeViewport ?? this.viewport
    if (sessionId !== this.sessionId) {
      this.sessionId = sessionId
      this.pointerPending = false
      ++this.generation
    }
    this.surface.hidden = !sessionId || Boolean(state.reloading || state.renderError)
    this.fit()
  }

  dispose(): void {
    ++this.generation
    this.sessionId = undefined
    this.observer.disconnect()
  }

  private fit(): void {
    const parent = this.surface.parentElement!
    const scale = Math.min(parent.clientWidth / this.viewport.width, parent.clientHeight / this.viewport.height)
    this.surface.style.width = `${this.viewport.width * scale}px`
    this.surface.style.height = `${this.viewport.height * scale}px`
  }
}
