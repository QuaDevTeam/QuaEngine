import type { EditorGitChange } from '@quajs/editor-core'
import { fuzzyScore } from '../explorer/model'

export interface GitTreeNode {
  id: string
  kind: 'group' | 'folder' | 'file'
  label: string
  path: string
  staged: boolean
  entry?: EditorGitChange
  count: number
  children: GitTreeNode[]
}
export interface GitTreeRow { node: GitTreeNode, depth: number, parent?: string, position: number, siblings: number }
export const stagedChange = (entry: EditorGitChange): boolean => entry.index !== '.' && entry.index !== '?' && !entry.conflict
export function changeStatus(entry: EditorGitChange, staged: boolean): string {
  return entry.conflict ? '!' : entry.index === '?' ? 'U' : staged ? entry.index : entry.worktree
}
export const statusLabels: Record<string, string> = { 'M': '已修改', 'A': '已添加', 'D': '已删除', 'R': '已重命名', 'C': '已复制', 'T': '类型已更改', 'U': '未跟踪', '!': '合并冲突' }

/** Build once per Git status change. Files may occur in both index and worktree groups. */
export function createGitTree(changes: EditorGitChange[], mode: 'tree' | 'list'): GitTreeNode[] {
  const roots: GitTreeNode[] = []
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  for (const [id, label, entries, staged] of [
    ['conflicts', '合并冲突', changes.filter(entry => entry.conflict), false],
    ['staged', '已暂存的更改', changes.filter(stagedChange), true],
    ['changes', '更改', changes.filter(entry => !entry.conflict && (entry.worktree !== '.' || entry.index === '?')), false],
  ] as const) {
    if (!entries.length)
      continue
    const root: GitTreeNode = { id, kind: 'group', label, path: '', staged, count: entries.length, children: [] }
    roots.push(root)
    const folders = new Map([['', root]])
    for (const entry of entries) {
      const parts = entry.path.split('/')
      let parent = root
      if (mode === 'tree') {
        for (let index = 1; index < parts.length; index++) {
          const path = parts.slice(0, index).join('/')
          let folder = folders.get(path)
          if (!folder) {
            folder = { id: `${id}:folder:${path}`, kind: 'folder', label: parts[index - 1], path, staged, count: 0, children: [] }
            folders.set(path, folder)
            parent.children.push(folder)
          }
          folder.count++
          parent = folder
        }
      }
      parent.children.push({ id: `${id}:file:${entry.path}`, kind: 'file', label: parts.at(-1)!, path: entry.path, staged, entry, count: 1, children: [] })
    }
    for (const folder of folders.values())
      folder.children.sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || collator.compare(a.label, b.label) || collator.compare(a.path, b.path))
  }
  return roots
}

export function flattenGitTree(roots: GitTreeNode[], collapsed: Set<string>, query: string): GitTreeRow[] {
  const rows: GitTreeRow[] = []
  const matches = new Set<string>()
  if (query) {
    const match = (node: GitTreeNode): boolean => {
      const found = node.kind === 'file' ? fuzzyScore(`${node.path} ${node.entry?.previousPath || ''}`, query) >= 0 : node.children.map(match).some(Boolean)
      if (found)
        matches.add(node.id)
      return found
    }
    roots.forEach(match)
  }
  const visit = (nodes: GitTreeNode[], depth: number, parent?: string): void => {
    const visible = query ? nodes.filter(node => matches.has(node.id)) : nodes
    visible.forEach((node, index) => {
      rows.push({ node, depth, parent, position: index + 1, siblings: visible.length })
      if (node.kind !== 'file' && (query || !collapsed.has(node.id)))
        visit(node.children, depth + 1, node.id)
    })
  }
  visit(roots, 0)
  return rows
}
