import { describe, expect, it } from 'vitest'
import { indexEditorPlugins, validateEditorPlugins } from '../src/plugins/registry'

describe('editor plugin registry', () => {
  it('rejects duplicate ids and incompatible API versions before activation', () => {
    expect(() => validateEditorPlugins([{ id: 'test', apiVersion: 1 }, { id: 'test', apiVersion: 1 }])).toThrow('duplicate')
    expect(() => validateEditorPlugins([{ id: 'test', apiVersion: 2 }])).toThrow('Unsupported')
    expect(() => validateEditorPlugins([{ id: '__proto__', apiVersion: 1 }])).toThrow()
  })
  it('isolates failing indexers from healthy contributions', async () => {
    const result = await indexEditorPlugins([
      { id: 'bad', apiVersion: 1, index: async () => { throw new Error('failed') } },
      { id: 'uncloneable', apiVersion: 1, index: async () => ({ callback: () => {} }) },
      { id: 'good', apiVersion: 1, index: async () => ({ count: 3 }) },
    ], { root: '/project', entries: [], readDocument: async () => { throw new Error('unexpected') } })
    expect(result.bad).toEqual({ error: 'failed' })
    expect(result.uncloneable.error).toBeTruthy()
    expect(result.good).toEqual({ data: { count: 3 } })
  })
})
