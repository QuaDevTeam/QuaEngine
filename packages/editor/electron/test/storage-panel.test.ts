// @vitest-environment happy-dom
import type { EditorBridge, PreviewStorageResult } from '@quajs/editor-core'
import { expect, it, vi } from 'vitest'
import { PreviewStorage } from '../../ui/src/features/storage/panel'

const catalog = { sources: [{ id: 'native:storage', label: 'Host', group: 'Native Host', description: 'session only' }] }
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

it('serializes requests, rejects old-session results and renders stored markup as text', async () => {
  let release!: (result: PreviewStorageResult) => void
  let active = 0
  let maximum = 0
  const read = vi.fn(async (session, request) => {
    maximum = Math.max(maximum, ++active)
    try {
      if (request.action === 'catalog')
        return catalog
      if (request.action === 'detail')
        return { detail: { text: '<img src=x onerror=alert(1)>', format: 'text', truncated: false } }
      if (session === 'old')
        return await new Promise<PreviewStorageResult>(resolve => release = resolve)
      return { columns: ['Key'], rows: [{ key: 'current', cells: ['current'] }] }
    }
    finally { active-- }
  })
  const host = document.createElement('section')
  document.body.append(host)
  const panel = new PreviewStorage(host, { previewStorage: read } as unknown as EditorBridge)
  panel.setState({ phase: 'running', identity: { sessionId: 'old', target: 'native', buildRevision: 'a' } })
  expect(read).not.toHaveBeenCalled()
  panel.setVisible(true)
  await settle()
  expect(read).toHaveBeenCalledTimes(2)
  panel.setState({ phase: 'running', identity: { sessionId: 'new', target: 'native', buildRevision: 'b' } })
  release({ rows: [{ key: 'old', cells: ['old secret'] }] })
  await settle()
  expect(maximum).toBe(1)
  expect(host.textContent).not.toContain('old secret')
  host.querySelector<HTMLButtonElement>('#storage-table tbody button')!.click()
  await settle()
  expect(host.querySelector('#storage-detail img')).toBeNull()
  expect(host.querySelector('#storage-detail')!.textContent).toContain('<img')
  panel.setVisible(false)
  const count = read.mock.calls.length
  host.querySelector<HTMLButtonElement>('#storage-refresh')!.click()
  await settle()
  expect(read).toHaveBeenCalledTimes(count)
  panel.setState({ phase: 'idle' })
  expect(host.querySelector('#storage-detail')!.textContent).not.toContain('<img')
  host.remove()
})
