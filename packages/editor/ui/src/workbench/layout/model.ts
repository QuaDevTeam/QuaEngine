import { isSidebarView } from '../sidebar/views'

export type DockEdge = 'center' | 'left' | 'right' | 'top' | 'bottom'
export interface DockGroup { kind: 'group', id: string, views: string[], active: string }
export interface DockSplit { kind: 'split', id: string, axis: 'horizontal' | 'vertical', ratio: number, first: DockNode, second: DockNode }
export type DockNode = DockGroup | DockSplit
export interface DockState { version: 1, root: DockNode | null, closed: string[], homes: Record<string, string> }

export function dockGroups(node: DockNode | null): DockGroup[] {
  return !node ? [] : node.kind === 'group' ? [node] : [...dockGroups(node.first), ...dockGroups(node.second)]
}
export function defaultDockState(panels: string[]): DockState {
  return {
    version: 1,
    closed: ['writer', 'extensions'],
    homes: {},
    root: {
      kind: 'split',
      id: 'main',
      axis: 'vertical',
      ratio: 0.7,
      first: {
        kind: 'split',
        id: 'editors',
        axis: 'horizontal',
        ratio: 0.5,
        first: { kind: 'group', id: 'source', views: ['source'], active: 'source' },
        second: { kind: 'group', id: 'preview', views: ['preview'], active: 'preview' },
      },
      second: { kind: 'group', id: 'tools', views: panels, active: 'console' },
    },
  }
}

/** Profile data is untrusted. Bound nesting, cardinality and ratios; reject duplicates. */
export function readDockState(value: unknown): DockState | undefined {
  if (!value || typeof value !== 'object')
    return
  const state = value as DockState
  if (state.version !== 1 || !Array.isArray(state.closed) || state.closed.length > 100 || !state.homes || typeof state.homes !== 'object' || Array.isArray(state.homes))
    return
  const names = new Set<string>()
  const nodes = new Set<string>()
  const valid = (value: unknown): value is string => typeof value === 'string' && /^[\w.-]{1,180}$/u.test(value)
  const visit = (node: DockNode, depth: number): boolean => {
    if (!node || depth > 16 || nodes.size >= 100 || !valid(node.id) || nodes.has(node.id))
      return false
    nodes.add(node.id)
    if (node.kind === 'group') {
      if (!Array.isArray(node.views) || !node.views.length || node.views.length > 100 || !node.views.includes(node.active))
        return false
      for (const id of node.views) {
        if (!valid(id) || names.has(id) || names.size >= 100)
          return false
        names.add(id)
      }
      return true
    }
    return node.kind === 'split' && ['horizontal', 'vertical'].includes(node.axis) && Number.isFinite(node.ratio) && node.ratio >= 0.05 && node.ratio <= 0.95 && visit(node.first, depth + 1) && visit(node.second, depth + 1)
  }
  if (state.root !== null && !visit(state.root, 0))
    return
  for (const id of state.closed) {
    if (!valid(id) || names.has(id) || names.size >= 100)
      return
    names.add(id)
  }
  const homes = Object.entries(state.homes)
  if (homes.length > 100 || homes.some(([id, group]) => !valid(id) || !valid(group)))
    return
  // Older profiles included navigation views in arbitrary dock groups. Keep the
  // user's tool layout, removing only the views now owned by the fixed sidebar.
  const restored = structuredClone(state)
  const removeSidebar = (node: DockNode | null): DockNode | null => {
    if (!node)
      return null
    if (node.kind === 'group') {
      node.views = node.views.filter(id => !isSidebarView(id))
      if (!node.views.includes(node.active))
        node.active = node.views[0] ?? ''
      return node.views.length ? node : null
    }
    const first = removeSidebar(node.first)
    const second = removeSidebar(node.second)
    return first && second ? { ...node, first, second } : first ?? second
  }
  restored.root = removeSidebar(restored.root)
  restored.closed = restored.closed.filter(id => !isSidebarView(id))
  restored.homes = Object.fromEntries(Object.entries(restored.homes).filter(([id]) => !isSidebarView(id)))
  return restored
}

export class DockModel {
  constructor(public state: DockState) {}
  groups(): DockGroup[] {
    return dockGroups(this.state.root)
  }

  groupFor(id: string): DockGroup | undefined {
    return this.groups().find(group => group.views.includes(id))
  }

  knows(id: string): boolean {
    return Boolean(this.groupFor(id)) || this.state.closed.includes(id)
  }

  open(id: string, preferred = 'tools'): void {
    if (isSidebarView(id))
      return
    this.state.closed = this.state.closed.filter(view => view !== id)
    let group = this.groupFor(id)
    if (!group) {
      group = this.groups().find(group => group.id === this.state.homes[id]) ?? this.groups().find(group => group.id === preferred)
      if (!group) {
        group = { kind: 'group', id: this.id(), views: [], active: id }
        const root = this.state.root
        this.state.root = root
          ? {
              kind: 'split',
              id: this.id(),
              axis: 'vertical',
              ratio: 0.7,
              first: root,
              second: group,
            }
          : group
      }
      group.views.push(id)
    }
    group.active = id
  }

  close(id: string): void {
    const group = this.groupFor(id)
    if (!group)
      return
    this.state.homes[id] = group.id
    this.remove(group, id)
    if (!this.state.closed.includes(id))
      this.state.closed.push(id)
    this.state.root = this.prune(this.state.root)
  }

  move(id: string, targetId: string, edge: DockEdge, before?: string): void {
    if (isSidebarView(id))
      return
    const target = this.groups().find(group => group.id === targetId)
    const source = this.groupFor(id)
    if (!target || (target === source && (edge !== 'center' && source.views.length === 1)) || before === id)
      return
    if (source)
      this.remove(source, id)
    this.state.closed = this.state.closed.filter(view => view !== id)
    if (edge === 'center') {
      const index = before ? target.views.indexOf(before) : -1
      target.views.splice(index < 0 ? target.views.length : index, 0, id)
      target.active = id
    }
    else {
      const group: DockGroup = { kind: 'group', id: this.id(), views: [id], active: id }
      const first = edge === 'left' || edge === 'top'
      const split: DockSplit = { kind: 'split', id: this.id(), axis: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical', ratio: 0.5, first: first ? group : target, second: first ? target : group }
      this.state.root = this.replace(this.state.root!, target.id, split)
    }
    this.state.root = this.prune(this.state.root)
  }

  private id(): string {
    return `dock-${crypto.randomUUID()}`
  }

  private remove(group: DockGroup, id: string): void {
    const index = group.views.indexOf(id)
    group.views = group.views.filter(view => view !== id)
    if (group.active === id)
      group.active = group.views[Math.min(index, group.views.length - 1)] ?? ''
  }

  private replace(node: DockNode, id: string, next: DockNode): DockNode {
    if (node.id === id)
      return next
    if (node.kind === 'split') {
      node.first = this.replace(node.first, id, next)
      node.second = this.replace(node.second, id, next)
    }
    return node
  }

  private prune(node: DockNode | null): DockNode | null {
    if (!node || node.kind === 'group')
      return node?.views.length ? node : null
    const first = this.prune(node.first)
    const second = this.prune(node.second)
    if (!first || !second)
      return first ?? second
    return { ...node, first, second }
  }
}
