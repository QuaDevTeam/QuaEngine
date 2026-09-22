export const sidebarViews = [
  { id: 'explorer', title: '资源管理器', actions: 'explorer-actions' },
  { id: 'search', title: '搜索' },
  { id: 'git', title: '源代码管理', actions: 'git-actions' },
  { id: 'story', title: '故事大纲', actions: 'outline-actions' },
] as const

export type SidebarView = typeof sidebarViews[number]['id']

export function isSidebarView(id: string): id is SidebarView {
  return sidebarViews.some(view => view.id === id)
}
