import type { NovelProject } from '$lib/types'
import { describe, expect, it } from 'vitest'
import { mergeEditorContext } from './editor-context'

const project: NovelProject = { id: 'a', title: 'A', brief: '写作', mode: 'step', status: 'idle', createdAt: '', updatedAt: '', maxRevisionLoops: 2, seed: { characters: '既定角色' } }
describe('project canon merge', () => {
  it('fills missing inputs while preserving user canon and generated settings', () => {
    const next = mergeEditorContext(project, { root: '/a', seed: { characters: '新角色', worldbuilding: '新世界', outline: '树' } }, new Set(['worldbuilding']))
    expect(next.seed).toEqual({ characters: '既定角色', outline: '树' })
    expect(next.editorRoot).toBe('/a')
  })
  it('refuses to rebind an existing project to another root', () => {
    expect(() => mergeEditorContext({ ...project, editorRoot: '/a' }, { root: '/b', seed: {} }, new Set())).toThrow('另一个')
  })
})
