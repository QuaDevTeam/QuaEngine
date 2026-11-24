import { html, render } from 'lit'
import { defineElement, element } from '../../shared/components/element'
import { iconButton } from '../../shared/icons'

export class DockGroupElement extends HTMLElement {
  readonly tabs = element<HTMLDivElement>(html`<div></div>`)
  readonly actions = element<HTMLDivElement>(html`<div></div>`)
  readonly body = element<HTMLDivElement>(html`<div></div>`)
  private initialized = false

  private readonly resize = new ResizeObserver(() => this.revealSelected())

  connectedCallback(): void {
    this.resize.observe(this.tabs)
  }

  disconnectedCallback(): void {
    this.resize.disconnect()
  }

  revealSelected(): void {
    const options = { block: 'nearest', inline: 'nearest', container: 'nearest' } as const
    this.tabs.querySelector('.dock-tab.active')?.scrollIntoView(options)
  }

  initialize(id: string): void {
    this.dataset.dockGroup = id
    if (this.initialized)
      return
    this.initialized = true
    this.className = 'dock-group'
    this.tabs.className = 'dock-tabs'
    this.tabs.setAttribute('role', 'tablist')
    this.tabs.setAttribute('aria-label', '视图分组')
    this.tabs.onkeydown = (event) => {
      const buttons = [...this.tabs.querySelectorAll<HTMLButtonElement>('[role=tab]')]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length
      buttons[next].click()
      buttons[next].focus()
    }
    this.actions.className = 'dock-actions'
    const menu = iconButton('list', '打开视图')
    menu.onclick = () => this.dispatchEvent(new CustomEvent('dock-views', { bubbles: true }))
    render(menu, this.actions)
    this.body.className = 'dock-content'
    render(html`<div class="dock-header">${this.tabs}${this.actions}</div>${this.body}`, this)
  }
}
defineElement('qua-dock-group', DockGroupElement)
