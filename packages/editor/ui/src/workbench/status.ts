import { element, html, render } from '@quajs/editor-controls'
/** Owns the placement and visibility of editor-only status elements. */
export class ContextStatus {
  private readonly entries = new Map<HTMLElement, string>()
  private active = new Set<string>()

  constructor(private readonly host: HTMLElement) {}

  mount(key: string, message: HTMLElement): () => void {
    const entry = element(html`<div>${message}</div>`)
    entry.className = 'context-status-entry'
    entry.dataset.context = key
    entry.hidden = !this.active.has(key)
    // Keep the original element/listeners, including recovery actions and live regions.
    entry.onpointerenter = () => entry.title = message.textContent ?? ''
    entry.addEventListener('focusin', () => entry.title = message.textContent ?? '')
    this.entries.set(entry, key)
    this.render()
    return () => {
      this.entries.delete(entry)
      this.render()
    }
  }

  private render(): void {
    render(html`${[...this.entries.keys()]}`, this.host)
  }

  show(keys: readonly string[]): void {
    this.active = new Set(keys)
    for (const [entry, key] of this.entries)
      entry.hidden = !this.active.has(key)
  }
}
