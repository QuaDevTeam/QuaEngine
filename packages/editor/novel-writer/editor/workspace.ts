import type { EditorBounds, EditorBridge } from '@quajs/editor-core'

export class NovelWriterWorkspace {
  active = false
  private readonly host = document.getElementById('novel-writer')!
  private readonly button = document.getElementById('activity-writer')!

  constructor(private readonly bridge: EditorBridge, private readonly changed: (active: boolean) => void, writerIcon: string) {
    this.button.innerHTML = writerIcon
    this.button.onclick = () => this.show(true)
    document.getElementById('writer-retry')!.onclick = () => this.show(true)
    bridge.onNovelWriterState((state) => {
      document.getElementById('writer-message')!.textContent = state.error || (state.phase === 'ready' ? '' : '正在打开 Novel Writer…')
      document.getElementById('writer-retry')!.hidden = state.phase !== 'error'
    })
    new ResizeObserver(() => this.resize()).observe(this.host)
  }

  show(active: boolean): void {
    this.active = active
    document.getElementById('app')!.classList.toggle('writer-active', active)
    this.host.hidden = !active
    this.button.setAttribute('aria-selected', String(active))
    this.button.tabIndex = active ? 0 : -1
    this.changed(active)
    void this.bridge.presentNovelWriter(active, this.bounds()).catch((error) => {
      document.getElementById('writer-message')!.textContent = String(error)
      document.getElementById('writer-retry')!.hidden = false
    })
  }

  resize(): void {
    if (this.active)
      void this.bridge.resizeNovelWriter(this.bounds()).catch(() => {})
  }

  private bounds(): EditorBounds {
    const { x, y, width, height } = this.host.getBoundingClientRect()
    const visible = this.active && !document.querySelector('dialog[open]') && !document.body.classList.contains('dock-interacting')
    return { x, y, width: visible ? width : 0, height: visible ? height : 0 }
  }
}
