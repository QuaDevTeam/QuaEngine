import type { QuaViewProjection } from '@quajs/render-core'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { Pipeline } from '@quajs/pipeline'
import {
  AUDIO_PLUGIN_ID,
  AudioRenderToLogicEvents,
  createInitialAudioProjection,
  onAudioRenderToLogic,
} from '@quajs/plugin-audio/contracts'
import {
  emitLogicToRender,
  LogicToRenderEvents,
  onRenderToLogic,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createQuaWebDomRenderer,
  createQuaWebRendererController,
  createReactRendererStoreAdapter,
} from '../src'
import { WebAudioRendererController } from '../src/audio'
import { createVisualNovelWebRendererPlugins } from '../src/plugins/preset'

describe('@quajs/renderer-web', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('owns framework-neutral pipeline lifecycle and exposes external-store snapshots', async () => {
    const pipeline = new Pipeline()
    const received: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_READY, () => received.push('ready'))
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_DESTROYED, () => received.push('destroyed'))

    const controller = createQuaWebRendererController({
      pipeline,
      initialView: view({ dialogue: { visible: true, text: 'Initial' } }),
    })
    const adapter = createReactRendererStoreAdapter(controller)
    let updates = 0
    const unsubscribe = adapter.subscribe(() => updates += 1)

    await controller.start()
    expect(received).toEqual(['ready'])
    expect(adapter.getSnapshot().view.dialogue.text).toBe('Initial')

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: view({ dialogue: { visible: true, text: 'Updated' } }),
    })

    expect(adapter.getSnapshot().view.dialogue.text).toBe('Updated')
    expect(updates).toBeGreaterThan(0)

    unsubscribe()
    await controller.destroy()
    expect(received).toEqual(['ready', 'destroyed'])
  })

  it('renders an opt-in native DOM visual novel projection and emits user intents', async () => {
    const pipeline = new Pipeline()
    const advances: Array<{ source?: string }> = []
    const choices: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => advances.push(payload))
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, payload => choices.push(payload.choiceId))

    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        background: { mode: 'image', assetName: 'bg.png' },
        characters: [{ id: 'Alice', name: 'Alice', visible: true, position: { x: 10 } }],
        dialogue: { visible: true, characterName: 'Alice', text: 'Line' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      }),
    })

    await renderer.mount()

    expect(root.querySelector('.qua-background')).not.toBeNull()
    expect(root.querySelector('.qua-character')?.getAttribute('style')).toContain('--qua-character-x: 10')
    expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('Line')

    root.querySelector('.qua-choice-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    root.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    root.querySelector('.qua-stage')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushDom()

    expect(choices).toEqual(['yes'])
    expect(advances).toEqual([{ source: 'dialogue' }, { source: 'stage-click' }])

    await renderer.unmount()
  })

  it('projects active character/background animations in native DOM layers', async () => {
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const timestamp = Date.now()
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        background: { mode: 'image', assetName: 'bg.png' },
        characters: [{
          id: 'Alice',
          name: 'Alice',
          visible: true,
          position: { x: 0, y: 50 },
        }],
        animations: [{
          id: 'animation:1',
          state: 'paused',
          startedAt: timestamp - 500,
          pausedAt: timestamp,
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [
            {
              target: 'character:Alice',
              property: 'position.x',
              keyframes: [
                { at: 0, value: 0 },
                { at: 1000, value: 50 },
              ],
            },
            {
              target: 'background:main',
              property: 'x',
              keyframes: [
                { at: 0, value: 0 },
                { at: 1000, value: 20 },
              ],
            },
          ],
        }],
      }),
    })

    await renderer.mount()

    expect(root.querySelector('.qua-character')?.getAttribute('style')).toContain('--qua-character-x: 25')
    expect(root.querySelector('.qua-background')?.getAttribute('style')).toContain('--qua-background-x: 10')

    await renderer.unmount()
  })

  it('renders sprite manifests and expressions through the Web sprite preset', async () => {
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:web-sprite:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-web-sprite-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: spriteAssetManifest(),
        }),
        getAsset: async (_id, record) => {
          if (record?.path === 'characters/alice/sprite.manifest.json') {
            return new TextEncoder().encode(JSON.stringify({
              version: 1,
              family: 'alice',
              base: { asset: 'base.png' },
              expressions: {
                happy: {
                  layers: [{ asset: 'happy.png' }],
                },
              },
            }))
          }
          return new Uint8Array([1, 2, 3])
        },
      },
    })
    await assets.initialize()

    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        characters: [{
          id: 'Alice',
          name: 'Alice',
          visible: true,
          sprite: 'alice/base.png',
          expression: 'happy',
        }],
      }),
    })

    await renderer.mount()
    await flushDom()
    await flushDom()

    const sprite = root.querySelector('.qua-sprite')
    expect(sprite).not.toBeNull()
    expect(sprite?.getAttribute('data-sprite-family')).toBe('alice')
    expect(sprite?.getAttribute('data-sprite-expression')).toBe('happy')
    expect(root.querySelectorAll('.qua-sprite-layer').length).toBe(2)
    expect(root.querySelectorAll('.qua-sprite-layer--expression').length).toBe(1)
    expect(create).toHaveBeenCalled()

    await renderer.unmount()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('starts playing audio immediately when the Web Audio context is already running', async () => {
    installFakeAudioContext({ initialState: 'running' })
    const assets = await createAudioAssets()
    const pipeline = new Pipeline()
    const unlocked: unknown[] = []
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.UNLOCKED, payload => unlocked.push(payload))

    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => audioView(),
      document,
    })

    controller.start()
    await controller.sync()

    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)
    expect(unlocked).toHaveLength(1)

    await controller.destroy()
    await assets.cleanup()
  })

  it('starts pending audio when automatic Web Audio resume is allowed', async () => {
    installFakeAudioContext({
      initialState: 'suspended',
      resume: (context) => {
        context.state = 'running'
      },
    })
    const assets = await createAudioAssets()
    const pipeline = new Pipeline()
    const unlocked: unknown[] = []
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.UNLOCKED, payload => unlocked.push(payload))

    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => audioView(),
      document,
    })

    controller.start()
    await controller.sync()
    await flushDom()

    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)
    expect(unlocked).toHaveLength(1)

    await controller.destroy()
    await assets.cleanup()
  })

  it('queues autoplay-blocked audio and unlocks it on the next user gesture', async () => {
    let allowResume = false
    installFakeAudioContext({
      initialState: 'suspended',
      resume: async (context) => {
        if (!allowResume) {
          throw new Error('autoplay blocked')
        }
        context.state = 'running'
      },
    })
    const assets = await createAudioAssets()
    const pipeline = new Pipeline()
    const unlocked: unknown[] = []
    const errors: unknown[] = []
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.UNLOCKED, payload => unlocked.push(payload))
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.ERROR, payload => errors.push(payload))

    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => audioView(),
      document,
    })

    controller.start()
    await controller.sync()
    await flushDom()

    expect(FakeAudioContext.sources[0]?.start).not.toHaveBeenCalled()
    expect(unlocked).toHaveLength(0)
    expect(errors).toHaveLength(0)

    allowResume = true
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushDom()

    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)
    expect(unlocked).toHaveLength(1)
    expect(errors).toHaveLength(0)

    await controller.destroy()
    await assets.cleanup()
  })
})

