import { describe, expect, it, vi } from 'vitest'
import { createCreatorProcessedAudioBridge } from '../src/creator-audio'
import { creatorBiquad, creatorPcmMetrics } from '../src/creator-audio-dsp'

describe('creator processed audio', () => {
  it('keeps unsupported SDKs on the optional host bridge', () => {
    const fallback = {
      createAudioHandle: vi.fn(),
    }
    expect(createCreatorProcessedAudioBridge({
      cc: {
        sys: {},
      },
      rootNode: {},
    }, fallback)).toBe(fallback)
  })
  it('projects native gain/EQ/rate, emits one device ending and releases frame ownership', async () => {
    const callbacks = new Set<() => void>()
    const node = {
      destroy: vi.fn(),
    }
    const state = {
      positionMs: 1500,
      durationMs: 3000,
      playing: 1,
      ended: 0,
      gain: 1,
      playbackRate: 1,
      sampleRate: 44100,
    }
    const processor = {
      create: vi.fn(() => 1),
      project: vi.fn(() => true),
      control: vi.fn(() => true),
      inspect: vi.fn(() => state),
      dispose: vi.fn(() => true),
    }
    const cc = {
      sys: {
        isNative: true,
      },
      Node: class {
        constructor() { return node }
      },
      Director: {
        EVENT_BEFORE_DRAW: 'draw',
      },
      director: {
        on: (_: string, fn: () => void) => callbacks.add(fn),
        off: (_: string, fn: () => void) => callbacks.delete(fn),
      },
    }
    const bridge = createCreatorProcessedAudioBridge({
      cc,
      rootNode: {
        addChild() {},
      },
      processor,
      fileUtils: {
        fullPathForFilename: (path: string) => `/import/${path}`,
      },
    }, {})
    bridge.setBusVolume!('master', 0.5)
    bridge.setBusVolume!('bgm', 4)
    bridge.setBusEq!('bgm', [{
      type: 'lowpass',
      frequency: 300,
    }])
    const handle = await bridge.createAudioHandle!({
      id: 'clip',
      kind: 'audio',
      native: {
        nativeUrl: 'tone.wav',
      },
    }, {
      id: 'bgm',
      bus: 'bgm',
      loop: true,
      volume: 1,
    })
    expect(processor.create).toHaveBeenCalledWith('/import/tone.wav')
    expect(bridge).toMatchObject({
      gainAboveUnity: true,
      playbackRate: true,
    })
    await handle.seek!(1500)
    await handle.play()
    await handle.pause()
    handle.setPlaybackRate!(1.5)
    handle.setEq!([{
      type: 'peaking',
      frequency: 440,
      gainDb: 6,
    }])
    const args = processor.project.mock.calls.at(-1) as unknown as [number, number, number, boolean, ArrayBuffer]
    expect(args.slice(0, 4)).toEqual([1, 2, 1.5, true])
    expect(new Float64Array(args[4])).toHaveLength(10)
    expect(processor.control.mock.calls).toEqual([[1, 4, 1500], [1, 1, 0], [1, 2, 0]])
    const ended = vi.fn()
    handle.onEnded!(ended)
    state.ended = 1
    for (let i = 0; i < 3; i++) {
      for (const fn of callbacks) fn()
    }
    expect(ended).toHaveBeenCalledOnce()
    await handle.dispose()
    await handle.dispose()
    expect(callbacks.size).toBe(0)
    expect(processor.dispose).toHaveBeenCalledOnce()
    expect(node.destroy).toHaveBeenCalledOnce()
  })
  it('releases a decoded handle and frame listener when initial native projection fails', async () => {
    const callbacks = new Set<() => void>()
    const node = { destroy: vi.fn() }
    const processor = { create: () => 1, project: () => false, control: () => true, inspect: vi.fn(), dispose: vi.fn(() => true) }
    const cc = {
      sys: { isNative: true },
      Node: class { constructor() { return node } },
      Director: { EVENT_BEFORE_DRAW: 'draw' },
      director: { on: (_: string, fn: () => void) => callbacks.add(fn), off: (_: string, fn: () => void) => callbacks.delete(fn) },
    }
    const bridge = createCreatorProcessedAudioBridge({ cc, processor, rootNode: { addChild() {} } }, {})
    await expect(bridge.createAudioHandle!({ id: 'clip', kind: 'audio', native: { nativeUrl: '/import/tone.wav' } }, { id: 'failed', loop: false, volume: 1 })).rejects.toThrow('projection failed')
    expect(callbacks.size).toBe(0)
    expect(processor.dispose).toHaveBeenCalledOnce()
    expect(node.destroy).toHaveBeenCalledOnce()
  })

  it('normalizes eight finite filters and measures rendered PCM rather than controls', () => {
    for (const type of ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass']) {
      expect(creatorBiquad({
        type,
        frequency: 300,
        gainDb: 6,
        q: 0.7,
        detune: 100,
      }, 44100).every(Number.isFinite)).toBe(true)
    }
    const pcm = Float32Array.from({
      length: 4096,
    }, (_, i) => 0.25 * Math.sin(2 * Math.PI * 660 * i / 44100))
    const measured = creatorPcmMetrics(pcm, 44100)
    expect(measured.frequency).toBeCloseTo(660, 1)
    expect(measured.rms).toBeCloseTo(0.25 / Math.sqrt(2), 2)
  })
})
describe('creator SDK preview player seam', () => {
  it('unwraps the imported SDK player, reanchors live clocks and clears its unity-rate timer', async () => {
    const context: any = {
      currentTime: 0,
      state: 'running',
      sampleRate: 48000,
      destination: {},
    }
    const makeNode = () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        value: 1,
      },
      context,
    })
    context.createBiquadFilter = () => ({
      ...makeNode(),
      frequency: {},
      Q: {},
      gain: {},
      detune: {},
    })
    context.createAnalyser = () => ({
      ...makeNode(),
      fftSize: 0,
      getFloatTimeDomainData: (data: Float32Array) => data.fill(0),
    })
    const player: any = {
      _gainNode: makeNode(),
      _audioBuffer: {},
      duration: 3,
      seek: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      _startSourceNode() {
        player._sourceNode = {
          playbackRate: {
            value: 1,
          },
          onended: undefined,
        }
        player._currentTimer = setTimeout(() => {}, 5000)
      },
    }
    const original = player._startSourceNode
    const audio: any = {
      _player: {
        _player: player,
      },
      play: () => player._startSourceNode(),
      pause: vi.fn(),
      stop: vi.fn(),
    }
    const node = {
      addComponent: () => audio,
      destroy: vi.fn(),
    }
    const bridge = createCreatorProcessedAudioBridge({
      cc: {
        sys: {
          isNative: false,
        },
        Node: class {
          constructor() { return node }
        },
        AudioSource: {},
      },
      rootNode: {
        addChild() {},
      },
    }, {})
    const handle = await bridge.createAudioHandle!({
      id: 'clip',
      kind: 'audio',
      native: {},
    }, {
      id: 'preview',
      loop: true,
      volume: 2,
      playbackRate: 2,
    })
    await handle.seek!(500)
    await handle.play()
    context.currentTime = 0.5
    expect(handle.getPosition!()).toBe(1500)
    handle.setPlaybackRate!(0.5)
    context.currentTime = 1.5
    expect(handle.getPosition!()).toBe(2000)
    await handle.pause()
    handle.setVolume(3)
    handle.setPlaybackRate!(1.5)
    context.currentTime = 2.5
    expect(handle.getPosition!()).toBe(2000)
    await handle.play()
    expect(player.seek).toHaveBeenLastCalledWith(2)
    expect(player._sourceNode.playbackRate.value).toBe(1.5)
    expect(player._gainNode.gain.value).toBe(3)
    await handle.dispose()
    expect(player._startSourceNode).toBe(original)
    expect(node.destroy).toHaveBeenCalledOnce()
  })
})
