import type { QuaViewProjection } from '@quajs/render-core'
import type { QuaWebDomRendererHost } from '@quajs/renderer-web'
import type { Root } from 'react-dom/client'
import { Pipeline } from '@quajs/pipeline'
import { SETTINGS_PLUGIN_ID } from '@quajs/plugin-settings/contracts'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  DEFAULT_UI_OVERLAY_Z_INDEXES,
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

  it('projects official overlay roots through the shared Web overlay plane', async () => {
    const pipeline = new Pipeline()
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
          ui: {
            visible: true,
            overlays: {
              settings: { open: true },
            },
          },
          plugins: {
            [SETTINGS_PLUGIN_ID]: settingsProjection(),
          },
        }),
      }))
      await flushReact()
    })

    const settingsLayer = host.querySelector<HTMLElement>('.qua-settings-layer')!
    expect(host.querySelector('.qua-stage-overlay .qua-settings-layer')).not.toBeNull()
    expect(settingsLayer.dataset.overlayStack).toBe('overlay')
    expect(settingsLayer.dataset.overlayZIndex).toBe(String(DEFAULT_UI_OVERLAY_Z_INDEXES.settings))
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
      '@quajs/renderer-react/fonts',
      '@quajs/renderer-react/background',
      '@quajs/renderer-react/sprite',
      '@quajs/renderer-react/character',
      '@quajs/renderer-react/effects',
      '@quajs/renderer-react/dialogue',
      '@quajs/renderer-react/choices',
      '@quajs/renderer-react/audio',
      '@quajs/renderer-react/scene',
      '@quajs/renderer-react/ui',
      '@quajs/renderer-react/settings',
      '@quajs/renderer-react/backlog',
      '@quajs/renderer-react/gallery',
      '@quajs/renderer-react/achievement',
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

function settingsProjection() {
  return {
    revision: 1,
    profileId: 'default',
    updatedAt: 1,
    scopes: {
      player: {
        title: 'Player',
        schema: {
          type: 'object',
          properties: {
            muted: { type: 'boolean', title: 'Muted' },
          },
        },
        defaults: { muted: false },
        values: { muted: false },
        errors: [],
      },
    },
  }
}
