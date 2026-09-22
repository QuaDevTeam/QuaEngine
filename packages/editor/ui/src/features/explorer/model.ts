import type { EditorFileEntry } from '@quajs/editor-core'

export interface TreeNode {
  path: string
  name: string
  directory: boolean
  entry?: EditorFileEntry
  children: TreeNode[]
}
export interface TreeRow { node: TreeNode, depth: number, position: number, siblings: number }

export function fuzzyScore(path: string, query: string): number {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle)
    return 0
  const value = path.toLocaleLowerCase()
  const basename = value.slice(value.lastIndexOf('/') + 1)
  if (basename === needle)
    return 10000
  if (basename.startsWith(needle))
    return 8000 - basename.length
  if (value.includes(needle))
    return 6000 - value.indexOf(needle)
  let cursor = 0
  let score = 0
  let previous = -2
  for (const character of needle) {
    const index = value.indexOf(character, cursor)
    if (index < 0)
      return -1
    score += index === previous + 1 ? 20 : 1
    if (index === 0 || '/-_.'.includes(value[index - 1]))
      score += 10
    previous = index
    cursor = index + 1
  }
  return score
}

export function createTree(entries: EditorFileEntry[], directories: string[]): TreeNode {
  const root: TreeNode = { path: '', name: '', directory: true, children: [] }
  const nodes = new Map([['', root]])
  const folder = (path: string): TreeNode => {
    const found = nodes.get(path)
    if (found)
      return found
    const slash = path.lastIndexOf('/')
    const parent = folder(slash < 0 ? '' : path.slice(0, slash))
    const node: TreeNode = { path, name: path.slice(slash + 1), directory: true, children: [] }
    nodes.set(path, node)
    parent.children.push(node)
    return node
  }
  for (const path of directories) folder(path)
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/')
    folder(slash < 0 ? '' : entry.path.slice(0, slash)).children.push({ path: entry.path, name: entry.path.slice(slash + 1), entry, directory: false, children: [] })
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  for (const node of nodes.values()) node.children.sort((a, b) => Number(b.directory) - Number(a.directory) || collator.compare(a.name, b.name))
  return root
}

export function flattenTree(root: TreeNode, expanded: Set<string>, query: string): TreeRow[] {
  const rows: TreeRow[] = []
  const matching = new Set<string>()
  if (query) {
    const visit = (node: TreeNode): boolean => {
      const children = node.children.map(visit).some(Boolean)
      const match = fuzzyScore(node.path, query) >= 0 || children
      if (match)
        matching.add(node.path)
      return match
    }
    visit(root)
  }
  const visit = (node: TreeNode, depth: number): void => {
    const children = query ? node.children.filter(child => matching.has(child.path)) : node.children
    children.forEach((child, index) => {
      rows.push({ node: child, depth, position: index + 1, siblings: children.length })
      if (child.directory && (query || expanded.has(child.path)))
        visit(child, depth + 1)
    })
  }
  visit(root, 0)
  return rows
}
