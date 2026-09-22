import type { ExplorerActions } from '../features/explorer/actions'
import type { FileTree } from '../features/explorer/tree'
import type { GitPanel } from '../features/git/panel'
import type { StoryOutline } from '../features/outline/panel'
import type { SearchPanel } from '../features/search/panel'
import type { QuickOpen } from '../features/search/quick-open'
import type { DockWorkbench } from './layout/controller'
import type { SidebarView } from './sidebar/views'
import { render } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from '../shared/icons'
import { isSidebarView } from './sidebar/views'

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}
interface NavigationContext {
  tree: FileTree
  actions: ExplorerActions
  showSidebar: (view: SidebarView) => void
  git: GitPanel
  showPanel: (view: string) => void
  activeDocument: string
  outline: StoryOutline
  togglePanel: () => void
  closeFileFilter: () => void
  bindTabKeys: (id: string, views: string[], prefix: string, activate: (view: string) => void) => void
  dock: DockWorkbench
  openTerminal: (fresh?: boolean) => void
  search: SearchPanel
  quickOpen: QuickOpen
  error: (error: unknown) => void
}
export function connectNavigation(context: NavigationContext): void {
  context.tree.interactions = {
    context: path => void context.actions.context(path).catch(context.error),
    drop: (path, directory) =>
      void context.actions.drop(path, directory).catch(context.error),
    action: action => context.actions.run(action),
  }
  for (const [id, name, label, action] of [
    ['new-file', 'document', '新建文件', 'new-file'],
    ['new-folder', 'folder', '新建文件夹', 'new-folder'],
  ] as const) {
    const button = element<HTMLButtonElement>(id)
    render(unsafeHTML(icon(name)), button)
    button.title = label
    button.setAttribute('aria-label', label)
    button.onclick = () => context.actions.run(action)
  }
  element('git-branch').onclick = () => {
    context.showSidebar('git')
    void context.git.chooseBranch()
  }
  for (const [view, name, title] of [
    ['explorer', 'files', '资源管理器（⌘/Ctrl Shift E）'],
    ['search', 'search', '搜索（⌘/Ctrl Shift F）'],
    ['git', 'branch', '源代码管理（⌘/Ctrl Shift G）'],
    ['story', 'story', '故事大纲'],
  ] as const) {
    const button = element<HTMLButtonElement>(`activity-${view}`)
    render(unsafeHTML(icon(name)), button)
    button.title = title
    button.onclick = () => context.showSidebar(view)
  }
  for (const view of [
    'problems',
    'console',
    'terminal',
    'assets',
    'inspector',
    'storage',
    'performance',
    'scene-debugger',
  ] as const) {
    element<HTMLButtonElement>(`tab-${view}`).onclick = () =>
      context.showPanel(view)
  }
  for (const [id, name, title, action] of [
    [
      'collapse-files',
      'collapse',
      '折叠全部文件夹',
      () => {
        element<HTMLInputElement>('file-search').value = ''
        context.tree.collapse()
      },
    ],
    [
      'reveal-document',
      'locate',
      '定位当前文件',
      () => {
        element<HTMLInputElement>('file-search').value = ''
        context.tree.reveal(context.activeDocument)
      },
    ],
    [
      'outline-reveal',
      'locate',
      '定位当前文件的大纲',
      () => context.outline.revealActive(),
    ],
    [
      'outline-collapse',
      'collapse',
      '折叠全部大纲',
      () => context.outline.collapse(),
    ],
    ['panel-close', 'close', '隐藏面板（⌘/Ctrl J）', () => context.togglePanel()],
  ] as const) {
    const button = element<HTMLButtonElement>(id)
    render(unsafeHTML(icon(name)), button)
    button.title = title
    button.setAttribute('aria-label', title)
    button.onclick = action
  }
  element('file-filter-close').onclick = () => context.closeFileFilter()
  element<HTMLInputElement>('file-search').oninput = () => {
    const query = element<HTMLInputElement>('file-search').value
    context.tree.filter(query)
  }
  element<HTMLInputElement>('file-search').onkeydown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      element('files').focus()
    }
  }
  element('check-indicator').onclick = () => context.showPanel('problems')
  context.bindTabKeys(
    'activity-bar',
    ['explorer', 'search', 'git', 'story', 'writer', 'extensions'],
    'activity-',
    view => isSidebarView(view) ? context.showSidebar(view) : context.dock.open(view),
  )
  window.addEventListener(
    'keydown',
    (event) => {
      if (
        !document.querySelector('dialog[open]')
        && event.ctrlKey
        && !event.altKey
        && !event.metaKey
        && event.code === 'Backquote'
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        context.openTerminal(event.shiftKey)
        return
      }
      if (element('panel-terminal').contains(document.activeElement))
        return
      if (
        event.key === 'Escape'
        && !element('file-filter').hidden
        && element('view-explorer').contains(document.activeElement)
        && !document.querySelector('dialog[open]')
      ) {
        event.preventDefault()
        event.stopPropagation()
        context.closeFileFilter()
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey)
        return
      const key = event.key.toLowerCase()
      if (document.querySelector('dialog[open]')) {
        if (key === 'p' && !event.shiftKey)
          event.preventDefault()
        return
      }
      if (event.shiftKey && key === 'e') {
        context.showSidebar('explorer')
        element('files').focus()
      }
      else if (event.shiftKey && key === 'f') {
        context.showSidebar('search')
        context.search.focus()
      }
      else if (event.shiftKey && key === 'g') {
        context.showSidebar('git')
      }
      else if (!event.shiftKey && key === 'p') {
        context.quickOpen.show()
      }
      else if (
        !event.shiftKey
        && key === 'f'
        && (document.activeElement === element('activity-explorer')
          || element('view-explorer').contains(document.activeElement)
          || element('explorer-actions').contains(document.activeElement))
      ) {
        element('file-filter').hidden = false
        element<HTMLInputElement>('file-search').focus()
        element<HTMLInputElement>('file-search').select()
      }
      else if (!event.shiftKey && key === 'j') {
        context.togglePanel()
      }
      else {
        return
      }
      event.preventDefault()
      event.stopPropagation()
    },
    true,
  )
}
