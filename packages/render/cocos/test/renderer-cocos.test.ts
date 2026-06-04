import type { AssetData } from '@quajs/assets'
import type { QuaViewProjection } from '@quajs/render-core'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { Pipeline } from '@quajs/pipeline'
import { createFlowControlProjection, createViewLayoutProjection, LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'
import { describe, expect, it } from 'vitest'
import { QuaCocosRendererController } from '../src'
import { createVisualNovelCocosRendererPlugins } from '../src/plugins/preset'
import { createSavePreviewCocosRendererPlugin } from '../src/plugins/save-preview'

describe('@quajs/renderer-cocos', () => {
  it('resolves stage layout and cleans transient nodes on destroy', async () => {
    const host = createFakeCocosHost({ containerSize: { width: 1280, height: 720 } })
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    expect(renderer.getSnapshot().stageLayout.logicalHeight).toBe(1080)
    expect(host.root.children[0]?.name).toBe('qua-stage')
    expect(host.root.children[0]?.children[0]?.name).toBe('qua-scene')
    expect(host.root.children[0]?.children[0]?.children[0]?.name).toBe('qua-camera')

    await renderer.destroy()
    expect(host.root.children).toHaveLength(0)
  })

  it('emits logical pointer clicks and choice intents through pipeline', async () => {
    const host = createFakeCocosHost({ containerSize: { width: 1920, height: 1080 } })
    const pipeline = new Pipeline()
    const clicks: unknown[] = []
    const choices: unknown[] = []
    const advances: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CLICK, context => clicks.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => choices.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins(),
    })
    await renderer.start()

    await host.emitInput({ kind: 'pointer', phase: 'down', x: 960, y: 540 })
    await host.emitInput({ kind: 'pointer', phase: 'down', x: 960, y: 540, metadata: { choiceId: 'a' } })
    const choiceNode = [...host.nodesById.values()].find(node => node.metadata.choiceId === 'a')
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: choiceNode! })
    await host.emitInput({ kind: 'pointer', phase: 'down', x: choiceNode!.transform.x! + 1, y: choiceNode!.transform.y! + 1 })

    expect(clicks[0]).toMatchObject({ x: 960, y: 540 })
    expect(choices[0]).toEqual({ choiceId: 'a' })
    expect(choices[1]).toEqual({ choiceId: 'a' })
    expect(choices[2]).toEqual({ choiceId: 'a' })
    expect(advances).toEqual([{ source: 'cocos:pointer' }])
  })

  it('does not advance pointer input captured by UI overlays', async () => {
    const host = createFakeCocosHost({ containerSize: { width: 1920, height: 1080 } })
    const pipeline = new Pipeline()
    const clicks: unknown[] = []
    const advances: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CLICK, context => clicks.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({ uiOverlay: { visible: true } }),
      plugins: createVisualNovelCocosRendererPlugins(),
    })
    await renderer.start()

    const overlayNode = [...host.nodesById.values()].find(node => node.metadata.elementId === 'menu')
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: overlayNode! })

    expect(clicks).toHaveLength(1)
    expect(advances).toEqual([])
  })

  it('updates projection layers from view updates', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, { view: createView({ dialogueText: 'next' }) })

    const dialogueLayer = [...host.nodesById.values()].find(node => node.name === 'qua-dialogue')
    expect(dialogueLayer?.children[0]?.text).toContain('next')
  })

  it('captures save previews through host capture only', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const results: unknown[] = []
    pipeline.on(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, context => results.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    await pipeline.emit(LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'request',
      saveOpId: 'save',
      slotId: 'slot',
      reason: 'save',
      transaction: 'sync',
      policy: { format: 'image/png' },
    })

    expect(results[0]).toMatchObject({ requestId: 'request', mimeType: 'image/png' })
  })

  it('reuses audio handles and disposes inactive audio resources', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({ audioAsset: 'bgm.ogg' }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const first = host.audioHandlesById.get('bgm:main')
    expect(first?.playing).toBe(true)
    expect(host.resourcesById.size).toBe(1)

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, { view: createView({ audioAsset: 'bgm.ogg' }) })
    await flushAsync()
    expect(host.audioHandlesById.get('bgm:main')).toBe(first)
    expect(host.resourcesById.size).toBe(1)

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, { view: createView() })
    await flushAsync()
    expect(first?.disposed).toBe(true)
    expect(host.resourcesById.size).toBe(0)
  })

  it('projects animation targets from feature plugins into transient Cocos nodes', async () => {
    const host = createFakeCocosHost({ now: () => 500 })
    const pipeline = new Pipeline()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({
        audioAsset: 'bgm.ogg',
        uiOverlay: { visible: true },
        effects: [{ id: 'flash', type: 'flash', options: {} }],
        plugins: {
          stage: { x: 4 },
          camera: { x: 20, y: 8 },
          dialogue: { y: 12 },
          choices: {
            x: 3,
            choices: {
              a: { x: 7 },
            },
          },
        },
        animations: [{
          id: 'motion',
          state: 'running',
          startedAt: 0,
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [
            { target: 'stage:main', property: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 24 }] },
            { target: 'camera:main', property: 'y', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 12 }] },
            { target: 'dialogue:box', property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }] },
            { target: 'choices:panel', property: 'y', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 10 }] },
            { target: 'choice:a', property: 'opacity', keyframes: [{ at: 0, value: 0.2 }, { at: 1000, value: 1 }] },
            { target: 'ui:menu', property: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 30 }] },
            { target: 'effect:flash', property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }] },
            { target: 'audioBus:master', property: 'gainDb', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: -6 }] },
            { target: 'audioTrack:main', property: 'gainDb', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: -12 }] },
          ],
        }],
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect([...host.nodesById.values()].find(node => node.name === 'qua-scene')?.transform.x).toBe(12)
    expect([...host.nodesById.values()].find(node => node.name === 'qua-camera')?.transform.y).toBe(-6)
    expect([...host.nodesById.values()].find(node => node.name === 'qua-dialogue')?.children[0]?.transform.opacity).toBe(0.5)
    expect([...host.nodesById.values()].find(node => node.name === 'qua-choices')?.transform.y).toBe(5)
    expect([...host.nodesById.values()].find(node => node.metadata.choiceId === 'a')?.transform.opacity).toBeCloseTo(0.6, 6)
    expect([...host.nodesById.values()].find(node => node.name === 'menu')?.transform.x).toBe(15)
    expect([...host.nodesById.values()].find(node => node.name === 'flash')?.transform.opacity).toBe(0.5)
    expect(host.audioBusVolumes.get('master')).toBeCloseTo(10 ** (-3 / 20), 6)
    expect(host.audioHandlesById.get('bgm:main')?.volume).toBeCloseTo(10 ** (-6 / 20), 6)
  })

  it('projects optional feature plugins and emits plugin intents', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const events: unknown[] = []
    pipeline.on('gallery/select_entry_request', context => events.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        gallery: {
          revision: 1,
          sceneActive: true,
          profileId: 'default',
          catalogs: [],
          entries: [{ id: 'cg-1', title: 'CG 1', unlocked: true, contents: [], catalogId: 'main' }],
          filteredEntryIds: ['cg-1'],
          requiredRuntimePackages: [],
          filter: {},
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    const galleryEntry = [...host.nodesById.values()].find(node => node.metadata.galleryEntryId === 'cg-1')
    expect(galleryEntry?.text).toBe('CG 1')
    await host.emitInput({ kind: 'pointer', phase: 'down', x: 960, y: 540, targetNode: galleryEntry })
    expect(events[0]).toEqual({ entryId: 'cg-1' })
  })

  it('keeps preset plugin order stable', () => {
    expect(createVisualNovelCocosRendererPlugins({ input: false }).map(plugin => plugin.name)).toEqual([
      '@quajs/renderer-cocos/background',
      '@quajs/renderer-cocos/sprite',
      '@quajs/renderer-cocos/character',
      '@quajs/renderer-cocos/effects',
      '@quajs/renderer-cocos/fonts',
      '@quajs/renderer-cocos/dialogue',
      '@quajs/renderer-cocos/choices',
      '@quajs/renderer-cocos/audio',
      '@quajs/renderer-cocos/scene',
      '@quajs/renderer-cocos/ui',
      '@quajs/renderer-cocos/settings',
      '@quajs/renderer-cocos/backlog',
      '@quajs/renderer-cocos/gallery',
      '@quajs/renderer-cocos/achievement',
      '@quajs/renderer-cocos/save-preview',
    ])
  })

  it('exports save-preview as a standalone Cocos plugin entry', () => {
    expect(createSavePreviewCocosRendererPlugin().name).toBe('@quajs/renderer-cocos/save-preview')
  })

  it('does not mutate engine-owned view on destroy', async () => {
    const host = createFakeCocosHost()
    const view = createView()
    const frozen = structuredCloneJson(view)
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      initialView: view,
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await renderer.destroy()
    expect(structuredCloneJson(view)).toEqual(frozen)
  })
})

