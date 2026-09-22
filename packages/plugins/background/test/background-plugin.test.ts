import type { EngineContext, QuaEngineInterface } from '@quajs/engine'
import { pauseAnimationWithEngine, resumeAnimationWithEngine, seekAnimationWithEngine, waitAnimationWithEngine } from '@quajs/plugin-animation'
import { createViewLayoutProjection, emitRenderToLogic, LogicToRenderEvents, onLogicToRender, projectBackground, RenderToLogicEvents, resolveBackgroundLayers } from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pipeline } from '../../../core/pipeline/src'
import {
  addBackgroundLayerWithEngine,
  backgroundDecoratorMappings,
  BackgroundPlugin,
  clearBackgroundLayersWithEngine,
  clearBackgroundWithEngine,
  clearRuntimePackageBackgroundWithEngine,
  defineBackgroundTransition,
  removeBackgroundLayerWithEngine,
  setBackgroundWithEngine,
  setLayeredBackgroundWithEngine,
  setVideoBackgroundWithEngine,
  transitionBackgroundLayerWithEngine,
  transitionBackgroundWithEngine,
  updateBackgroundLayerWithEngine,
} from '../src'
import { createBackgroundMotionTimeline, fadeZoom, kenBurns, playBackgroundMotionWithEngine } from '../src/animation'

