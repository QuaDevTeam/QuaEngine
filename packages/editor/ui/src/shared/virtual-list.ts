import { element, html } from '@quajs/editor-controls'
/** Fixed-height rows: DOM size stays proportional to the viewport, not the project. */
export class VirtualList<T> {
  private items: T[] = []
  private readonly layer = element(html`<div class="virtual-layer"></div>`)
  private readonly observer: ResizeObserver
  private readonly rendered = new Map<number, HTMLElement>()
  private start = -1
  private end = -1
  private pinned = -1
  constructor(readonly host: HTMLElement, private height: number, private readonly render: (item: T, index: number) => HTMLElement) {
    host.classList.add('virtual-list')
    this.layer.className = 'virtual-layer'
    host.append(this.layer)
    host.addEventListener('scroll', () => this.paint())
    this.observer = new ResizeObserver(() => this.paint(true))
    this.observer.observe(host)
  }

  setHeight(height: number): void {
    this.height = height
    this.layer.style.height = `${this.items.length * height}px`
    for (const element of this.rendered.values())
      element.style.height = `${height}px`
    this.paint(true)
  }

  pin(index: number): void {
    this.pinned = index
  }

  set(items: T[], reset = false, pinned = -1): void {
    this.items = items
    this.pinned = pinned
    this.rendered.clear()
    this.layer.replaceChildren()
    this.layer.style.height = `${items.length * this.height}px`
    if (reset)
      this.host.scrollTop = 0
    this.paint(true)
  }

  reveal(index: number): void {
    if (index < 0)
      return
    this.pinned = index
    const top = index * this.height
    if (top < this.host.scrollTop)
      this.host.scrollTop = top
    else if (top + this.height > this.host.scrollTop + this.host.clientHeight)
      this.host.scrollTop = top + this.height - this.host.clientHeight
    this.paint(true)
  }

  private paint(force = false): void {
    const start = Math.max(0, Math.floor(this.host.scrollTop / this.height) - 4)
    const end = Math.min(this.items.length, Math.ceil((this.host.scrollTop + this.host.clientHeight) / this.height) + 4)
    if (!force && start === this.start && end === this.end)
      return
    this.start = start
    this.end = end
    const indices = Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index)
    if (this.pinned >= 0 && this.pinned < this.items.length && (this.pinned < start || this.pinned >= end))
      indices.push(this.pinned)
    const required = new Set(indices)
    for (const index of this.rendered.keys()) {
      if (!required.has(index)) {
        this.rendered.get(index)!.remove()
        this.rendered.delete(index)
      }
    }
    let next = this.layer.firstChild
    for (const index of indices) {
      const element = this.rendered.get(index) || this.render(this.items[index], index)
      this.rendered.set(index, element)
      element.style.position = 'absolute'
      element.style.top = `${index * this.height}px`
      element.style.height = `${this.height}px`
      element.style.width = '100%'
      // Keep overlapping rows attached: moving decoded images through a fragment
      // on every resize invalidates their presentation and can flash thumbnails.
      if (element !== next)
        this.layer.insertBefore(element, next)
      next = element.nextSibling
    }
  }
}
