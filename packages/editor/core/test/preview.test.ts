import type { PreviewDriver, PreviewStart, PreviewState } from '../src/index.js'
import { describe, expect, it, vi } from 'vitest'
import { PreviewController } from '../src/index.js'

function fixture(driver: PreviewDriver) {
  let id = 0
  const states: PreviewState[] = []
  const log = vi.fn()
  const controller = new PreviewController({ createId: () => String(++id), loadDriver: async () => driver, changed: state => states.push(state), log })
  return { controller, states, log }
}
const request = { target: 'web' as const, projectRoot: '/project', script: 'dev:web', buildRevision: 'source-1' }
describe('preview lifecycle', () => {
  it('publishes startup progress and drops late, cancelled and completed-session updates', async () => {
    let finish!: () => void
    let context!: PreviewStart
    const { controller } = fixture({ start: async (request) => {
      context = request
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return { stop: async () => {} }
    } })
    const opening = controller.start({ ...request, target: 'native' })
    await vi.waitFor(() => expect(context).toBeDefined())
    context.progress?.({ stage: 'assets', label: 'QPK', detail: 'x'.repeat(1000) })
    expect(controller.getSnapshot().progress).toEqual({ stage: 'assets', label: 'QPK', detail: 'x'.repeat(240) })
    finish()
    await opening
    context.progress?.({ stage: 'assets', label: 'late' })
    expect(controller.getSnapshot().progress).toBeUndefined()
    await controller.stop()
    context.progress?.({ stage: 'assets', label: 'cancelled' })
    expect(controller.getSnapshot().phase).toBe('idle')
    expect(controller.getSnapshot().progress).toBeUndefined()
  })
  it('keeps output mute through startup, target replacement and stop without a game command', async () => {
    const setMuted = vi.fn(async (_muted: boolean) => {})
    const start = vi.fn(async (_request: PreviewStart) => ({ stop: async () => {}, setMuted }))
    const { controller } = fixture({ start })
    await controller.setMuted(true)
    await controller.start(request)
    expect(start.mock.calls[0][0].muted).toBe(true)
    expect(setMuted).toHaveBeenLastCalledWith(true)
    await controller.start({ ...request, target: 'native', reloading: true })
    expect(start.mock.calls[1][0].muted).toBe(true)
    await controller.setMuted(false)
    expect(setMuted).toHaveBeenLastCalledWith(false)
    await controller.setMuted(true)
    await controller.stop()
    expect(controller.getSnapshot()).toEqual({ phase: 'idle', muted: true })
  })
  it('applies a mute changed during startup before publishing running', async () => {
    let finish!: () => void
    const setMuted = vi.fn(async (_muted: boolean) => {})
    const { controller, states } = fixture({ start: async () => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return { stop: async () => {}, setMuted }
    } })
    const opening = controller.start(request)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    const muting = controller.setMuted(true)
    finish()
    await Promise.all([opening, muting])
    expect(setMuted.mock.calls.every(([muted]) => muted === true)).toBe(true)
    expect(states.filter(state => state.phase === 'running').every(state => state.muted)).toBe(true)
    await controller.stop()
  })
  it('releases the old backend before starting the other target and rejects stale sessions', async () => {
    const events: string[] = []
    const starts: PreviewStart[] = []
    const { controller, log } = fixture({ start: async (context) => {
      starts.push(context)
      events.push(`start:${context.target}`)
      return { stop: async () => {
        events.push(`stop:${context.target}`)
      } }
    } })
    await controller.start(request)
    const replacing = controller.start({ ...request, target: 'native', script: 'dev:native' })
    expect(controller.isCurrentSession('1')).toBe(false)
    expect(() => controller.getHandle('1')).toThrow('no longer running')
    await replacing
    expect(events).toEqual(['start:web', 'stop:web', 'start:native'])
    expect(() => controller.getHandle('1')).toThrow('no longer running')
    starts[0].log('late output')
    starts[0].failed(new Error('old crash'))
    expect(log).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'running', identity: { target: 'native' } })
    const stopping = controller.stop()
    expect(controller.isCurrentSession('2')).toBe(false)
    await stopping
    expect(events.at(-1)).toBe('stop:native')
  })
  it('cancels startup, releases a late handle, and never publishes running', async () => {
    let finish!: () => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const stop = vi.fn(async () => {
    })
    const { controller, states } = fixture({ start: async () => {
      entered()
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return { stop }
    } })
    const opening = controller.start(request)
    await started
    const stopping = controller.stop()
    finish()
    await Promise.all([opening, stopping])
    expect(stop).toHaveBeenCalledOnce()
    expect(states.some(state => state.phase === 'running')).toBe(false)
    expect(controller.getSnapshot().phase).toBe('idle')
  })
  it('does not start a second backend if teardown fails', async () => {
    const start = vi.fn(async () => ({ stop: async () => {
      throw new Error('still alive')
    } }))
    const { controller } = fixture({ start })
    await controller.start(request)
    await expect(controller.start({ ...request, target: 'native' })).rejects.toThrow('still alive')
    expect(start).toHaveBeenCalledOnce()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringContaining('still alive') })
  })
  it('does not report deliberate startup cancellation as a new session error', async () => {
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const { controller, states } = fixture({ start: async ({ signal }) => {
      entered()
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      throw new Error('unreachable')
    } })
    const opening = controller.start(request)
    await started
    await controller.stop()
    await expect(opening).resolves.toBeUndefined()
    expect(states.some(state => state.phase === 'error')).toBe(false)
    expect(controller.getSnapshot().phase).toBe('idle')
  })
  it('can recover from startup failure', async () => {
    const start = vi.fn().mockRejectedValueOnce(new Error('missing runtime')).mockResolvedValue({ stop: async () => {
    } })
    const { controller } = fixture({ start })
    await expect(controller.start(request)).rejects.toThrow('missing runtime')
    expect(controller.getSnapshot().phase).toBe('error')
    await controller.start(request)
    expect(controller.getSnapshot().phase).toBe('running')
    await controller.stop()
  })
})
