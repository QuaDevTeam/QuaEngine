import { expect, it, vi } from 'vitest'
import { nativeStorage } from '../src/preview-host/native/storage.js'

it('separates engine storage from native host resources and authorizes both', async () => {
  const send = vi.fn(async (method, params) => {
    expect(params.token).toBe('fixture-token')
    return method === 'Qua.getStorage' ? { sources: [{ id: 'native:assets' }] } : { storage: { sources: [{ id: 'engine:snapshots' }] } }
  })
  const read = nativeStorage(send, 'fixture-token')
  expect((await read({ action: 'catalog' })).sources?.map(item => item.id)).toEqual(['engine:snapshots', 'native:assets'])
  await read({ action: 'page', source: 'engine:snapshots' })
  expect(send.mock.lastCall?.[0]).toBe('Qua.editorCommand')
  await read({ action: 'page', source: 'native:assets' })
  expect(send.mock.lastCall?.[0]).toBe('Qua.getStorage')
})

it('keeps host resources usable when a project has no engine debug adapter', async () => {
  const read = nativeStorage(async (method) => {
    if (method === 'Qua.editorCommand')
      throw new Error('not supported')
    return { sources: [{ id: 'native:assets' }] }
  }, 'token')
  const result = await read({ action: 'catalog' })
  expect(result.sources?.[0].id).toBe('native:assets')
  expect(result.warning).toContain('查询失败')
})