function createView(options: {
  dialogueText?: string
  audioAsset?: string
  gallery?: Record<string, unknown>
  plugins?: Record<string, unknown>
  animations?: QuaViewProjection['animations']
  uiOverlay?: Record<string, unknown>
  effects?: QuaViewProjection['effects']
} = {}): QuaViewProjection {
  return {
    layout: createViewLayoutProjection(),
    characters: [{
      id: 'hero',
      name: 'Hero',
      visible: true,
      position: { x: 960, y: 760, anchor: 'center' },
    }],
    dialogue: {
      visible: true,
      characterName: 'Hero',
      text: options.dialogueText || 'hello',
    },
    choices: [{
      id: 'a',
      text: 'A',
      enabled: true,
    }],
    ui: {
      visible: true,
      ...(options.uiOverlay
        ? {
            overlays: {
              menu: options.uiOverlay,
            },
          }
        : {}),
    },
    flowControl: createFlowControlProjection(),
    effects: options.effects || [],
    animations: options.animations || [],
    plugins: {
      ...(options.audioAsset
        ? {
            audio: {
              revision: 1,
              unlocked: true,
              buses: {
                master: {},
                bgm: {},
                voice: {},
                sfx: {},
                ambient: {},
              },
              bgm: {
                id: 'main',
                kind: 'bgm',
                assetKey: options.audioAsset,
                state: 'playing',
                loop: true,
              },
              voices: [],
              sfx: [],
              ambients: [],
            },
          }
        : {}),
      ...(options.gallery ? { gallery: options.gallery } : {}),
      ...(options.plugins || {}),
    },
  }
}

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createFakeAssets() {
  const asset: AssetData = {
    id: 'bundle:audio:bgm.ogg',
    type: 'audio',
    name: 'bgm.ogg',
    bundleName: 'bundle',
    locale: 'default',
    data: new Uint8Array([1, 2, 3]),
    size: 3,
    version: 1,
    mtime: 1,
    fromCache: true,
  }
  return {
    getAsset: async () => asset,
    on: () => {},
    off: () => {},
  } as never
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
