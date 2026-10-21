import type { NativeUiSurfaceNodeProjection } from '@quajs/native-ui-compiler/runtime'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { Pipeline } from '@quajs/pipeline'
import { RenderToLogicEvents } from '@quajs/render-core'
import { describe, expect, it, vi } from 'vitest'
import { QuaSceneRendererController } from '../src/controller'
import { emptySceneView } from '../src/defaults'
import { createCharacterSceneRendererPlugin } from '../src/plugins/character'
import { createChoicesSceneRendererPlugin } from '../src/plugins/choices'
import { createInputSceneRendererPlugin } from '../src/plugins/input'
import { createQuiSceneRendererPlugin } from '../src/qui'

async function flush() {
  for (let i = 0; i < 200; i++) await Promise.resolve()
}

async function fixture() {
  const host = createFakeCocosHost()
  const pipeline = new Pipeline()
  const view = emptySceneView()
  const root: NativeUiSurfaceNodeProjection = {
    id: 'select',
    kind: 'Panel',
    visible: true,
    bounds: { x: 100, y: 100, width: 300, height: 60 },
    style: { backgroundColor: '#fffdf7', borderColor: '#b8c9bd', borderWidth: 1 },
    stateStyles: { hover: { bounds: { x: 100, y: 100, width: 300, height: 60 }, style: { backgroundColor: '#e3ebe2' } } },
    control: { kind: 'select', selectedIndex: 0, parts: { value: 'value' }, options: [30, 60, 120].map(value => ({ label: `${value} 帧`, intent: { event: 'test/select', action: 'select', metadata: { value } } })) },
    children: [{ id: 'value', kind: 'Text', visible: true, bounds: { x: 112, y: 110, width: 260, height: 40 }, text: '30 帧', style: { fontSize: 22, lineHeight: 30, color: '#29453f' } }],
  }
  view.ui.overlays = { test: { visible: true, surface: { key: 'test', root } } }
  const renderer = new QuaSceneRendererController({ host, pipeline, initialView: view, plugins: [createInputSceneRendererPlugin(), createQuiSceneRendererPlugin({ surfaceKeys: ['test'] })] })
  await renderer.start()
  await flush()
  const click = async (x: number, y: number) => {
    await host.emitInput({ kind: 'pointer', phase: 'down', x, y })
    await host.emitInput({ kind: 'pointer', phase: 'up', x, y })
    await flush()
  }
  return { host, pipeline, renderer, view, click }
}

