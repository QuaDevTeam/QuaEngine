import type { EditorGitChange } from '@quajs/editor-core'
import { expect, it } from 'vitest'
import { changeStatus, createGitTree, flattenGitTree } from '../../ui/src/features/git/tree.js'

const change = (path: string, index = '.', worktree = 'M'): EditorGitChange => ({ path, index, worktree, conflict: false, submodule: false, outsideRename: false })
it('groups each index and disk change independently, sorts folders and supports collapse/filter with source paths intact', () => {
  const entries = [change('src/scenes/10.qs'), change('src/scenes/2.qs', 'M'), change('assets/图像.png', '?', '?'), { ...change('src/new.qs', 'R', '.'), previousPath: 'src/old.qs' }, { ...change('conflict.qs', 'U', 'U'), conflict: true }]
  const roots = createGitTree(entries, 'tree')
  expect(roots.map(node => [node.id, node.count])).toEqual([['conflicts', 1], ['staged', 2], ['changes', 3]])
  const rows = flattenGitTree(roots, new Set(), '')
  expect(rows.filter(row => row.node.path === 'src/scenes/2.qs').map(row => row.node.staged)).toEqual([true, false])
  expect(rows.filter(row => row.node.kind === 'file' && !row.node.staged).map(row => row.node.path)).toEqual(['conflict.qs', 'assets/图像.png', 'src/scenes/2.qs', 'src/scenes/10.qs'])
  const collapsed = new Set(['changes:folder:src'])
  expect(flattenGitTree(roots, collapsed, '').some(row => row.node.path === 'src/scenes/10.qs')).toBe(false)
  expect(flattenGitTree(roots, collapsed, '10.qs').map(row => row.node.path)).toEqual(['', 'src', 'src/scenes', 'src/scenes/10.qs'])
  expect(flattenGitTree(roots, collapsed, 'old.qs').at(-1)?.node.entry?.path).toBe('src/new.qs')
  expect(changeStatus(entries[2], false)).toBe('U')
})
it('keeps folder hierarchy out of list mode and retains duplicate basenames and deleted files', () => {
  const roots = createGitTree([change('a/scene.qs'), change('b/scene.qs', 'D', '.'), change('a/gone.qs', '.', 'D')], 'list')
  const rows = flattenGitTree(roots, new Set(), '')
  expect(rows.some(row => row.node.kind === 'folder')).toBe(false)
  expect(rows.filter(row => row.node.kind === 'file').map(row => row.node.path).sort()).toEqual(['a/gone.qs', 'a/scene.qs', 'b/scene.qs'])
  expect(new Set(rows.map(row => row.node.id)).size).toBe(rows.length)
})
