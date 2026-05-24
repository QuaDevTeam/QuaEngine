import type { QuaViewProjection } from '@quajs/render-core'
import type { QuaWebDomRendererHost } from '@quajs/renderer-web'
import type { Root } from 'react-dom/client'
import { Pipeline } from '@quajs/pipeline'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  emitLogicToRender,
  LogicToRenderEvents,
  onRenderToLogic,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  QuaRenderer,
  useQuaRenderer,
  useRendererActions,
} from '../src'
import { createVisualNovelRendererPlugins } from '../src/plugins/preset'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('@quajs/renderer-react', () => {
  let roots: Root[] = []

  afterEach(async () => {
    for (const root of roots) {
      await act(async () => root.unmount())
    }
    roots = []
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('mounts the shared Web DOM renderer and projects pipeline updates', async () => {
    const pipeline = new Pipeline()
    const lifecycle: string[] = []
    const selected: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_READY, () => lifecycle.push('ready'))
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_DESTROYED, () => lifecycle.push('destroyed'))
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, payload => selected.push(payload.choiceId))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)

    await act(async () => {
      root.render(createElement(QuaRenderer, {
        pipeline,
        plugins: createVisualNovelRendererPlugins(),
        initialView: view({
          background: { mode: 'image', assetName: 'bg.png' },
          dialogue: { visible: true, text: 'Initial' },
          choices: [{ id: 'yes', text: 'Yes', enabled: true }],
        }),
      }))
      await flushReact()
    })

    expect(lifecycle).toContain('ready')
    expect(host.querySelector('.qua-stage-scene-content .qua-background')).not.toBeNull()
    expect(host.querySelector('.qua-stage-safe .qua-dialogue-text')?.textContent).toBe('Initial')
    expect(host.querySelector('.qua-stage-safe .qua-choice-button')?.textContent).toBe('Yes')

    await act(async () => {
      await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
        view: view({
          dialogue: { visible: true, text: 'Updated' },
          choices: [{ id: 'yes', text: 'Yes', enabled: true }],
        }),
      })
      await flushReact()
    })

    expect(host.querySelector('.qua-dialogue-text')?.textContent).toBe('Updated')

    host.querySelector<HTMLButtonElement>('.qua-choice-button')!.click()
    await flushReact()

    expect(selected).toEqual(['yes'])

    await act(async () => root.unmount())
    roots = []
    await flushReact()

    expect(lifecycle).toContain('destroyed')
  })

  it('provides readonly projection snapshots and intent actions to React children', async () => {
    const pipeline = new Pipeline()
    const advances: Array<{ source?: string }> = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => advances.push(payload))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))

    const Probe = () => {
      const renderer = useQuaRenderer()
      const actions = useRendererActions()
      expect((actions as any)?.setDialogue).toBeUndefined()
      return createElement('button', {
        className: 'react-probe',
        type: 'button',
        onClick: () => actions?.advance('react-probe'),
      }, renderer.view?.dialogue.text || '')
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)

    await act(async () => {
      root.render(createElement(QuaRenderer, {
        pipeline,
        initialView: view({ dialogue: { visible: true, text: 'Projected' } }),
      }, createElement(Probe)))
      await flushReact()
    })

    expect(host.querySelector('.qua-stage-safe .react-probe')).not.toBeNull()
    expect(host.querySelector('.react-probe')?.textContent).toBe('Projected')
    host.querySelector<HTMLButtonElement>('.react-probe')!.click()
    await flushReact()

    expect(advances).toEqual([{ source: 'react-probe' }])
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

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)

    await act(async () => {
      root.render(createElement(QuaRenderer, {
        pipeline,
        initialView: view(),
        onHost: firstOnHost,
      }))
      await flushReact()
    })

    await act(async () => {
      root.render(createElement(QuaRenderer, {
        pipeline,
        initialView: view(),
        onHost: secondOnHost,
      }))
      await flushReact()
    })

    await act(async () => root.unmount())
    roots = []
    await flushReact()

    expect(calls).toEqual([
      'first:set',
      'first:unset',
      'second:set',
      'second:unset',
    ])
  })
})

async function flushReact(): Promise<void> {
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
