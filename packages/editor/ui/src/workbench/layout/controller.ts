import type { DockEdge, DockNode, DockState } from './model'
import { button, element, html, render as renderView, select } from '@quajs/editor-controls'
import { preferences } from '../../features/settings/store'
import { workbenchEmpty } from '../../shared/empty-state'
import { iconButton } from '../../shared/icons'
import { DockGroupElement } from '../components/dock-group'
import { DockSplitterElement } from '../components/dock-splitter'
import { ViewPicker } from '../components/view-picker'
import { DockModel, readDockState } from './model'

export interface DockView {
  id: string
  title: string
  content: HTMLElement
  tab?: HTMLButtonElement
  actions?: HTMLElement
  home?: string
  available?: boolean
}
interface MountedView extends DockView { tab: HTMLButtonElement, label: HTMLElement }
interface GroupElements { root: HTMLElement, tabs: HTMLElement, actions: HTMLElement, body: HTMLElement }
const storageKey = 'qua.editor.dock-layout.v1'

/** Owns layout only. Moving a view reuses its actual DOM and its feature instance. */
export class DockWorkbench {
  readonly model: DockModel
  private readonly views = new Map<string, MountedView>()
  private readonly groups = new Map<string, GroupElements>()
  private readonly splits = new Map<string, HTMLElement>()
  private readonly parking = element<HTMLDivElement>(html`<div></div>`)
  private readonly surface = element<HTMLDivElement>(html`<div></div>`)
  private readonly indicator = element<HTMLDivElement>(html`<div></div>`)
  private readonly dialog = element<HTMLDialogElement>(html`<dialog></dialog>`)
  private readonly viewPicker = new ViewPicker()
  private readonly empty = workbenchEmpty('grid', '工作区已收起', '打开视图，或恢复默认布局。', [button('打开视图', () => this.showViews()), button('重置布局', () => this.reset())])
  private visible = new Set<string>()
  private dragging?: string
  private target?: { group: string, edge: DockEdge, before?: string }
  private resizing = false
  private started = false
  private changedQueued = false

