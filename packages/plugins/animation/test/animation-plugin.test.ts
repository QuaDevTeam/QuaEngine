import type { QuaEngineInterface } from '@quajs/engine'
import type { QuaViewProjection } from '@quajs/render-core'
import { createFlowControlProjection, createViewLayoutProjection } from '@quajs/render-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  animationDecoratorMappings,
  AnimationPlugin,
  characterEnter,
  choicesStagger,
  pauseAnimationWithEngine,
  playAnimationWithEngine,
  playTimelineWithEngine,
  registerAnimationWithEngine,
  resumeAnimationWithEngine,
  seekAnimationWithEngine,
  stageShake,
  stopAnimationWithEngine,
  waitAnimationWithEngine,
} from '../src'

describe('@quajs/plugin-animation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('registers APIs and QuaScript decorators', () => {
    const plugin = new AnimationPlugin()
    const registration = plugin.registerAPIs()

    expect(registration.pluginName).toBe('@quajs/plugin-animation')
    expect(registration.apis.map(api => api.name)).toEqual(expect.arrayContaining([
      'registerAnimationWithEngine',
      'playAnimationWithEngine',
      'playTimelineWithEngine',
      'pauseAnimationWithEngine',
      'resumeAnimationWithEngine',
      'stopAnimationWithEngine',
      'seekAnimationWithEngine',
      'waitAnimationWithEngine',
    ]))
    expect(registration.decorators).toEqual(animationDecoratorMappings)
  })

  it('plays named timelines, projects resolved tracks, waits, and commits final values', async () => {
    const engine = createEngine({
      characters: [{
        id: 'Alice',
        name: 'Alice',
        visible: true,
        position: { x: 0 },
      }],
    })

    await registerAnimationWithEngine(engine, {
      id: 'character.enter-left',
      duration: 100,
      tracks: [{
        target: 'actor',
        property: 'position.x',
        keyframes: [
          { at: 0, value: -180 },
          { at: 100, value: 40 },
        ],
      }],
    })

    const played = playAnimationWithEngine(engine, 'character.enter-left', {
      bindings: ['actor=character:Alice'],
      wait: true,
    })

    expect(engine.getViewState().animations).toEqual([
      expect.objectContaining({
        definitionId: 'character.enter-left',
        bindings: { actor: 'character:Alice' },
        resolvedTracks: [
          expect.objectContaining({
            target: 'character:Alice',
            property: 'position.x',
          }),
        ],
      }),
    ])

    await vi.advanceTimersByTimeAsync(100)
    await played

    expect(engine.getViewState().animations).toEqual([])
    expect(engine.getViewState().characters[0].position?.x).toBe(40)
    expect(engine.moveCharacter).toHaveBeenLastCalledWith('Alice', { x: 40 })
  })

  it('supports pause, resume, seek, stop, and wait controls', async () => {
    const engine = createEngine({
      background: { mode: 'image', assetName: 'room.png', x: 0 },
    })

    const playback = await playTimelineWithEngine(engine, {
      duration: 1000,
      tracks: [{
        target: 'background:main',
        property: 'x',
        keyframes: [
          { at: 0, value: 0 },
          { at: 1000, value: 100 },
        ],
      }],
    })

    await vi.advanceTimersByTimeAsync(250)
    await pauseAnimationWithEngine(engine, playback.id)
    expect(engine.getViewState().animations[0].state).toBe('paused')

    await vi.advanceTimersByTimeAsync(1000)
    expect(engine.getViewState().animations).toHaveLength(1)

    await seekAnimationWithEngine(engine, playback.id, 500)
    await resumeAnimationWithEngine(engine, playback.id)
    expect(engine.getViewState().animations[0]).toEqual(expect.objectContaining({
      state: 'running',
      pausedAt: undefined,
    }))

    const wait = waitAnimationWithEngine(engine, playback.id)
    await stopAnimationWithEngine(engine, playback.id)
    await expect(wait).resolves.toBeUndefined()
    expect(engine.getViewState().animations).toEqual([])
  })

  it('projects delay, direction, fill, and commit metadata and keeps filled projections when requested', async () => {
    const engine = createEngine()
    const played = playTimelineWithEngine(engine, {
      duration: 100,
      delay: 50,
      direction: 'reverse',
      fill: 'forwards',
      commit: 'none',
      tracks: [{
        target: 'stage:main',
        property: 'opacity',
        keyframes: [
          { at: 0, value: 0 },
          { at: 100, value: 1 },
        ],
      }],
    }, { wait: true })

    expect(engine.getViewState().animations[0]).toEqual(expect.objectContaining({
      delay: 50,
      direction: 'reverse',
      fill: 'forwards',
      commit: 'none',
    }))

    await vi.advanceTimersByTimeAsync(150)
    await played

    expect(engine.getViewState().animations[0]).toEqual(expect.objectContaining({
      state: 'stopped',
      endedAt: expect.any(Number),
    }))
  })

  it('commits terminal values according to playback direction', async () => {
    const engine = createEngine({
      characters: [{
        id: 'Alice',
        name: 'Alice',
        visible: true,
        position: { x: 10 },
      }],
    })

    const played = playTimelineWithEngine(engine, {
      duration: 100,
      direction: 'reverse',
      tracks: [{
        target: 'character:Alice',
        property: 'position.x',
        keyframes: [
          { at: 0, value: 10 },
          { at: 100, value: 60 },
        ],
      }],
    }, { wait: true })

    await vi.advanceTimersByTimeAsync(100)
    await played

    expect(engine.getViewState().characters[0].position?.x).toBe(10)
  })

  it('commits dialogue and choice motion state into plugin projections', async () => {
    const engine = createEngine({
      dialogue: { visible: true, text: 'Line' },
      choices: [{ id: 'yes', text: 'Yes', enabled: true }],
    })

    const played = playTimelineWithEngine(engine, {
      duration: 100,
      tracks: [
        {
          target: 'dialogue:box',
          property: 'opacity',
          keyframes: [
            { at: 0, value: 0 },
            { at: 100, value: 1 },
          ],
        },
        {
          target: 'choices:panel',
          property: 'y',
          keyframes: [
            { at: 0, value: 20 },
            { at: 100, value: 0 },
          ],
        },
        {
          target: 'choice:yes',
          property: 'opacity',
          keyframes: [
            { at: 0, value: 0 },
            { at: 100, value: 1 },
          ],
        },
      ],
    }, { wait: true })

    await vi.advanceTimersByTimeAsync(100)
    await played

    expect(engine.getViewState().plugins.dialogue).toEqual({ opacity: 1 })
    expect(engine.getViewState().plugins.choices).toEqual({
      y: 0,
      choices: {
        yes: { opacity: 1 },
      },
    })
  })

  it('commits rich dialogue typography transitions back into dialogue text projection', async () => {
    const engine = createEngine({
      dialogue: {
        visible: true,
        text: {
          kind: 'rich-text',
          blocks: [{
            id: 'line',
            spans: [
              { text: 'Hello ' },
              { id: 'keyword', text: 'World', color: '#000000', fontSize: 20, fontWeight: 400 },
            ],
          }],
        },
      },
    })

    const played = playTimelineWithEngine(engine, {
      duration: 100,
      tracks: [
        {
          target: 'richText:dialogue',
          property: 'fontFamily',
          keyframes: [
            { at: 0, value: 'Qua Sans' },
            { at: 100, value: 'Qua Serif' },
          ],
        },
        {
          target: 'richTextBlock:dialogue:line',
          property: 'x',
          keyframes: [
            { at: 0, value: 0 },
            { at: 100, value: 12 },
          ],
        },
        {
          target: 'richTextSpan:dialogue:keyword',
          property: 'color',
          interpolation: 'color',
          keyframes: [
            { at: 0, value: '#000000' },
            { at: 100, value: '#ffffff' },
          ],
        },
        {
          target: 'richTextSpan:dialogue:keyword',
          property: 'fontSize',
          keyframes: [
            { at: 0, value: 20 },
            { at: 100, value: 40 },
          ],
        },
        {
          target: 'richTextSpan:dialogue:keyword',
          property: 'fontWeight',
          keyframes: [
            { at: 0, value: 400 },
            { at: 100, value: 700 },
          ],
        },
      ],
    }, { wait: true })

    await vi.advanceTimersByTimeAsync(100)
    await played

    const text = engine.getViewState().dialogue.text as any
    expect(engine.getViewState().animations).toEqual([])
    expect(text.fontFamily).toBe('Qua Serif')
    expect(text.blocks[0].x).toBe(12)
    expect(text.blocks[0].spans[1]).toEqual(expect.objectContaining({
      color: '#ffffff',
      fontSize: 40,
      fontWeight: 700,
    }))
    expect(engine.showDialogue).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.objectContaining({ kind: 'rich-text' }),
    }))
  })

  it('reconciles restored running projections into completion timers', async () => {
    const engine = createEngine({
      animations: [{
        id: 'restored:animation',
        state: 'running',
        startedAt: 1000,
        duration: 100,
        playbackRate: 1,
        fill: 'none',
        resolvedTracks: [{
          target: 'stage:main',
          property: 'x',
          keyframes: [
            { at: 0, value: 0 },
            { at: 100, value: 10 },
          ],
        }],
      }],
    })
    vi.setSystemTime(1050)
    const plugin = new AnimationPlugin()
    await plugin.init(createPluginContext(engine))

    await vi.advanceTimersByTimeAsync(50)

    expect(engine.getViewState().animations).toEqual([])
    await plugin.destroy?.()
  })

  it('commits background and layered background motion tracks', async () => {
    const engine = createEngine({
      background: {
        mode: 'layered',
        x: 0,
        scale: 1,
        layers: [{
          id: 'fog',
          assetName: 'fog.png',
          opacity: 0.2,
          composition: {
            filter: { blur: 0, brightness: 1 },
          },
        }],
      },
    })

    const played = playTimelineWithEngine(engine, {
      duration: 100,
      tracks: [
        {
          target: 'background:main',
          property: 'scale',
          keyframes: [
            { at: 0, value: 1 },
            { at: 100, value: 1.2 },
          ],
        },
        {
          target: 'background:main',
          property: 'x',
          keyframes: [
            { at: 0, value: 0 },
            { at: 100, value: 50 },
          ],
        },
        {
          target: 'backgroundLayer:fog',
          property: 'composition.filter.blur',
          keyframes: [
            { at: 0, value: 0 },
            { at: 100, value: 8 },
          ],
        },
        {
          target: 'backgroundLayer:fog',
          property: 'opacity',
          keyframes: [
            { at: 0, value: 0.2 },
            { at: 100, value: 0.8 },
          ],
        },
      ],
    }, { wait: true })

    await vi.advanceTimersByTimeAsync(100)
    await played

    expect(engine.getViewState().background).toEqual(expect.objectContaining({
      x: 50,
      scale: 1.2,
    }))
    expect(engine.getViewState().background?.layers?.[0]).toEqual(expect.objectContaining({
      id: 'fog',
      opacity: 0.8,
      composition: {
        filter: { blur: 8, brightness: 1 },
      },
    }))
  })

  it('warns for missing adapters by default and supports strict adapter mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const engine = createEngine()

    await playTimelineWithEngine(engine, {
      duration: 100,
      tracks: [{
        target: 'futureThing:one',
        property: 'x',
        keyframes: [{ at: 0, value: 1 }],
      }],
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No animation target adapter registered'))
    await stopAnimationWithEngine(engine)

    await expect(playTimelineWithEngine(engine, {
      duration: 100,
      tracks: [{
        target: 'futureThing:two',
        property: 'x',
        keyframes: [{ at: 0, value: 1 }],
      }],
    }, { strictAdapters: true })).rejects.toThrow('No animation target adapter registered')
  })

  it('creates visual novel motion preset timelines', () => {
    expect(characterEnter({ target: 'character:Alice' }).tracks.map(track => track.target)).toEqual([
      'character:Alice',
      'character:Alice',
    ])
    expect(stageShake({ intensity: 12 }).tracks.map(track => track.property)).toEqual(['x', 'y'])
    expect(choicesStagger({ choiceIds: ['yes', 'no'], stagger: 50 }).duration).toBe(370)
  })
})

