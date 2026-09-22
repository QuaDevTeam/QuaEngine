import type { EditorStoryNode } from '@quajs/editor-core'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createQuaProjectInspector } from '@quajs/project-inspector'
import { describe, expect, it } from 'vitest'
import { ProjectService } from '../src/project-service/project'
import { createStoryOutline } from '../src/project-service/story-outline'

describe('project story outline', () => {
  it('indexes the actual Demo chapters, nodes and choices with exact source destinations', async () => {
    const root = fileURLToPath(new URL('../../../../demo/', import.meta.url))
    const project = await new ProjectService().open(root)
    const files = (await readdir(resolve(root, 'src/game/scenes'))).filter(path => path.endsWith('.qs'))
    const all = project.story.flatMap(function visit(node: EditorStoryNode): EditorStoryNode[] {
      return [node, ...node.children.flatMap(visit)]
    })
    expect(all.filter(node => node.kind === 'file')).toHaveLength(files.length)
    expect(all.every(node => !node.filePath?.includes('.generated'))).toBe(true)
    expect(project.story.filter(node => node.id === '05').map(node => node.title).sort()).toEqual(['下一次见面', '绿色指示灯'])
    for (const file of files) {
      const path = `src/game/scenes/${file}`
      const source = await readFile(resolve(root, path), 'utf8')
      // Independent declaration count against Demo's authored single-line nodes.
      const expected = [...source.matchAll(/^@Node\('([^']+)', \{ title: '([^']+)' \}\)/gm)]
      const actual = all.filter(node => node.kind === 'node' && node.filePath === path)
      expect(actual.map(node => [node.id, node.title])).toEqual(expected.map(match => [match[1], match[2]]))
      for (const node of all.filter(node => node.filePath === path && node.kind !== 'file')) {
        const line = source.split('\n')[node.line! - 1]
        expect(line.slice(node.column! - 1)).toMatch(new RegExp(`^@${node.kind[0].toUpperCase()}${node.kind.slice(1)}\\(`))
      }
      expect(all.filter(node => node.kind === 'choice' && node.filePath === path)).toHaveLength([...source.matchAll(/^@Choice\(/gm)].length)
    }
    expect(all.filter(node => node.kind === 'node').length).toBeGreaterThan(70)
  })

  it('keeps duplicate source ids and exposes malformed-file errors without losing valid files', async () => {
    const snapshot = await createQuaProjectInspector({ extraFiles: {
      '/project/a.qs': '@Scene("room")\n@Node("same", {title:"First"})\nA\n@Node("same", {title:"Second"})\nB',
      '/project/b.qs': '@Node("broken"',
    } }).refresh()
    expect(snapshot.risks.some(risk => risk.code === 'story.source_parse_failed' && risk.filePath === '/project/b.qs')).toBe(true)
    const nodes = snapshot.storyTree.nodes
    expect(nodes.map(node => node.sourceLocation?.range?.start.line)).toEqual([1, 3])
    const tree = createStoryOutline(snapshot.storyTree.outline, '/project')
    const children = tree[0].children[0].children
    expect(children.map(node => node.title)).toEqual(['First', 'Second'])
    expect(new Set(children.map(node => node.key)).size).toBe(2)
  })
})