  constructor(
    private readonly root: HTMLElement,
    private readonly defaults: () => DockState,
    private readonly changed: (visible: ReadonlySet<string>, active?: string) => void,
    private readonly layoutChanged: () => void,
  ) {
    let state: DockState | undefined
    try {
      state = preferences.value.restoreLayout ? readDockState(JSON.parse(localStorage.getItem(storageKey) ?? 'null')) : undefined
    }
    catch { /* Invalid/unavailable preferences use the default workspace. */ }
    this.model = new DockModel(state ?? defaults())
    this.surface.className = 'dock-surface'
    this.parking.hidden = true
    this.indicator.className = 'dock-drop-indicator'
    this.indicator.hidden = true
    this.dialog.className = 'dock-dialog editor-controls'
    this.dialog.setAttribute('aria-label', '工作区布局')
    this.viewPicker.close = () => this.dialog.close()
    this.viewPicker.openView = (id) => {
      this.dialog.close()
      this.open(id)
    }
    this.viewPicker.resetLayout = () => {
      this.dialog.close()
      this.reset()
    }
    this.empty.element.classList.add('dock-empty')
    renderView(html`${this.surface}${this.parking}${this.empty.element}${this.indicator}${this.dialog}`, root)
    root.addEventListener('dock-views', () => this.showViews())
    root.addEventListener('dock-resizing', (event) => {
      this.resizing = (event as CustomEvent<boolean>).detail
      this.notifyLayout()
    })
    root.addEventListener('dock-resize', (event) => {
      const { id, ratio } = (event as CustomEvent<{ id: string, ratio: number }>).detail
      const visit = (node: DockNode | null): void => {
        if (node?.kind !== 'split')
          return
        if (node.id === id) {
          node.ratio = ratio
        }
        else {
          visit(node.first)
          visit(node.second)
        }
      }
      visit(this.model.state.root)
      this.render()
    })
    this.dialog.addEventListener('close', () => this.notifyLayout())
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) {
        const rect = this.dialog.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
          this.dialog.close()
      }
    })
    document.addEventListener('dragstart', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-dock-view]')
      const id = target?.dataset.dockView
      if (!id || !this.views.has(id) || !event.dataTransfer)
        return
      this.dragging = id
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-qua-editor-view', id)
      this.notifyLayout()
    })
    root.addEventListener('dragover', event => this.dragOver(event))
    root.addEventListener('dragleave', (event) => {
      if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) {
        this.target = undefined
        this.indicator.hidden = true
      }
    })
    root.addEventListener('drop', (event) => {
      if (!this.dragging)
        return
      event.preventDefault()
      const id = this.dragging
      if (this.target)
        this.model.move(id, this.target.group, this.target.edge, this.target.before)
      else if (!this.model.state.root)
        this.model.open(id, this.views.get(id)?.home)
      this.endDrag()
      this.render(id)
    })
    document.addEventListener('dragend', () => this.endDrag())
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape')
        this.endDrag()
    })
    window.addEventListener('blur', () => this.endDrag())
    new ResizeObserver(() => this.notifyLayout()).observe(this.surface)
  }

  get interacting(): boolean {
    return Boolean(this.dragging) || this.resizing || this.dialog.open
  }

  isVisible(id: string): boolean {
    return this.visible.has(id)
  }

  has(id: string): boolean {
    return this.views.has(id)
  }

  register(definition: DockView): void {
    const previous = this.views.get(definition.id)
    if (previous?.content === definition.content)
      return
    previous?.label.remove()
    const tab = definition.tab ?? button(definition.title, () => {})
    tab.id ||= `tab-${definition.id}`
    tab.classList.add('dock-tab-button')
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', definition.content.id ||= `panel-${definition.id}`)
    tab.setAttribute('aria-label', definition.title)
    tab.onclick = () => this.open(definition.id)
    const label = element<HTMLDivElement>(html`<div></div>`)
    label.className = 'dock-tab'
    label.draggable = true
    label.dataset.dockView = definition.id
    const close = iconButton('close', `关闭${definition.title}`)
    close.classList.add('dock-tab-close')
    close.onclick = () => this.close(definition.id)
    renderView(html`${tab}${close}`, label)
    label.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.showViewMenu(definition.id)
    })
    label.addEventListener('keydown', (event) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault()
        this.showViewMenu(definition.id)
      }
    })
    definition.content.classList.add('dock-view')
    definition.content.setAttribute('role', 'tabpanel')
    definition.content.setAttribute('aria-labelledby', tab.id)
    this.views.set(definition.id, { ...definition, tab, label })
    if (!this.model.knows(definition.id)) {
      const group = this.model.groups().find(group => group.id === (definition.home ?? 'tools'))
      const active = group?.active
      this.model.open(definition.id, definition.home)
      if (group && active)
        group.active = active
    }
  }

  unregister(id: string): void {
    const view = this.views.get(id)
    if (!view)
      return
    view.label.remove()
    view.content.remove()
    view.actions?.remove()
    this.views.delete(id)
  }

  start(): void {
    this.started = true
    this.render()
  }

  refresh(): void {
    if (this.started)
      this.render()
  }

  open(id: string): void {
    const view = this.views.get(id)
    if (!view || view.available === false)
      return
    this.model.open(id, view.home)
    this.render(id)
  }

  close(id: string): void {
    this.model.close(id)
    this.render()
  }

  available(id: string, available: boolean): void {
    const view = this.views.get(id)
    if (view && view.available !== available) {
      view.available = available
      this.refresh()
    }
  }

  reset(): void {
    this.model.state = this.defaults()
    this.render()
  }

  toggleGroup(id: string): void {
    if (!this.isVisible(id)) {
      this.open(id)
      return
    }
    const views = [...this.model.groupFor(id)!.views]
    for (const view of views) this.model.close(view)
    this.render()
  }

  showViews(): void {
    this.dialog.classList.add('dock-views-dialog')
    this.dialog.setAttribute('aria-label', '视图')
    this.updateViewPicker(true)
    renderView(html`${this.viewPicker}`, this.dialog)
    this.openDialog()
    void this.viewPicker.updateComplete.then(() => {
      if (this.dialog.open && this.viewPicker.isConnected)
        this.viewPicker.focusSearch()
    })
  }

  private updateViewPicker(resetSearch = false): void {
    this.viewPicker.setEntries([...this.views.values()].map(view => ({
      id: view.id,
      title: view.title,
      state: view.available === false ? 'unavailable' : this.isVisible(view.id) ? 'visible' : this.model.groupFor(view.id) ? 'open' : 'closed',
    })), resetSearch)
  }

  private showViewMenu(id: string): void {
    const view = this.views.get(id)!
    this.dialog.classList.remove('dock-views-dialog')
    this.dialog.setAttribute('aria-label', `${view.title}布局`)
    const group = this.model.groupFor(id)
    const actions = html`<div class="dock-view-list">${([['left', '向左拆分'], ['right', '向右拆分'], ['top', '向上拆分'], ['bottom', '向下拆分']] as const).map(([edge, title]) => html`
      <button type="button" class="editor-button" ?disabled=${!group || group.views.filter(view => this.views.get(view)?.available !== false).length < 2}
        @click=${() => {
          this.dialog.close()
          this.model.move(id, group!.id, edge)
          this.render(id)
        }}>${title}</button>`)}
    </div>`
    const destination = select(this.model.groups().filter(candidate => candidate.id !== group?.id).map((candidate, index) => ({ value: candidate.id, title: `分组 ${index + 1}：${candidate.views.map(id => this.views.get(id)?.title).filter(Boolean).join(' / ')}` })))
    destination.setAttribute('aria-label', '目标分组')
    const move = button('合并到分组', () => {
      this.dialog.close()
      this.model.move(id, destination.value, 'center')
      this.render(id)
    })
    move.disabled = !destination.options.length
    renderView(html`${this.dialogHeader(`${view.title}布局`)}${actions}${destination}${move}${button('关闭视图', () => {
      this.dialog.close()
      this.close(id)
    })}`, this.dialog)
    this.openDialog()
  }

  private dialogHeader(title: string) {
    const close = iconButton('close', '关闭布局菜单')
    close.onclick = () => this.dialog.close()
    return html`<header><h2>${title}</h2>${close}</header>`
  }

  private openDialog(): void {
    if (!this.dialog.open)
      this.dialog.showModal()
    this.notifyLayout()
  }

  private render(active?: string): void {
    if (!this.started)
      return
    const focused = document.activeElement as HTMLElement | null
    const previous = this.visible
    this.visible = new Set()
    const usedGroups = new Set<string>()
    const usedSplits = new Set<string>()
    const render = (node: DockNode): HTMLElement | undefined => {
      if (node.kind === 'split') {
        const first = render(node.first)
        const second = render(node.second)
        if (!first || !second)
          return first ?? second
        usedSplits.add(node.id)
        let split = this.splits.get(node.id)
        if (!split) {
          split = element<HTMLDivElement>(html`<div></div>`)
          split.className = 'dock-split'
          split.dataset.splitId = node.id
          this.splits.set(node.id, split)
          const separator = new DockSplitterElement()
          separator.configure(node.id, node.axis, node.ratio)
          split.append(separator)
        }
        split.dataset.axis = node.axis
        split.style.setProperty('--dock-ratio', `${node.ratio}fr`)
        split.style.setProperty('--dock-rest', `${1 - node.ratio}fr`)
        const separator = split.querySelector<DockSplitterElement>(':scope > .dock-separator')!
        separator.configure(node.id, node.axis, node.ratio)
        this.place(split, first, 0)
        this.place(split, separator, 1)
        this.place(split, second, 2)
        return split
      }
      const views = node.views.map(id => this.views.get(id)).filter((view): view is MountedView => Boolean(view && view.available !== false))
      if (!views.length)
        return
      usedGroups.add(node.id)
      let elements = this.groups.get(node.id)
      if (!elements) {
        const root = new DockGroupElement()
        root.initialize(node.id)
        elements = { root, tabs: root.tabs, actions: root.actions, body: root.body }
        this.groups.set(node.id, elements)
      }
      const selected = views.find(view => view.id === node.active) ?? views[0]
      this.visible.add(selected.id)
      elements.root.dataset.activeView = selected.id
      views.forEach((view, index) => {
        const active = selected === view
        this.place(elements!.tabs, view.label, index)
        if (view.content.parentElement !== elements!.body)
          elements!.body.append(view.content)
        view.content.hidden = !active
        view.tab.hidden = false
        view.tab.setAttribute('aria-selected', String(active))
        view.tab.tabIndex = active ? 0 : -1
        view.label.querySelector<HTMLButtonElement>('.dock-tab-close')!.tabIndex = active ? 0 : -1
        view.label.classList.toggle('active', active)
        if (view.actions) {
          const owner = active ? elements!.actions : this.parking
          if (view.actions.parentElement !== owner)
            owner.prepend(view.actions)
          view.actions.hidden = !active
        }
      })
      return elements.root
    }
    const content = this.model.state.root && render(this.model.state.root)
    if (content && content.parentElement !== this.surface)
      this.surface.append(content)
    for (const [id, group] of this.groups) {
      if (!usedGroups.has(id)) {
        group.root.remove()
        this.groups.delete(id)
      }
    }
    for (const [id, split] of this.splits) {
      if (!usedSplits.has(id)) {
        split.remove()
        this.splits.delete(id)
      }
    }
    for (const view of this.views.values()) {
      if (!this.model.groupFor(view.id) || view.available === false) {
        this.parking.append(view.label, view.content)
        if (view.actions)
          this.parking.append(view.actions)
        view.content.hidden = true
        view.tab.setAttribute('aria-selected', 'false')
      }
    }
    this.empty.element.hidden = Boolean(content)
    if (this.dialog.open && this.viewPicker.isConnected)
      this.updateViewPicker()
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.model.state))
    }
    catch { /* Layout remains usable without storage. */ }
    this.changed(this.visible, active)
    if (focused?.isConnected && focused.closest('.dock-view:not([hidden])') && document.activeElement === document.body)
      focused.focus({ preventScroll: true })
    else if (focused && document.activeElement === document.body && [...previous].some(id => !this.visible.has(id)))
      this.views.get([...this.visible][0])?.tab.focus({ preventScroll: true })
    this.notifyLayout()
  }

  private place(parent: HTMLElement, child: HTMLElement, index: number): void {
    if (parent.children[index] !== child)
      parent.insertBefore(child, parent.children[index] ?? null)
  }

  private dragOver(event: DragEvent): void {
    if (!this.dragging)
      return
    event.preventDefault()
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = 'move'
    const group = (event.target as HTMLElement).closest<HTMLElement>('.dock-group')
    if (!group) {
      this.target = undefined
      this.indicator.hidden = true
      return
    }
    const box = group.getBoundingClientRect()
    const header = (event.target as HTMLElement).closest('.dock-header')
    const x = (event.clientX - box.x) / box.width
    const y = (event.clientY - box.y) / box.height
    const edge: DockEdge = header ? 'center' : x < 0.23 ? 'left' : x > 0.77 ? 'right' : y < 0.28 ? 'top' : y > 0.72 ? 'bottom' : 'center'
    const before = header ? (event.target as HTMLElement).closest<HTMLElement>('.dock-tab')?.dataset.dockView : undefined
    this.target = { group: group.dataset.dockGroup!, edge, before }
    const origin = this.root.getBoundingClientRect()
    this.indicator.hidden = false
    this.indicator.dataset.edge = edge
    Object.assign(this.indicator.style, { left: `${box.x - origin.x + (edge === 'right' ? box.width / 2 : 0)}px`, top: `${box.y - origin.y + (edge === 'bottom' ? box.height / 2 : 0)}px`, width: `${box.width / (edge === 'left' || edge === 'right' ? 2 : 1)}px`, height: `${box.height / (edge === 'top' || edge === 'bottom' ? 2 : 1)}px` })
  }

  private endDrag(): void {
    if (!this.dragging)
      return
    this.dragging = undefined
    this.target = undefined
    this.indicator.hidden = true
    this.notifyLayout()
  }

  private notifyLayout(): void {
    if (this.changedQueued)
      return
    this.changedQueued = true
    queueMicrotask(() => {
      this.changedQueued = false
      this.layoutChanged()
    })
  }
}
