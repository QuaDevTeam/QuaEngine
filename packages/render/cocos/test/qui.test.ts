import type { NativeUiSurfaceNodeProjection } from '@quajs/native-ui-compiler/runtime'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { Pipeline } from '@quajs/pipeline'
import { describe, expect, it, vi } from 'vitest'
import { emptyCocosView, QuaCocosRendererController } from '../src'
import { createQuiCocosRendererPlugin } from '../src/qui'

const flush = () => new Promise(resolve => setTimeout(resolve, 50))
function node(id: string, x = 0, y = 0, width = 100, height = 80, extra: Record<string, unknown> = {}): NativeUiSurfaceNodeProjection {
  return { id, kind: 'Button', visible: true, bounds: { x, y, width, height }, style: { color: '#123456', fontSize: 24, letterSpacing: 2 }, text: id, children: [], intent: { event: 'test/intent', action: id }, ...extra } as NativeUiSurfaceNodeProjection
}
function view(root: NativeUiSurfaceNodeProjection) {
  const result = emptyCocosView()
  result.ui.overlays = { demo: { visible: true, surface: { key: 'shared', root } } }
  return result
}
describe('shared QUI Cocos projection', () => {
  it('projects semantic select decorations into optional host drawing metadata', async () => {
    const host = createFakeCocosHost()
    const arrow = node('arrow', 0, 0, 13, 8, { kind: 'Box', role: 'ui-select-chevron-down', intent: undefined, text: undefined, style: { backgroundColor: '#42796e' } })
    const renderer = new QuaCocosRendererController({ host, pipeline: new Pipeline(), initialView: view(arrow), plugins: [createQuiCocosRendererPlugin({ surfaceKeys: ['shared'] })] })
    await renderer.start()
    await flush()
    expect([...host.nodesById.values()].find(n => n.name === 'arrow')?.boxStyle).toMatchObject({ shape: 'chevron-down' })
    expect(arrow.style).not.toHaveProperty('shape')
    await renderer.destroy()
  })
  it('routes scaled pointer intents through the pipeline and blocks black bars, disabled and clipped controls', async () => {
    const host = createFakeCocosHost({ containerSize: { width: 960, height: 720 } })
    const pipeline = new Pipeline()
    const intent = vi.fn()
    pipeline.on('test/intent', intent)
    const root = node('panel', 0, 0, 1920, 1080, { kind: 'Panel', intent: undefined, children: [node('play', 100, 100), node('disabled', 300, 100, 100, 80, { accessibility: { disabled: true } }), node('clip', 500, 100, 100, 80, { kind: 'Panel', clipChildren: true, children: [node('outside', 650, 100)] })] })
    const renderer = new QuaCocosRendererController({ host, pipeline, initialView: view(root), plugins: [createQuiCocosRendererPlugin({ surfaceKeys: ['shared'] })] })
    await renderer.start()
    await flush()
    const input = async (x: number, y: number) => {
      await host.emitInput({ kind: 'pointer', phase: 'down', x, y })
      await host.emitInput({ kind: 'pointer', phase: 'up', x, y })
    }
    await host.emitInput({ kind: 'pointer', phase: 'up', x: 75, y: 160 })
    expect(intent).not.toHaveBeenCalled()
    await input(75, 160) // 0.5 scale, 90px vertical black bars
    expect(intent).toHaveBeenCalledTimes(1)
    expect(intent.mock.calls[0][0].event.payload).toMatchObject({ action: 'play', elementId: 'demo' })
    await input(175, 160)
    await input(350, 160)
    await input(75, 40)
    expect(intent).toHaveBeenCalledTimes(1)
    const rendered = [...host.nodesById.values()].find(n => n.name === 'play')!
    expect(rendered.textStyle).toMatchObject({ letterSpacing: 2, fontSize: 24 })
    await renderer.destroy()
    expect(host.root.children).toHaveLength(0)
  })

  it('scrolls only transient child transforms and preserves the readonly surface', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const child = node('row', 0, 300, 100, 80)
    const root = node('scroll', 0, 0, 200, 200, { kind: 'Scroll', clipChildren: true, intent: undefined, children: [child] })
    const initial = view(root)
    const renderer = new QuaCocosRendererController({ host, pipeline, initialView: initial, plugins: [createQuiCocosRendererPlugin({ surfaceKeys: ['shared'] })] })
    await renderer.start()
    await flush()
    await host.emitInput({ kind: 'pointer', phase: 'wheel', x: 50, y: 50, metadata: { deltaY: 120 } })
    expect([...host.nodesById.values()].find(n => n.name === 'row')?.transform.y).toBe(180)
    expect(child.bounds.y).toBe(300)
    expect(initial.ui.overlays?.demo.surface?.root).toBe(root)
    await pipeline.emit('native-ui/scroll', { elementId: 'demo', nodeId: 'scroll', edge: 'end' })
    expect([...host.nodesById.values()].find(n => n.name === 'row')?.transform.y).toBe(120)
    await pipeline.emit('native-ui/scroll', { elementId: 'other', nodeId: 'scroll', edge: 'start' })
    expect([...host.nodesById.values()].find(n => n.name === 'row')?.transform.y).toBe(120)
    await pipeline.emit('native-ui/scroll', { elementId: 'demo', nodeId: 'scroll', edge: 'start' })
    expect([...host.nodesById.values()].find(n => n.name === 'row')?.transform.y).toBe(300)
    await renderer.destroy()
    await pipeline.emit('native-ui/scroll', { elementId: 'demo', nodeId: 'scroll', edge: 'end' })
    expect(host.root.children).toHaveLength(0)
  })

  it('disposes a GPU backdrop that completes after renderer teardown', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const dispose = vi.fn()
    host.capture!.captureBackdrop = async () => {
      await gate
      return { resource: { id: 'late', kind: 'spriteFrame' }, dispose }
    }
    const root = node('backdrop', 0, 0, 1920, 1080, { kind: 'Backdrop', style: { backdropFilter: { blurRadius: 12 } } })
    const renderer = new QuaCocosRendererController({ host, pipeline, initialView: view(root), plugins: [createQuiCocosRendererPlugin({ surfaceKeys: ['shared'] })] })
    await renderer.start()
    await flush()
    await renderer.destroy()
    release()
    await flush()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(host.root.children).toHaveLength(0)
  })

  it('discards a backdrop captured for an earlier viewport while resizing', async () => {
    const containerSize = { width: 960, height: 720 }
    const host = createFakeCocosHost({ containerSize })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const staleDispose = vi.fn()
    let calls = 0
    const capture = vi.fn(async () => {
      if (++calls === 1) {
        await gate
        return { resource: { id: 'stale', kind: 'spriteFrame' as const }, dispose: staleDispose }
      }
      return { resource: { id: 'current', kind: 'spriteFrame' as const }, dispose: vi.fn() }
    })
    host.capture!.captureBackdrop = capture
    const root = node('backdrop', 0, 0, 1920, 1080, { kind: 'Backdrop', style: { backdropFilter: { blurRadius: 12 } } })
    const renderer = new QuaCocosRendererController({ host, pipeline: new Pipeline(), initialView: view(root), plugins: [createQuiCocosRendererPlugin({ surfaceKeys: ['shared'] })] })
    await renderer.start()
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1))
    containerSize.width = 1920
    containerSize.height = 1080
    host.emitLayoutChange()
    release()
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2))
    expect(staleDispose).toHaveBeenCalledOnce()
    expect(capture.mock.calls[1]).toEqual([{ x: 0, y: 0, width: 1920, height: 1080 }])
    await renderer.destroy()
  })
})
