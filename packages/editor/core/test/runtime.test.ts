import type { GameStep } from '@quajs/engine'
import type { EditorPreviewRuntimeOptions } from '../src/preview/runtime.js'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { QuaEngine, RenderToLogicEvents } from '@quajs/engine'
import { afterEach, expect, it } from 'vitest'
import { createEditorPreviewRuntime } from '../src/preview/runtime.js'

let engine: QuaEngine | undefined
let runtime: Awaited<ReturnType<typeof createEditorPreviewRuntime>> | undefined
afterEach(async () => {
  runtime?.dispose()
  await engine?.destroy()
  QuaEngine.resetInstance()
})
async function setup(getResources?: EditorPreviewRuntimeOptions['getResources']) {
  engine = new QuaEngine({ assets: { adapter: createMemoryAssetsAdapter() } })
  await engine.init()
  const say = (id: string, action?: () => Promise<void>): GameStep => ({
    uuid: id,
    async run(ctx) {
      await action?.()
      await ctx.engine.showDialogue({ text: id })
      await ctx.engine.waitFor(RenderToLogicEvents.USER_ADVANCE)
    },
  })
  let factoryCalls = 0
  runtime = await createEditorPreviewRuntime(engine, {
    getResources,
    baselinePoint: { sceneId: 'preview', stepId: 'baseline' },
    resolveFile(path) {
      if (path !== 'story.qs' && path !== 'choice.qs')
        throw new Error('unknown source')
      return () => {
        factoryCalls++
        expect(engine!.getViewState().background).toBeUndefined()
        if (path === 'choice.qs') {
          return [
            say('intro'),
            { uuid: 'decision', async run(ctx) {
              await ctx.engine.showChoices([{ id: 'left', text: 'Left' }])
              await ctx.engine.waitFor(RenderToLogicEvents.USER_CHOICE_SELECT)
            } },
            say('after-choice'),
          ]
        }
        return [say('first', () => engine!.setBackgroundProjection({ mode: 'image', assetName: 'room.png' })), say('second'), say('third')]
      }
    },
  })
  return { engine, runtime, factoryCalls: () => factoryCalls }
}
it('reads injected renderer allocations and rejects details after the renderer releases them', async () => {
  let resources = [{ key: 'image-key', name: 'room.png', type: 'images', targetPackageIds: ['scene-qpk'], refs: 1, estimatedBytes: 12000 }]
  const { runtime } = await setup(() => resources)
  const read = (action: 'catalog' | 'page' | 'detail') => runtime.request({ action: 'storage', request: { action, ...(action !== 'catalog' ? { source: 'renderer:resources', key: 'image-key' } : {}) } })
  expect((await read('catalog'))?.storage?.sources?.some(source => source.id === 'renderer:resources')).toBe(true)
  expect((await read('page'))?.storage?.rows).toEqual([{ key: 'image-key', cells: ['images/room.png', '12000', '1'], resident: true }])
  expect(JSON.parse((await read('detail'))!.storage!.detail!.text).targetPackageIds).toEqual(['scene-qpk'])
  resources = []
  expect((await read('page'))?.storage?.rows).toEqual([])
  await expect(read('detail')).rejects.toThrow('资源已释放')
})
it('inspects the actual storage backend without advancing or restoring story state', async () => {
  const { engine, runtime } = await setup()
  await runtime.request({ action: 'seek', path: 'story.qs', stepIndex: 0 })
  const point = engine.getStoryPoint()
  const catalog = await runtime.request({ action: 'storage', request: { action: 'catalog' } })
  expect(catalog?.storage?.sources?.[0].description).toContain('内存')
  const page = await runtime.request({ action: 'storage', request: { action: 'page', source: 'engine:snapshots' } })
  const key = page?.storage?.rows?.[0].key
  expect(key).toBeTruthy()
  const value = await runtime.request({ action: 'storage', request: { action: 'detail', source: 'engine:snapshots', key } })
  expect(JSON.parse(value!.storage!.detail!.text)).toHaveProperty('id', key)
  expect(engine.getStoryPoint()).toEqual(point)
  expect(engine.getViewState().dialogue?.text).toBe('first')
  await expect(runtime.request({ action: 'storage', request: { action: 'page', source: '../secrets' } })).rejects.toThrow('未知')
})
it('restores engine state before setup, seeks and steps without leaving autonomous playback running', async () => {
  const { engine, runtime, factoryCalls } = await setup()
  expect(await runtime.request({ action: 'seek', path: 'story.qs', stepIndex: 1 })).toMatchObject({ stepIndex: 1 })
  expect(engine.getViewState().dialogue?.text).toBe('second')
  expect(engine.getViewState().background?.assetName).toBe('room.png')
  await new Promise(resolve => setTimeout(resolve, 60))
  expect(engine.getStoryPoint()?.stepId).toBe('second')
  expect(await runtime.request({ action: 'step' })).toMatchObject({ stepIndex: 2 })
  expect(await runtime.request({ action: 'seek', path: 'story.qs', stepIndex: 0 })).toMatchObject({ stepIndex: 0 })
  expect(factoryCalls()).toBe(2)
  await expect(runtime.request({ action: 'seek', path: '../unknown.qs', stepIndex: 0 })).rejects.toThrow('unknown source')
  expect(engine.getStoryPoint()?.stepId).toBe('first')
})
it('stops at choices rather than inventing a branch, rejects stale use and parallel seek', async () => {
  const { engine, runtime } = await setup()
  const seeking = runtime.request({ action: 'seek', path: 'choice.qs', stepIndex: 2 })
  await expect(runtime.request({ action: 'step' })).rejects.toThrow('正在执行')
  expect(await seeking).toMatchObject({ stepIndex: 1 })
  expect(engine.getViewState().choices.length).toBe(1)
  expect(await runtime.request({ action: 'step' })).toMatchObject({ stepIndex: 1, message: '请先在预览中选择分支' })
  runtime.dispose()
  await expect(runtime.request({ action: 'step' })).rejects.toThrow('未响应')
})

