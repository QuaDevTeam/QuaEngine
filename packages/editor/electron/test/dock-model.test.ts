import { describe, expect, it } from 'vitest'
import { defaultDockState, DockModel, readDockState } from '../../ui/src/workbench/layout/model'

describe('dock layout', () => {
  it('splits, merges, closes and reopens views without losing or duplicating them', () => {
    const model = new DockModel(defaultDockState(['console', 'terminal', 'properties']))
    model.move('terminal', 'tools', 'right')
    const terminalGroup = model.groupFor('terminal')!.id
    expect(terminalGroup).not.toBe('tools')
    model.move('properties', terminalGroup, 'center')
    model.close('properties')
    model.open('properties')
    expect(model.groupFor('properties')!.id).toBe(terminalGroup)
    model.move('terminal', 'tools', 'center', 'console')
    expect(model.groupFor('console')!.views).toEqual(['terminal', 'console'])
    expect(readDockState(JSON.parse(JSON.stringify(model.state)))).toEqual(model.state)
    for (const group of [...model.groups()]) {
      for (const view of [...group.views]) model.close(view)
    }
    expect(model.state.root).toBeNull()
    model.open('source', 'source')
    expect(model.groups()).toHaveLength(1)
    expect(model.groupFor('source')?.active).toBe('source')
  })

  it('does not detach a sole view when splitting into its own group', () => {
    const state = defaultDockState(['console'])
    const model = new DockModel(structuredClone(state))
    model.move('source', 'source', 'left')
    expect(model.state).toEqual(state)
  })

  it('keeps fixed navigation out of dock commands and restores older layouts without losing tools', () => {
    const state = defaultDockState(['console', 'terminal'])
    const model = new DockModel(structuredClone(state))
    for (const id of ['explorer', 'search', 'git', 'story']) {
      model.open(id)
      model.move(id, 'tools', 'center')
      model.move(id, 'source', 'left')
    }
    expect(model.state).toEqual(state)
    const old = structuredClone(state)
    old.root = {
      kind: 'split',
      id: 'sidebar',
      axis: 'horizontal',
      ratio: 0.21,
      first: { kind: 'group', id: 'navigation', views: ['explorer'], active: 'explorer' },
      second: old.root!,
    }
    const tools = new DockModel(old).groupFor('console')!
    tools.views.unshift('search')
    tools.active = 'search'
    old.closed.push('git', 'story')
    old.homes = { git: 'tools', terminal: 'tools' }
    const restored = readDockState(old)!
    expect(restored).toEqual({ ...state, homes: { terminal: 'tools' } })
    expect(new DockModel(old).groupFor('search')).toBeDefined()
  })

  it('rejects corrupt, duplicate and excessively nested profile layouts', () => {
    const state = defaultDockState(['console'])
    expect(readDockState({ ...state, closed: ['source'] })).toBeUndefined()
    expect(readDockState({ ...state, root: { ...state.root, ratio: Number.NaN } })).toBeUndefined()
    expect(readDockState({ ...state, root: {} })).toBeUndefined()
    let root: unknown = { kind: 'group', id: 'leaf', active: 'source', views: ['source'] }
    for (let index = 0; index < 20; index++) root = { kind: 'split', id: `split-${index}`, axis: 'horizontal', ratio: 0.5, first: root, second: { kind: 'group', id: `group-${index}`, active: `view-${index}`, views: [`view-${index}`] } }
    expect(readDockState({ ...state, root })).toBeUndefined()
  })
})
