import type { QuaViewProjection } from '@quajs/render-core'
import type { QuaWebDomRendererHost } from '@quajs/renderer-web/framework-host'
import { Pipeline } from '@quajs/pipeline'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  emitLogicToRender,
  LogicToRenderEvents,
  onRenderToLogic,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createQuaRendererStore,
  quaRenderer,
} from '../src'
import { createVisualNovelRendererPlugins } from '../src/plugins/preset'

describe('@quajs/renderer-svelte', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('mounts the shared Web DOM renderer through the Svelte action', async () => {
    const pipeline = new Pipeline()
    const lifecycle: string[] = []
    const selected: string[] = []
    let host: QuaWebDomRendererHost | undefined
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_READY, () => lifecycle.push('ready'))
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_DESTROYED, () => lifecycle.push('destroyed'))
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, payload => selected.push(payload.choiceId))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))

    const root = document.createElement('div')
    document.body.append(root)
    const action = quaRenderer(root, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        background: { mode: 'image', assetName: 'bg.png' },
        dialogue: { visible: true, text: 'Initial' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      }),
      onHost: nextHost => host = nextHost,
    })

    await flushDom()

    expect(host).toBeDefined()
    expect(lifecycle).toContain('ready')
    expect(root.querySelector('.qua-stage-scene-content .qua-background')).not.toBeNull()
    expect(root.querySelector('.qua-stage-safe .qua-dialogue-text')?.textContent).toBe('Initial')
    expect(root.querySelector('.qua-stage-safe .qua-choice-button')?.textContent).toBe('Yes')

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: view({
        dialogue: { visible: true, text: 'Updated' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      }),
    })
    await flushDom()

    expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('Updated')

    root.querySelector<HTMLButtonElement>('.qua-choice-button')!.click()
    await flushDom()

    expect(selected).toEqual(['yes'])

    action.destroy?.()
    await flushDom()

    expect(lifecycle).toContain('destroyed')
  })

  it('exposes renderer snapshots through a Svelte readable store', async () => {
    const pipeline = new Pipeline()
    let host: QuaWebDomRendererHost | undefined
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))

    const root = document.createElement('div')
    document.body.append(root)
    const action = quaRenderer(root, {
      pipeline,
      initialView: view({ dialogue: { visible: true, text: 'Initial' } }),
      onHost: nextHost => host = nextHost,
    })
    await flushDom()

    const snapshots: string[] = []
    const unsubscribe = createQuaRendererStore(host!).subscribe(snapshot => snapshots.push(snapshot?.view.dialogue.text || ''))

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: view({ dialogue: { visible: true, text: 'From store' } }),
    })
    await flushDom()

    expect(snapshots).toContain('Initial')
    expect(snapshots).toContain('From store')

    unsubscribe()
    action.destroy?.()
  })

  it('updates onHost callbacks without leaking the previous handler', async () => {
    const pipeline = new Pipeline()
    const calls: string[] = []
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))

    const firstOnHost = (host: QuaWebDomRendererHost | undefined) => {
      calls.push(host ? 'first:set' : 'first:unset')
    }
    const secondOnHost = (host: QuaWebDomRendererHost | undefined) => {
      calls.push(host ? 'second:set' : 'second:unset')
    }

    const root = document.createElement('div')
    document.body.append(root)
    const action = quaRenderer(root, {
      pipeline,
      initialView: view(),
      onHost: firstOnHost,
    })
    await flushDom()

    action.update?.({
      pipeline,
      initialView: view(),
      onHost: secondOnHost,
    })
    await flushDom()

    action.destroy?.()
    await flushDom()

    expect(calls).toEqual([
      'first:set',
      'first:unset',
      'second:set',
      'second:unset',
    ])
  })

  it('exports DOM feature plugin subentries and composes the Vue-aligned preset order', async () => {
    const modules = await Promise.all([
      import('../src/plugins/achievement'),
      import('../src/plugins/audio'),
      import('../src/plugins/background'),
      import('../src/plugins/backlog'),
      import('../src/plugins/character'),
      import('../src/plugins/choices'),
      import('../src/plugins/dialogue'),
      import('../src/plugins/effects'),
      import('../src/plugins/fonts'),
      import('../src/plugins/gallery'),
      import('../src/plugins/scene'),
      import('../src/plugins/settings'),
      import('../src/plugins/sprite'),
      import('../src/plugins/ui'),
    ])

    for (const module of modules) {
      expect(Object.keys(module).some(key => /^create.*RendererPlugin$/.test(key))).toBe(true)
    }

    expect(createVisualNovelRendererPlugins({ input: false }).map(plugin => plugin.name)).toEqual([
      '@quajs/renderer-svelte/fonts',
      '@quajs/renderer-svelte/background',
      '@quajs/renderer-svelte/sprite',
      '@quajs/renderer-svelte/character',
      '@quajs/renderer-svelte/effects',
      '@quajs/renderer-svelte/dialogue',
      '@quajs/renderer-svelte/choices',
      '@quajs/renderer-svelte/audio',
      '@quajs/renderer-svelte/scene',
      '@quajs/renderer-svelte/ui',
      '@quajs/renderer-svelte/settings',
      '@quajs/renderer-svelte/backlog',
      '@quajs/renderer-svelte/gallery',
      '@quajs/renderer-svelte/achievement',
    ])
  })
})

async function flushDom(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Promise.resolve()
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function view(overrides: Partial<QuaViewProjection> = {}): QuaViewProjection {
  return {
    layout: createViewLayoutProjection(),
    characters: [],
    dialogue: { visible: false, text: '' },
    choices: [],
    ui: { visible: true },
    flowControl: createFlowControlProjection(),
    effects: [],
    animations: [],
    plugins: {},
    ...overrides,
  }
}