function view(overrides: Partial<QuaViewProjection> = {}): QuaViewProjection {
  return {
    characters: [],
    dialogue: { visible: false, text: '' },
    choices: [],
    ui: { visible: true },
    effects: [],
    animations: [],
    plugins: {},
    ...overrides,
  }
}

async function flushDom(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function spriteAssetManifest() {
  return [
    {
      id: 'memory:default:characters:alice/sprite.manifest.json',
      bundleName: 'memory',
      name: 'alice/sprite.manifest.json',
      type: 'characters' as const,
      locale: 'default',
      path: 'characters/alice/sprite.manifest.json',
      mimeType: 'application/json',
    },
    {
      id: 'memory:default:characters:alice/base.png',
      bundleName: 'memory',
      name: 'alice/base.png',
      type: 'characters' as const,
      locale: 'default',
      path: 'characters/alice/base.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:characters:alice/happy.png',
      bundleName: 'memory',
      name: 'alice/happy.png',
      type: 'characters' as const,
      locale: 'default',
      path: 'characters/alice/happy.png',
      mimeType: 'image/png',
    },
  ]
}

function audioView(): QuaViewProjection {
  const audio = createInitialAudioProjection()
  return view({
    plugins: {
      [AUDIO_PLUGIN_ID]: {
        ...audio,
        bgm: {
          id: 'bgm:1',
          kind: 'bgm',
          assetKey: 'bgm.ogg',
          state: 'playing',
          loop: true,
        },
      },
    },
  })
}

async function createAudioAssets(): Promise<QuaAssets> {
  const assets = new QuaAssets({
    adapter: {
      name: 'renderer-web-audio-test',
      storage: new MemoryAssetStorage(),
      crypto: { sha256: async () => '' },
    },
    provider: {
      mode: 'memory',
      getManifest: async () => ({
        version: '1',
        assets: [{
          id: 'memory:default:audio:bgm.ogg',
          bundleName: 'memory',
          name: 'bgm.ogg',
          type: 'audio' as const,
          locale: 'default',
          path: 'audio/bgm.ogg',
          mimeType: 'audio/ogg',
        }],
      }),
      getAsset: async () => new Uint8Array([1, 2, 3, 4]),
    },
  })
  await assets.initialize()
  return assets
}

interface FakeAudioContextOptions {
  initialState: AudioContextState
  resume?: (context: FakeAudioContext) => Promise<void> | void
}

function installFakeAudioContext(options: FakeAudioContextOptions): void {
  FakeAudioContext.initialState = options.initialState
  FakeAudioContext.resumeHandler = options.resume || ((context) => {
    context.state = 'running'
  })
  FakeAudioContext.sources = []
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('webkitAudioContext', undefined)
}

class FakeAudioContext {
  static initialState: AudioContextState = 'suspended'
  static resumeHandler: (context: FakeAudioContext) => Promise<void> | void = (context) => {
    context.state = 'running'
  }

  static sources: FakeAudioBufferSourceNode[] = []

  state: AudioContextState
  currentTime = 0
  destination = new FakeAudioNode()

  constructor() {
    this.state = FakeAudioContext.initialState
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeBiquadFilterNode() as unknown as BiquadFilterNode
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeAudioBufferSourceNode()
    FakeAudioContext.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  async decodeAudioData(_audioData: ArrayBuffer): Promise<AudioBuffer> {
    return {} as AudioBuffer
  }

  async resume(): Promise<void> {
    await FakeAudioContext.resumeHandler(this)
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }
}

class FakeAudioParam {
  value = 1

  cancelScheduledValues(_startTime: number): this {
    return this
  }

  setValueAtTime(value: number, _startTime: number): this {
    this.value = value
    return this
  }

  linearRampToValueAtTime(value: number, _endTime: number): this {
    this.value = value
    return this
  }
}

class FakeAudioNode {
  connect(_destinationNode: AudioNode): AudioNode {
    return _destinationNode
  }

  disconnect(): void {}
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam()
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'peaking'
  frequency = new FakeAudioParam()
  gain = new FakeAudioParam()
  Q = new FakeAudioParam()
  detune = new FakeAudioParam()
}

class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null
  loop = false
  onended: ((this: AudioScheduledSourceNode, ev: Event) => unknown) | null = null
  start = vi.fn()
  stop = vi.fn()
}