function createPluginContext(engine: QuaEngineInterface) {
  return {
    engine,
    store: {},
    assets: {},
    pipeline: {},
    plugins: {
      getPlugin: () => undefined,
      getPluginById: () => undefined,
      getAllPlugins: () => new Map(),
      hasPlugin: () => false,
    },
  } as any
}

function createEngine(viewPatch: Partial<QuaViewProjection> = {}) {
  const view: QuaViewProjection = {
    layout: createViewLayoutProjection(),
    background: undefined,
    characters: [],
    dialogue: { visible: false, text: '' },
    choices: [],
    ui: { visible: true, overlays: {} },
    flowControl: createFlowControlProjection(),
    effects: [],
    animations: [],
    plugins: {},
    ...viewPatch,
  }

  const engine = {
    getViewState: vi.fn(() => ({
      ...view,
      plugins: { ...view.plugins },
      characters: view.characters.map(character => ({
        ...character,
        position: character.position ? { ...character.position } : undefined,
      })),
      animations: view.animations.map(animation => ({
        ...animation,
        resolvedTracks: animation.resolvedTracks.map(track => ({
          ...track,
          keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
        })),
      })),
    })),
    setAnimationProjection: vi.fn(async (animation) => {
      view.animations = [
        ...view.animations.filter(existing => existing.id !== animation.id),
        animation,
      ]
    }),
    removeAnimationProjection: vi.fn(async (id) => {
      view.animations = view.animations.filter(animation => animation.id !== id)
    }),
    clearAnimationProjections: vi.fn(async () => {
      view.animations = []
    }),
    moveCharacter: vi.fn(async (id: string, position: any) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, position } : character,
      )
    }),
    setCharacterSprite: vi.fn(async (id: string, sprite: string | undefined) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, sprite } : character,
      )
    }),
    setCharacterExpression: vi.fn(async (id: string, expression: string | undefined) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, expression } : character,
      )
    }),
    showCharacter: vi.fn(async (character: any) => {
      view.characters = [
        ...view.characters.filter(existing => existing.id !== character.id),
        character,
      ]
    }),
    hideCharacter: vi.fn(async (id: string) => {
      view.characters = view.characters.map(character =>
        character.id === id ? { ...character, visible: false } : character,
      )
    }),
    setBackgroundProjection: vi.fn(async (background) => {
      view.background = background
    }),
    updateUI: vi.fn(async (elementId: string, config: Record<string, unknown>) => {
      view.ui = {
        ...view.ui,
        overlays: {
          ...(view.ui.overlays || {}),
          [elementId]: config,
        },
      }
    }),
    showDialogue: vi.fn(async (dialogue: any) => {
      view.dialogue = {
        visible: dialogue.visible !== false,
        text: dialogue.text || '',
        characterId: dialogue.characterId,
        characterName: dialogue.characterName,
        mode: dialogue.mode,
      }
    }),
    hideDialogue: vi.fn(async () => {
      view.dialogue = { ...view.dialogue, visible: false }
    }),
    showChoices: vi.fn(async (choices: any[]) => {
      view.choices = choices.map(choice => ({
        id: choice.id,
        text: choice.text,
        enabled: choice.enabled !== false,
        metadata: choice.metadata,
      }))
    }),
    getPluginProjection: vi.fn((pluginId: string) => view.plugins[pluginId]),
    setPluginProjection: vi.fn(async (pluginId: string, projection: unknown) => {
      view.plugins = {
        ...view.plugins,
        [pluginId]: projection,
      }
    }),
    getStore: vi.fn(() => ({
      commit: vi.fn(),
    })),
  } as unknown as QuaEngineInterface & {
    moveCharacter: ReturnType<typeof vi.fn>
    setBackgroundProjection: ReturnType<typeof vi.fn>
  }

  return engine
}
