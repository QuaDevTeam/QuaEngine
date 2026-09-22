import { afterEach, expect, it, vi } from 'vitest'
import { createDemoNativeSession } from '../src/targets/native/session'

let session: Awaited<ReturnType<typeof createDemoNativeSession>> | undefined
let disconnect: (() => void) | undefined
afterEach(async () => {
  disconnect?.()
  await session?.destroy()
  vi.unstubAllEnvs()
})

it('blocks player actions during loading while answering editor status and accepting GPU completion', async () => {
  vi.stubEnv('VITE_QUA_EDITOR_PREVIEW', '1')
  session = await createDemoNativeSession()
  const messages: { event: string, payload: any }[] = []
  disconnect = session.connectPipelineBridge({ emit: (event, payload) => { messages.push({ event, payload }) } })
  const preparation = () => messages.filter(message => message.event === 'view/update').at(-1)?.payload.view.plugins?.['asset-loading']?.preparation
  await vi.waitFor(() => expect(preparation()?.id).toBeDefined())
  expect(messages.filter(message => message.event === 'view/update').at(-1)?.payload.view.plugins?.['asset-loading']?.phase).toBe('loading-local')
  expect(session.getInteractionDiagnostics().screen).toBe('loading')
  await session.dispatchIntent({ type: 'ui/intent', payloadJson: JSON.stringify({ action: 'open', arg0: 'story' }) })
  expect(session.getInteractionDiagnostics().screen).toBe('loading')
  await session.dispatchIntent({ type: 'editor/preview/request', payloadJson: JSON.stringify({ id: 'loading-status', command: { action: 'status' } }) })
  expect(messages.find(message => message.event === 'editor/preview/response')?.payload).toMatchObject({ id: 'loading-status', result: expect.any(Object) })
  await session.dispatchIntent({ type: 'asset-loading/renderer-progress', payloadJson: JSON.stringify({ id: preparation().id, completed: 1, total: 1 }) })
  await vi.waitFor(() => expect(session!.getInteractionDiagnostics().screen).toBe('title'))
})