describe('@quajs/plugin-background', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retains the base when positioning, replacing and clearing arbitrary image layers', async () => {
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'room.png', { metadata: { contentPackageId: 'room-pack' } })
    await addBackgroundLayerWithEngine(engine, { id: 'photo', assetName: 'photo.png', x: 370, y: 240, width: 420, height: 280, zIndex: 5, fit: 'contain', metadata: { contentPackageId: 'photo-pack' } })
    await addBackgroundLayerWithEngine(engine, { id: 'note', assetName: 'note.png', x: 800, y: 300, zIndex: 10 })
    const background = engine.getViewState().background!
    expect(resolveBackgroundLayers(background).map(layer => layer.assetName)).toEqual(['room.png', 'photo.png', 'note.png'])
    expect(background.layers?.[0]).toMatchObject({ x: 370, y: 240, width: 420, height: 280, fit: 'contain', metadata: { contentPackageId: 'photo-pack' } })
    await addBackgroundLayerWithEngine(engine, { id: 'photo', assetName: 'replacement.png', x: 400 })
    expect(engine.getViewState().background?.layers).toHaveLength(2)
    await removeBackgroundLayerWithEngine(engine, 'photo')
    expect(resolveBackgroundLayers(engine.getViewState().background!).map(layer => layer.assetName)).toEqual(['room.png', 'note.png'])
    await clearBackgroundLayersWithEngine(engine)
    expect(resolveBackgroundLayers(engine.getViewState().background!)).toMatchObject([{ assetName: 'room.png', metadata: { contentPackageId: 'room-pack' } }])
    await setVideoBackgroundWithEngine(engine, 'rain.mp4', { muted: false, loop: false, volume: 0.4, playbackRate: 0.8 })
    await addBackgroundLayerWithEngine(engine, { id: 'note', assetName: 'note.png' })
    expect(resolveBackgroundLayers(engine.getViewState().background!)[0]).toMatchObject({ assetType: 'video', video: { muted: false, loop: false, volume: 0.4, playbackRate: 0.8 } })
  })

  it('keeps the old picture visible until ready, then crossfades both layers by default', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'old.png')
    const pipeline = new Pipeline()
    engine.getPipeline = () => pipeline
    const dispose = onLogicToRender(pipeline, LogicToRenderEvents.BACKGROUND_PREPARE, () => {})
    const pending = setBackgroundWithEngine(engine, 'new.png')
    await vi.advanceTimersByTimeAsync(0)
    const prepared = engine.getViewState().background!
    expect(prepared.layers?.map(layer => layer.opacity)).toEqual([1, 0])
    expect(engine.getViewState().animations).toHaveLength(0)
    await emitRenderToLogic(pipeline, RenderToLogicEvents.BACKGROUND_READY, { id: 'stale' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(engine.getViewState().animations).toHaveLength(0)
    await emitRenderToLogic(pipeline, RenderToLogicEvents.BACKGROUND_READY, { id: prepared.preparationId! })
    await vi.advanceTimersByTimeAsync(150)
    const view = engine.getViewState()
    expect(projectBackground(view.background, view.animations, Date.now())?.layers?.map(layer => layer.opacity)).toEqual([0.5, 0.5])
    expect(prepared.layers?.map(layer => layer.opacity)).toEqual([1, 0])
    await vi.advanceTimersByTimeAsync(150)
    await pending
    expect(engine.getViewState().background?.assetName).toBe('new.png')
    expect(pipeline.getListenerCount(RenderToLogicEvents.BACKGROUND_READY)).toBe(0)
    dispose()
  })

  it('rolls back preparation failures and does not start an animation', async () => {
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'old.png')
    const pipeline = new Pipeline()
    engine.getPipeline = () => pipeline
    onLogicToRender(pipeline, LogicToRenderEvents.BACKGROUND_PREPARE, ({ id }) => emitRenderToLogic(pipeline, RenderToLogicEvents.BACKGROUND_READY, { id, error: 'decode failed' }))
    await expect(setBackgroundWithEngine(engine, 'broken.png')).rejects.toThrow('decode failed')
    expect(engine.getViewState().background?.assetName).toBe('old.png')
    expect(engine.getViewState().animations).toEqual([])
  })

  it('cancels pending preparation on clear and supersession without late resurrection', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'old.png')
    const pipeline = new Pipeline()
    engine.getPipeline = () => pipeline
    onLogicToRender(pipeline, LogicToRenderEvents.BACKGROUND_PREPARE, () => {})
    const first = setBackgroundWithEngine(engine, 'first.png')
    await vi.advanceTimersByTimeAsync(0)
    const staleId = engine.getViewState().background!.preparationId!
    const second = setBackgroundWithEngine(engine, 'second.png', { transition: { type: 'instant' } })
    await vi.advanceTimersByTimeAsync(0)
    const id = engine.getViewState().background!.preparationId!
    await emitRenderToLogic(pipeline, RenderToLogicEvents.BACKGROUND_READY, { id: staleId })
    expect(engine.getViewState().background?.preparationId).toBe(id)
    await emitRenderToLogic(pipeline, RenderToLogicEvents.BACKGROUND_READY, { id })
    await Promise.all([first, second])
    expect(engine.getViewState().background?.assetName).toBe('second.png')
    const cleared = setBackgroundWithEngine(engine, 'clear.png')
    await vi.advanceTimersByTimeAsync(0)
    await clearBackgroundWithEngine(engine)
    await cleared
    expect(engine.getViewState().background).toBeUndefined()
    expect(pipeline.getListenerCount(RenderToLogicEvents.BACKGROUND_READY)).toBe(0)
  })

  it('samples custom transforms and filters from reusable numeric keyframes', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'old.png')
    const transition = defineBackgroundTransition({ type: 'custom', duration: 400, incoming: { 'opacity': [{ offset: 0, value: 0 }, { offset: 1, value: 1 }], 'x': [{ offset: 0, value: 200 }, { offset: 1, value: 0 }], 'composition.filter.blur': [{ offset: 0, value: 8 }, { offset: 1, value: 0 }] }, outgoing: { scale: [{ offset: 0, value: 1 }, { offset: 1, value: 1.2 }] } })
    const pending = setBackgroundWithEngine(engine, 'new.png', { transition })
    await vi.advanceTimersByTimeAsync(200)
    const view = engine.getViewState()
    expect(projectBackground(view.background, view.animations, Date.now())?.layers?.[1]).toMatchObject({ x: 100, opacity: 0.5, composition: { filter: { blur: 4 } } })
    await vi.advanceTimersByTimeAsync(200)
    await pending
  })

  it('keeps an incoming transform-only transition visible at its authored opacity', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'old.png')
    const pending = setBackgroundWithEngine(engine, 'new.png', {
      opacity: 0.8,
      transition: { type: 'custom', duration: 400, incoming: { x: [{ offset: 0, value: 200 }, { offset: 1, value: 0 }] } },
    })
    await vi.advanceTimersByTimeAsync(200)
    const view = engine.getViewState()
    expect(projectBackground(view.background, view.animations, Date.now())?.layers?.[1]).toMatchObject({ x: 100, opacity: 0.8 })
    await vi.advanceTimersByTimeAsync(200)
    await pending
  })

  it('projects shader progress without mutating the definition or stored projection', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'old.png')
    const shader = { wgsl: 'fn transition(uv: vec2<f32>) -> vec4<f32> { return mix(sampleFrom(uv), sampleTo(uv), progress); }', glsl: 'vec4 transition(vec2 uv) { return mix(sampleFrom(uv), sampleTo(uv), progress); }', params: [1, 2, 3, 4] as [number, number, number, number] }
    const pending = setBackgroundWithEngine(engine, 'new.png', { transition: { type: 'shader', duration: 200, shader } })
    await vi.advanceTimersByTimeAsync(100)
    const view = engine.getViewState()
    const projected = projectBackground(view.background, view.animations, Date.now())!
    expect(projected.shaderTransition?.progress).toBe(0.5)
    expect(view.background?.shaderTransition?.progress).toBe(0)
    shader.params[0] = 99
    expect(projected.shaderTransition?.shader.params?.[0]).toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    await pending
    expect(engine.getViewState().background?.shaderTransition).toBeUndefined()
    const settled = engine.getViewState()
    expect(projectBackground(settled.background, settled.animations, Date.now())?.shaderTransition).toBeUndefined()
    expect(projectBackground(settled.background, settled.animations, Date.now() + 1000)?.assetName).toBe('new.png')
  })

  it('settles saved transitions on restore and prevents same-tick replacement races', async () => {
    const engine = createEngine()
    await Promise.all([setBackgroundWithEngine(engine, 'discard.png'), setBackgroundWithEngine(engine, 'latest.png')])
    expect(engine.getViewState().background?.assetName).toBe('latest.png')
    await engine.setBackgroundProjection({ mode: 'layered', preparationId: 'saved', layers: [], transitionTarget: { mode: 'image', assetName: 'saved-destination.png' } })
    const plugin = new BackgroundPlugin()
    await plugin.onAfterJump({ engine } as EngineContext)
    expect(engine.getViewState().background?.assetName).toBe('saved-destination.png')
    expect(engine.getViewState().background?.preparationId).toBeUndefined()
    expect(engine.getViewState().background?.transitionTarget).toBeUndefined()
  })

  it('registers APIs and QuaScript decorators', () => {
    const plugin = new BackgroundPlugin()
    const registration = plugin.registerAPIs()

    expect(registration.pluginName).toBe('@quajs/plugin-background')
    expect(registration.apis.map(api => api.name)).toEqual(expect.arrayContaining([
      'setBackground',
      'setVideoBackground',
      'setLayeredBackground',
      'addLayer',
      'transitionBackground',
      'transitionLayer',
    ]))
    expect(registration.decorators).toEqual(backgroundDecoratorMappings)
  })

  it('writes image and clear intents through engine projection API', async () => {
    const engine = createEngine()

    await setBackgroundWithEngine(engine, 'classroom.png', {
      fit: 'cover',
      origin: 'center center',
      composition: { filter: { brightness: 1.1 } },
    })
    expect(engine.setBackgroundProjection).toHaveBeenLastCalledWith({
      mode: 'image',
      assetName: 'classroom.png',
      fit: 'cover',
      origin: 'center center',
      transition: undefined,
      composition: { filter: { brightness: 1.1 } },
      video: undefined,
      layers: undefined,
      metadata: undefined,
    })

    await clearBackgroundWithEngine(engine)
    expect(engine.setBackgroundProjection).toHaveBeenLastCalledWith(undefined)
  })

  it('owns a detached lighting profile and clears it on a plain scene replacement', async () => {
    const engine = createEngine()
    const characterLighting = {
      ambient: [1, 0.95, 0.9] as [number, number, number],
      shade: { color: [0.9, 0.95, 1] as [number, number, number], from: [0, 0] as [number, number], to: [1, 1] as [number, number] },
    }
    await setBackgroundWithEngine(engine, 'laundry.webp', { characterLighting })
    characterLighting.ambient[0] = 0
    characterLighting.shade.to[0] = 0
    expect(engine.getViewState().background?.characterLighting?.ambient).toEqual([1, 0.95, 0.9])
    expect(engine.getViewState().background?.characterLighting?.shade?.to).toEqual([1, 1])
    await setBackgroundWithEngine(engine, 'day.webp')
    expect(engine.getViewState().background?.characterLighting).toBeUndefined()
  })

  it('writes video background projection state', async () => {
    const engine = createEngine()

    await setVideoBackgroundWithEngine(engine, 'rain.mp4', {
      loop: true,
      muted: false,
      volume: 0.8,
      playbackRate: 1.25,
      poster: 'rain.png',
      fit: 'cover',
    })

    expect(engine.getViewState().background).toEqual({
      mode: 'video',
      assetName: 'rain.mp4',
      fit: 'cover',
      transition: undefined,
      video: {
        assetName: 'rain.mp4',
        loop: true,
        muted: false,
        volume: 0.8,
        playbackRate: 1.25,
        poster: 'rain.png',
        transition: undefined,
        metadata: undefined,
      },
      layers: undefined,
      composition: undefined,
      metadata: undefined,
    })
  })

  it('replaces backgrounds through animation timelines when transition is requested', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'old-room.png')

    const pending = setBackgroundWithEngine(engine, 'new-room.png', {
      transition: { type: 'fade', duration: 120 },
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.setAnimationProjection).toHaveBeenCalledWith(expect.objectContaining({
      duration: 120,
      resolvedTracks: expect.arrayContaining([
        expect.objectContaining({
          target: expect.stringMatching(/^backgroundLayer:__qua_transition_old_\d+_main$/),
          property: 'opacity',
        }),
        expect.objectContaining({
          target: expect.stringMatching(/^backgroundLayer:__qua_transition_new_\d+_main$/),
          property: 'opacity',
        }),
      ]),
    }))
    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      mode: 'layered',
      layers: expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^__qua_transition_old_\d+_main$/), assetName: 'old-room.png' }),
        expect.objectContaining({ id: expect.stringMatching(/^__qua_transition_new_\d+_main$/), assetName: 'new-room.png', opacity: 0 }),
      ]),
    }))

    await vi.advanceTimersByTimeAsync(120)
    await pending

    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      mode: 'image',
      assetName: 'new-room.png',
      transition: undefined,
    }))
  })

  it('supports layered backgrounds and deterministic layer ordering', async () => {
    const engine = createEngine()

    await setLayeredBackgroundWithEngine(engine, [{
      id: 'sky',
      assetName: 'sky.png',
      fit: 'cover',
      origin: 'center center',
      zIndex: 10,
      composition: {
        blendMode: 'normal',
        filter: { brightness: 1 },
      },
    }])
    await addBackgroundLayerWithEngine(engine, {
      id: 'clouds',
      assetName: 'clouds.png',
      opacity: 0.7,
      zIndex: 5,
      composition: {
        blendMode: 'screen',
        filter: { blur: 2, brightness: 1.2 },
        mask: { assetName: 'clouds-mask.png' },
      },
    })
    await updateBackgroundLayerWithEngine(engine, 'clouds', {
      x: 20,
      y: 12,
      scale: 1.1,
      composition: {
        filter: { blur: 4 },
      },
    })

    expect(engine.getViewState().background).toEqual({
      mode: 'layered',
      layers: [
        expect.objectContaining({
          id: 'clouds',
          assetName: 'clouds.png',
          zIndex: 5,
          x: 20,
          y: 12,
          scale: 1.1,
          composition: {
            blendMode: 'screen',
            filter: { blur: 4, brightness: 1.2 },
            mask: { assetName: 'clouds-mask.png' },
          },
        }),
        expect.objectContaining({
          id: 'sky',
          assetName: 'sky.png',
          fit: 'cover',
          origin: 'center center',
          zIndex: 10,
          composition: {
            blendMode: 'normal',
            filter: { brightness: 1 },
          },
        }),
      ],
      video: undefined,
      transition: undefined,
      composition: undefined,
      metadata: undefined,
    })

    await removeBackgroundLayerWithEngine(engine, 'sky')
    expect(engine.getViewState().background?.layers).toEqual([
      expect.objectContaining({ id: 'clouds' }),
    ])

    await clearBackgroundLayersWithEngine(engine)
    expect(engine.getViewState().background?.layers).toEqual([])
  })

  it('removes runtime package background projections on package unload', async () => {
    const engine = createEngine()

    await setLayeredBackgroundWithEngine(engine, [
      {
        id: 'runtime-fog',
        assetName: 'runtime-fog.png',
        metadata: { contentPackageId: 'runtime.background' },
      },
      {
        id: 'base-sky',
        assetName: 'base-sky.png',
      },
    ])

    await clearRuntimePackageBackgroundWithEngine(engine, 'runtime.background')

    expect(engine.getViewState().background?.layers).toEqual([
      expect.objectContaining({ id: 'base-sky' }),
    ])

    await setLayeredBackgroundWithEngine(engine, [
      {
        id: 'base-sky',
        assetName: 'base-sky.png',
        metadata: { contentPackageId: 'base.background' },
      },
      {
        id: 'runtime-fog',
        assetName: 'runtime-fog.png',
        metadata: { contentPackageId: 'runtime.background' },
      },
    ], {
      metadata: {
        contentPackageId: 'base.background',
        requiredRuntimePackages: ['base.background', 'runtime.background'],
      },
    })

    await clearRuntimePackageBackgroundWithEngine(engine, 'runtime.background')

    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      metadata: {
        contentPackageId: 'base.background',
        requiredRuntimePackages: ['base.background'],
      },
      layers: [
        expect.objectContaining({ id: 'base-sky' }),
      ],
    }))

    await setBackgroundWithEngine(engine, 'runtime-room.png', {
      metadata: { contentPackageId: 'runtime.background' },
    })
    const plugin = new BackgroundPlugin()
    await plugin.onRuntimePackageUnload?.({
      engine,
      runtimePackage: {
        package: { id: 'runtime.background', version: '1.0.0' },
        bundleName: 'runtime.background',
      },
    } as any)

    expect(engine.getViewState().background).toBeUndefined()
  })

  it('removes background projections that require an unloaded runtime package', async () => {
    const engine = createEngine()

    await setLayeredBackgroundWithEngine(engine, [
      {
        id: 'dependent-fog',
        assetName: 'dependent-fog.png',
        metadata: {
          contentPackageId: 'base.background',
          requiredRuntimePackages: ['runtime.background-assets'],
        },
      },
      {
        id: 'base-sky',
        assetName: 'base-sky.png',
        metadata: { contentPackageId: 'base.background' },
      },
    ])

    await clearRuntimePackageBackgroundWithEngine(engine, 'runtime.background-assets')

    expect(engine.getViewState().background?.layers).toEqual([
      expect.objectContaining({ id: 'base-sky' }),
    ])

    await setBackgroundWithEngine(engine, 'dependent-room.png', {
      metadata: {
        contentPackageId: 'base.background',
        requiredRuntimePackages: ['runtime.background-assets'],
      },
    })
    await clearRuntimePackageBackgroundWithEngine(engine, 'runtime.background-assets')

    expect(engine.getViewState().background).toBeUndefined()
  })

  it('plays current background visibility transitions through animation', async () => {
    vi.useFakeTimers()
    const engine = createEngine()

    await setBackgroundWithEngine(engine, 'room.png')
    const pending = transitionBackgroundWithEngine(engine, { type: 'fade-out', duration: 240, easing: 'ease-out' })
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.setAnimationProjection).toHaveBeenCalledWith(expect.objectContaining({
      duration: 240,
      resolvedTracks: [
        expect.objectContaining({
          target: 'background:main',
          property: 'opacity',
        }),
      ],
    }))

    await vi.advanceTimersByTimeAsync(240)
    await pending

    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      mode: 'image',
      assetName: 'room.png',
      opacity: 0,
    }))
  })

  it('keeps destination lighting during crossfade and removes it for an unlit destination', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'day.webp')
    const characterLighting = { ambient: [0.8, 0.9, 1] as const }
    const pending = setBackgroundWithEngine(engine, 'night.webp', { characterLighting, transition: { type: 'crossfade', duration: 100 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.getViewState().background?.mode).toBe('layered')
    expect(engine.getViewState().background?.characterLighting).toEqual(characterLighting)
    await vi.advanceTimersByTimeAsync(100)
    await pending
    expect(engine.getViewState().background?.characterLighting).toEqual(characterLighting)
    const returnToDay = setBackgroundWithEngine(engine, 'day.webp', { transition: { type: 'crossfade', duration: 100 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.getViewState().background?.characterLighting).toBeUndefined()
    await vi.advanceTimersByTimeAsync(100)
    await returnToDay
    expect(engine.getViewState().background?.characterLighting).toBeUndefined()
  })

  it('keeps the retained base in the outgoing crossfade after image overlays', async () => {
    vi.useFakeTimers()
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'room.png')
    await addBackgroundLayerWithEngine(engine, { id: 'photo', assetName: 'photo.png', x: 100, y: 200 })
    const pending = setBackgroundWithEngine(engine, 'next.png', { transition: { type: 'crossfade', duration: 100 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.getViewState().background?.layers?.map(layer => layer.assetName)).toEqual(['room.png', 'photo.png', 'next.png'])
    await vi.advanceTimersByTimeAsync(100)
    await pending
    expect(engine.getViewState().background).toMatchObject({ mode: 'image', assetName: 'next.png' })
  })

  it('plays single layered background transitions through animation', async () => {
    vi.useFakeTimers()
    const engine = createEngine()

    await addBackgroundLayerWithEngine(engine, { id: 'fog', assetName: 'fog.png' })
    const pending = transitionBackgroundLayerWithEngine(engine, 'fog', { type: 'fade-out', duration: 180 })
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.setAnimationProjection).toHaveBeenCalledWith(expect.objectContaining({
      duration: 180,
      resolvedTracks: [
        expect.objectContaining({
          target: 'backgroundLayer:fog',
          property: 'opacity',
        }),
      ],
    }))

    await vi.advanceTimersByTimeAsync(180)
    await pending

    expect(engine.getViewState().background?.layers).toEqual([
      expect.objectContaining({ id: 'fog', opacity: 0 }),
    ])
  })

  it('animates placed images through pause, seek, resume and final engine state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const engine = createEngine()
    await setBackgroundWithEngine(engine, 'room.png')
    const from = { x: 100, y: 110, width: 420, height: 280, scale: 1, rotation: 0, opacity: 1 }
    const to = { x: 500, y: 250, width: 480, height: 320, scale: 0.8, rotation: -12, opacity: 0.6 }
    await addBackgroundLayerWithEngine(engine, { id: 'photo', assetName: 'photo.png', ...from, metadata: { contentPackageId: 'photo-pack' } })
    await addBackgroundLayerWithEngine(engine, { id: 'note', assetName: 'note.png', x: 1360 })
    const original = engine.getViewState().background!
    const playback = await playBackgroundMotionWithEngine(engine, createBackgroundMotionTimeline('backgroundLayer:photo', [
      { at: 0, ...from },
      { at: 1000, ...to },
    ], { duration: 1000 }))
    const sample = () => {
      const view = engine.getViewState()
      return projectBackground(view.background, view.animations, Date.now())!
    }

    await vi.advanceTimersByTimeAsync(250)
    expect(sample().layers?.[0]).toMatchObject({ x: 200, y: 145, width: 435, height: 290, scale: 0.95, rotation: -3, opacity: 0.9 })
    await pauseAnimationWithEngine(engine, playback.id)
    await vi.advanceTimersByTimeAsync(1500)
    expect(sample().layers?.[0]).toMatchObject({ x: 200, width: 435 })
    await seekAnimationWithEngine(engine, playback.id, 500)
    expect(sample().layers?.[0]).toMatchObject({ x: 300, y: 180, width: 450, height: 300, scale: 0.9, rotation: -6, opacity: 0.8 })
    expect(original.layers?.[0]).toMatchObject(from)
    expect(engine.getViewState().background).toBe(original)

    await resumeAnimationWithEngine(engine, playback.id)
    const finished = waitAnimationWithEngine(engine, playback.id)
    await vi.advanceTimersByTimeAsync(500)
    await finished
    expect(engine.getViewState().animations).toEqual([])
    expect(engine.getViewState().background?.layers?.[0]).toMatchObject({ ...to, metadata: { contentPackageId: 'photo-pack' } })
    expect(engine.getViewState().background?.layers?.[1]).toEqual(original.layers?.[1])
    expect(resolveBackgroundLayers(engine.getViewState().background!).map(layer => layer.assetName)).toEqual(['room.png', 'photo.png', 'note.png'])
    expect(original.layers?.[0]).toMatchObject(from)
  })

  it('creates background motion timelines through the animation sub-entry', () => {
    expect(createBackgroundMotionTimeline('backgroundLayer:fog', [
      { at: 0, x: 0, blur: 0 },
      { at: 1000, x: 40, blur: 6 },
    ], { duration: 1000 }).tracks).toEqual([
      expect.objectContaining({ target: 'backgroundLayer:fog', property: 'x' }),
      expect.objectContaining({ target: 'backgroundLayer:fog', property: 'composition.filter.blur' }),
    ])

    expect(kenBurns({ duration: 2000 }).tracks.map(track => track.property)).toEqual(['x', 'y', 'scale'])
    expect(fadeZoom({ opacityFrom: 0, opacityTo: 1 }).tracks.map(track => track.property)).toEqual(['scale', 'opacity'])
  })
})

function createEngine(): QuaEngineInterface {
  let background: ReturnType<QuaEngineInterface['getViewState']>['background']
  let animations: ReturnType<QuaEngineInterface['getViewState']>['animations'] = []
  const store = {}
  return {
    getStore: vi.fn(() => store),
    setBackgroundProjection: vi.fn(async (next) => {
      background = next
    }),
    setAnimationProjection: vi.fn(async (animation) => {
      animations = [
        ...animations.filter(existing => existing.id !== animation.id),
        animation,
      ]
    }),
    removeAnimationProjection: vi.fn(async (id) => {
      animations = animations.filter(animation => animation.id !== id)
    }),
    getViewState: vi.fn(() => ({
      layout: createViewLayoutProjection(),
      background,
      characters: [],
      dialogue: { visible: false, text: '' },
      choices: [],
      ui: { visible: true },
      effects: [],
      animations,
      plugins: {},
    })),
  } as unknown as QuaEngineInterface
}
