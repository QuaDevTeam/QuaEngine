import type { EditorStoryNode } from '@quajs/editor-core'
import type { QuaStoryTreeSnapshot } from '@quajs/project-inspector'
import { relative } from 'node:path'

/** Organize source declarations, without guessing runtime branch/execution order. */
export function createStoryOutline(documents: QuaStoryTreeSnapshot['outline'], root: string): EditorStoryNode[] {
  const result: EditorStoryNode[] = []
  const chapters = new Map<string, EditorStoryNode>()
  for (const document of [...documents].sort((a, b) => (a.filePath || '').localeCompare(b.filePath || '', undefined, { numeric: true }))) {
    if (!document.filePath || !document.symbols.length)
      continue
    const path = relative(root, document.filePath).replaceAll('\\', '/')
    if (path.startsWith('../') || path === '..')
      continue
    const nodes = new Map<number, EditorStoryNode>()
    const files = new Map<string, EditorStoryNode>()
    const fileFor = (chapter?: EditorStoryNode): EditorStoryNode => {
      const key = `${chapter?.key || 'outline'}:file:${path}`
      let file = files.get(key)
      if (!file) {
        file = { key, id: path, kind: 'file', title: path.split('/').pop()!, filePath: path, line: 1, column: 1, children: [] }
        files.set(key, file)
        ;(chapter?.children || result).push(file)
      }
      return file
    }
    document.symbols.forEach((symbol, index) => {
      const location = { filePath: path, line: symbol.range.start.line + 1, column: symbol.range.start.column + 1 }
      if (symbol.kind === 'chapter') {
        // A branch can reuse a chapter id with a different title. Do not merge it away.
        const key = `chapter:${JSON.stringify([symbol.id, symbol.title])}`
        let chapter = chapters.get(key)
        if (!chapter) {
          chapter = { key, id: symbol.id, title: symbol.title, kind: 'chapter', ...location, children: [] }
          chapters.set(key, chapter)
          result.push(chapter)
        }
        nodes.set(index, chapter)
        return
      }
      const parent = symbol.parent === undefined ? undefined : nodes.get(symbol.parent)
      const container = !parent || parent.kind === 'chapter' ? fileFor(parent) : parent
      const occurrence = container.children.filter(node => node.kind === symbol.kind && node.id === symbol.id).length
      const node: EditorStoryNode = { key: `${container.key}:${symbol.kind}:${symbol.id}:${occurrence}`, id: symbol.id, title: symbol.title, kind: symbol.kind, ...location, children: [] }
      container.children.push(node)
      nodes.set(index, node)
    })
  }
  return result.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}
