import type { SidebarView } from './views'
import { render } from 'lit'
import { preferences } from '../../features/settings/store'
import { isSidebarView, sidebarViews } from './views'

const storageKey = 'qua.editor.sidebar.v1'
const defaultWidth = 270

/** Navigation stays in its own host; switching never reparents a feature. */
export class Sidebar {
  active: SidebarView = 'explorer'
  interacting = false
  private width = defaultWidth

  constructor(
    private readonly host: HTMLElement,
    private readonly splitter: HTMLElement,
    private readonly changed: () => void,
    private readonly layoutChanged: () => void,
  ) {
    try {
      const saved = preferences.value.restoreLayout && JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (saved && isSidebarView(saved.active))
        this.active = saved.active
      if (saved && typeof saved.width === 'number' && Number.isFinite(saved.width))
        this.width = Math.max(220, Math.min(520, saved.width))
    }
    catch { /* Invalid or unavailable profile data uses the default sidebar. */ }
    this.render()
    this.resize(this.width, false)
    new ResizeObserver(() => this.resize(this.width, false)).observe(host.parentElement!)
    splitter.onkeydown = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
        return
      event.preventDefault()
      this.resize(host.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? -10 : 10))
    }
    splitter.ondblclick = () => this.resize(defaultWidth)
    splitter.onpointerdown = (event) => {
      if (event.button !== 0)
        return
      event.preventDefault()
      const origin = event.clientX
      const width = host.getBoundingClientRect().width
      splitter.setPointerCapture(event.pointerId)
      this.interacting = true
      this.layoutChanged()
      const move = (next: PointerEvent) => {
        if (next.pointerId === event.pointerId)
          this.resize(width + next.clientX - origin)
      }
      const stop = () => {
        splitter.removeEventListener('pointermove', move)
        splitter.removeEventListener('pointerup', stop)
        splitter.removeEventListener('pointercancel', stop)
        splitter.removeEventListener('lostpointercapture', stop)
        window.removeEventListener('blur', stop)
        if (splitter.hasPointerCapture(event.pointerId))
          splitter.releasePointerCapture(event.pointerId)
        this.interacting = false
        this.layoutChanged()
      }
      splitter.addEventListener('pointermove', move)
      splitter.addEventListener('pointerup', stop)
      splitter.addEventListener('pointercancel', stop)
      splitter.addEventListener('lostpointercapture', stop)
      window.addEventListener('blur', stop, { once: true })
    }
  }

  show(view: SidebarView): void {
    this.active = view
    this.render()
    this.persist()
    this.changed()
  }

  private render(): void {
    for (const view of sidebarViews) {
      const active = view.id === this.active
      this.host.querySelector<HTMLElement>(`#view-${view.id}`)!.hidden = !active
      if ('actions' in view)
        this.host.querySelector<HTMLElement>(`#${view.actions}`)!.hidden = !active
      const button = document.getElementById(`activity-${view.id}`)!
      button.setAttribute('aria-selected', String(active))
      button.tabIndex = active ? 0 : -1
      if (active)
        render(view.title, this.host.querySelector('#sidebar-title')!)
    }
  }

  private resize(width: number, persist = true): void {
    const max = Math.max(220, Math.min(520, this.host.parentElement!.clientWidth - 480))
    const actual = Math.max(220, Math.min(max, width))
    this.host.parentElement!.style.setProperty('--sidebar-width', `${actual}px`)
    this.splitter.setAttribute('aria-valuemin', '220')
    this.splitter.setAttribute('aria-valuemax', String(max))
    this.splitter.setAttribute('aria-valuenow', String(Math.round(actual)))
    this.splitter.setAttribute('aria-valuetext', `${Math.round(actual)} 像素`)
    if (persist) {
      this.width = actual
      this.persist()
    }
    this.layoutChanged()
  }

  private persist(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ active: this.active, width: this.width }))
    }
    catch { /* The sidebar remains usable without profile storage. */ }
  }
}
