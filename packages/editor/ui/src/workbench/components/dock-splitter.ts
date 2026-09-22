import { defineElement } from '../../shared/components/element'

export class DockSplitterElement extends HTMLElement {
  private axis = 'horizontal'
  private ratio = 0.5
  private initialized = false
  configure(id: string, axis: string, ratio: number): void {
    this.dataset.splitId = id
    this.axis = axis
    this.ratio = ratio
    this.setAttribute('aria-valuenow', String(Math.round(ratio * 100)))
    this.setAttribute('aria-orientation', axis === 'horizontal' ? 'vertical' : 'horizontal')
    if (this.initialized)
      return
    this.initialized = true
    this.className = 'dock-separator'
    this.tabIndex = 0
    this.setAttribute('role', 'separator')
    this.setAttribute('aria-label', '调整分组大小')
    this.setAttribute('aria-valuemin', '5')
    this.setAttribute('aria-valuemax', '95')
    this.onpointerdown = (event) => {
      if (event.button !== 0)
        return
      event.preventDefault()
      this.setPointerCapture(event.pointerId)
      this.interaction(true)
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId)
          return
        const box = this.parentElement!.getBoundingClientRect()
        this.resize(this.axis === 'horizontal' ? (next.clientX - box.x) / box.width : (next.clientY - box.y) / box.height)
      }
      const stop = () => {
        document.removeEventListener('pointermove', move, true)
        document.removeEventListener('pointerup', stop, true)
        document.removeEventListener('pointercancel', stop, true)
        window.removeEventListener('blur', stop)
        if (this.hasPointerCapture(event.pointerId))
          this.releasePointerCapture(event.pointerId)
        this.interaction(false)
      }
      document.addEventListener('pointermove', move, true)
      document.addEventListener('pointerup', stop, true)
      document.addEventListener('pointercancel', stop, true)
      window.addEventListener('blur', stop, { once: true })
    }
    this.ondblclick = () => this.resize(0.5)
    this.onkeydown = (event) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault()
        this.resize(this.ratio + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -0.03 : 0.03))
      }
    }
  }

  private interaction(active: boolean): void {
    this.dispatchEvent(new CustomEvent('dock-resizing', { bubbles: true, detail: active }))
  }

  private resize(ratio: number): void {
    this.dispatchEvent(new CustomEvent('dock-resize', { bubbles: true, detail: { id: this.dataset.splitId, ratio: Math.max(0.05, Math.min(0.95, ratio)) } }))
  }
}
defineElement('qua-dock-splitter', DockSplitterElement)