it('samples an animation in the real scene, binds self, toggles dialogue and restores on exit', async () => {
  const { engine, runtime } = await setup()
  await runtime.request({ action: 'seek', path: 'story.qs', stepIndex: 0 })
  await engine.showCharacter({ id: 'hero', name: 'Hero', position: { x: 400, y: 600 } })
  const scene = await runtime.request({ action: 'animation-scene' })
  expect(scene?.animationScene).toEqual({ characters: [{ id: 'hero', name: 'Hero' }], self: 'hero' })
  const point = engine.getStoryPoint()
  const sample = { duration: 1000, time: 500, playbackRate: 1, hideDialogue: true, tracks: [{ target: 'self', property: 'position.x', keyframes: [{ at: 0, value: 200 }, { at: 1000, value: 800 }] }] }
  await runtime.request({ action: 'animation-sample', sample })
  expect(engine.getViewState().background?.assetName).toBe('room.png')
  expect(engine.getViewState().dialogue.visible).toBe(false)
  expect(engine.getViewState().animations).toContainEqual(expect.objectContaining({ id: 'editor:animation-preview', state: 'paused', pausedAt: 500, commit: 'none', resolvedTracks: [expect.objectContaining({ target: 'character:hero' })] }))
  expect(engine.getViewState().characters[0].position?.x).toBe(400)
  expect(engine.getStoryPoint()).toEqual(point)
  await runtime.request({ action: 'animation-sample', sample: { ...sample, hideDialogue: false } })
  expect(engine.getViewState().dialogue).toMatchObject({ visible: true, text: 'first' })
  await runtime.request({ action: 'animation-sample', sample })
  await runtime.request({ action: 'animation-release' })
  expect(engine.getViewState().animations).toHaveLength(0)
  expect(engine.getViewState().dialogue).toMatchObject({ visible: true, text: 'first' })
  await expect(runtime.request({ action: 'animation-sample', sample: { ...sample, self: 'missing' } })).rejects.toThrow('场景中没有')
  await expect(runtime.request({ action: 'animation-sample', sample: { ...sample, time: Number.NaN } })).rejects.toThrow('无效')
  await runtime.request({ action: 'animation-sample', sample })
  await runtime.request({ action: 'step' })
  expect(engine.getViewState().dialogue.text).toBe('second')
  expect(engine.getViewState().animations).toHaveLength(0)
})

it('never restores stale dialogue after a scene changes outside the animation editor', async () => {
  const { engine, runtime } = await setup()
  await runtime.request({ action: 'seek', path: 'story.qs', stepIndex: 0 })
  const sample = { duration: 1000, time: 0, playbackRate: 1, hideDialogue: true, tracks: [] }
  await runtime.request({ action: 'animation-sample', sample })
  await engine.getPipeline().emit(RenderToLogicEvents.USER_ADVANCE, { source: 'test' })
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(engine.getViewState().dialogue.text).toBe('second')
  await expect(runtime.request({ action: 'animation-sample', sample })).rejects.toThrow('剧情位置已变化')
  await runtime.request({ action: 'animation-release' })
  expect(engine.getViewState().dialogue.text).toBe('second')
})