describe('shared scene control interactions', () => {
  it.each([960, 1280, 1920])('keeps backdrop sigma in logical pixels at width %i and releases the capture', async (width) => {
    const host = createFakeCocosHost({ containerSize: { width, height: width * 9 / 16 } })
    const capture = vi.spyOn(host.capture!, 'captureBackdrop')
    const view = emptySceneView()
    view.ui.overlays = { test: { visible: true, surface: { key: 'test', root: {
      id: 'glass',
      kind: 'Backdrop',
      visible: true,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      style: { backdropFilter: { blurRadius: 12 } },
    } } } }
    const renderer = new QuaSceneRendererController({ host, pipeline: new Pipeline(), initialView: view, plugins: [createQuiSceneRendererPlugin({ surfaceKeys: ['test'] })] })
    await renderer.start()
    await flush()
    await vi.waitFor(() => expect(capture).toHaveBeenCalledWith({ x: 0, y: 0, width, height: width * 9 / 16 }))
    expect([...host.nodesById.values()].find(node => node.kind === 'backdrop-image')?.spriteOptions?.filter?.blur).toBe(12)
    const resource = (await capture.mock.results[0].value).resource
    await renderer.destroy()
    expect(host.resourcesById.has(resource.id)).toBe(false)
  })

  it('fades character presence using existing nodes and removes completed exits', async () => {
    const host = createFakeCocosHost()
    let time = 0
    let sequence = 0
    const frames = new Map<number, (time: number) => void>()
    host.runtime.now = () => time
    host.scheduler.requestFrame = (callback) => {
      frames.set(++sequence, callback)
      return sequence
    }
    host.scheduler.cancelFrame = (handle) => {
      frames.delete(handle)
    }
    const advance = async (next: number) => {
      time = next
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(time))
      await flush()
    }
    const view = emptySceneView()
    view.characters = [{ id: 'speaker', visible: true }]
    const renderer = new QuaSceneRendererController({ host, pipeline: new Pipeline(), initialView: view, plugins: [createCharacterSceneRendererPlugin()] })
    await renderer.start()
    await flush()
    const character = [...host.nodesById.values()].find(node => node.kind === 'character')!
    await advance(110)
    expect([...host.nodesById.values()].find(node => node.kind === 'character')).toBe(character)
    expect(character.transform.opacity).toBeCloseTo(0.5)
    await advance(220)
    expect(character.transform.opacity).toBe(1)
    renderer.setView({ ...view, characters: [] })
    await flush()
    await advance(500)
    expect([...host.nodesById.values()].filter(node => node.kind === 'character')).toHaveLength(0)
    await renderer.destroy()
    expect(frames.size).toBe(0)
  })

  it('retains character nodes when dialogue and choices change', async () => {
    const host = createFakeCocosHost()
    const view = emptySceneView()
    view.characters = [{ id: 'speaker', visible: true, position: { x: 960, y: 600 } }]
    const renderer = new QuaSceneRendererController({ host, pipeline: new Pipeline(), initialView: view, plugins: [createCharacterSceneRendererPlugin({ transitions: false })] })
    await renderer.start()
    await flush()
    const character = [...host.nodesById.values()].find(node => node.kind === 'character')
    renderer.setView({ ...view, dialogue: { ...view.dialogue, text: 'Next sentence' }, choices: [{ id: 'next', text: 'Continue' }] })
    await flush()
    expect([...host.nodesById.values()].find(node => node.kind === 'character')).toBe(character)
    await renderer.destroy()
  })

  it('opens a select without changing settings and commits the clicked option once', async () => {
    const { host, pipeline, renderer, click } = await fixture()
    const selected = vi.fn()
    const advance = vi.fn()
    pipeline.on('test/select', selected)
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, advance)
    await click(150, 130)
    expect(selected).not.toHaveBeenCalled()
    expect([...host.nodesById.values()].filter(node => node.kind === 'select-option')).toHaveLength(3)
    await click(150, 245)
    expect(selected).toHaveBeenCalledTimes(1)
    expect(selected.mock.calls[0]?.[0].event.payload.value).toBe(60)
    expect(advance).not.toHaveBeenCalled()
    expect([...host.nodesById.values()].filter(node => node.kind === 'select-option')).toHaveLength(0)
    await renderer.destroy()
  })

  it('routes popup keyboard navigation locally and cancels without closing the parent', async () => {
    const { host, pipeline, renderer, click } = await fixture()
    const selected = vi.fn()
    const command = vi.fn()
    pipeline.on('test/select', selected)
    pipeline.on(RenderToLogicEvents.USER_INPUT_COMMAND, command)
    await click(150, 130)
    await host.emitInput({ kind: 'keyboard', phase: 'down', code: 'Escape' })
    expect(command).not.toHaveBeenCalled()
    expect(selected).not.toHaveBeenCalled()
    await click(150, 130)
    await host.emitInput({ kind: 'keyboard', phase: 'down', code: 'ArrowDown' })
    await host.emitInput({ kind: 'keyboard', phase: 'down', code: 'Enter' })
    expect(selected.mock.calls[0]?.[0].event.payload.value).toBe(60)
    expect(command).not.toHaveBeenCalled()
    await renderer.destroy()
  })

  it('clears hover outside the logical stage and avoids repainting unchanged motion', async () => {
    const { host, renderer } = await fixture()
    const paint = vi.spyOn(host.nodes, 'setNodeBoxStyle')
    await host.emitInput({ kind: 'pointer', phase: 'move', x: 150, y: 130 })
    const calls = paint.mock.calls.length
    await host.emitInput({ kind: 'pointer', phase: 'move', x: 160, y: 130 })
    expect(paint).toHaveBeenCalledTimes(calls)
    await host.emitInput({ kind: 'pointer', phase: 'move', x: -10, y: 130 })
    expect(paint.mock.calls.at(-1)?.[1].backgroundColor).toBe('#fffdf7')
    await renderer.destroy()
  })

  it('forwards frame limits from the engine projection only when they change', async () => {
    const host = createFakeCocosHost()
    const setFrameRate = vi.fn()
    host.runtime.setTargetFrameRate = setFrameRate
    const view = emptySceneView()
    view.renderer = { targetFrameRate: 30 }
    const renderer = new QuaSceneRendererController({ host, pipeline: new Pipeline(), initialView: view })
    await renderer.start()
    renderer.refresh()
    expect(setFrameRate).toHaveBeenCalledTimes(1)
    renderer.setView({ ...view, renderer: { ...view.renderer, targetFrameRate: 120 } })
    expect(setFrameRate.mock.calls.map(call => call[0])).toEqual([30, 120])
    await renderer.destroy()
  })

  it('applies choice hover styling and clears it when a higher overlay intercepts the pointer', async () => {
    const host = createFakeCocosHost()
    const renderer = new QuaSceneRendererController({ host, pipeline: new Pipeline(), plugins: [createChoicesSceneRendererPlugin({ render: async (scene) => {
      const button = host.nodes.createNode('button', { parent: scene.getLayerNode('choices') })
      host.nodes.setNodeTransform(button, { x: 100, y: 100, width: 300, height: 60 })
      host.nodes.setNodeMetadata?.(button, { choiceId: 'test', choiceStyles: { normal: { backgroundColor: '#fffdf7' }, hover: { backgroundColor: '#e3ebe2' } } })
    } })] })
    await renderer.start()
    await flush()
    const paint = vi.spyOn(host.nodes, 'setNodeBoxStyle')
    await host.emitInput({ kind: 'pointer', phase: 'move', x: 150, y: 130 })
    expect(paint.mock.calls.at(-1)?.[1].backgroundColor).toBe('#e3ebe2')
    const overlay = host.nodes.createNode('overlay', { parent: host.root.children[0] })
    host.nodes.setNodeTransform(overlay, { width: 1920, height: 1080, zIndex: 999999 })
    host.nodes.setNodeMetadata?.(overlay, { elementId: 'modal' })
    await host.emitInput({ kind: 'pointer', phase: 'move', x: 150, y: 130 })
    expect(paint.mock.calls.at(-1)?.[1].backgroundColor).toBe('#fffdf7')
    await renderer.destroy()
  })
})
