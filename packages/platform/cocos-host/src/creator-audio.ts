import type { CocosCreatorAudioBridge } from './creator'
import type { CreatorAudioBand } from './creator-audio-dsp'
import type { CocosHostAudioHandle } from './index'
import { creatorBiquad, creatorPcmMetrics } from './creator-audio-dsp'

/** Static macOS product injected by the active target resolver. */
export interface CreatorNativeAudioProcessor {
  create: (path: string) => number
  project: (id: number, gain: number, rate: number, loop: boolean, coefficients: ArrayBuffer) => boolean
  control: (id: number, command: number, positionMs: number) => boolean
  inspect: (id: number, pcm?: boolean) => {
    positionMs: number
    durationMs: number
    playing: number
    ended: number
    gain: number
    playbackRate: number
    sampleRate: number
    pcm?: ArrayBuffer
  }
  dispose: (id: number) => boolean
}
interface AudioResource {
  bus: string
  apply: () => void
}
/** Creator owns loading and its preview context/activation; only processing resources are projected here. */
export function createCreatorProcessedAudioBridge(options: {
  cc: Record<string, any>
  rootNode: any
  processor?: CreatorNativeAudioProcessor
  fileUtils?: any
}, fallback: CocosCreatorAudioBridge): CocosCreatorAudioBridge {
  const {
    cc,
    rootNode,
    processor,
    fileUtils,
  } = options
  if (!processor && cc.sys.isNative !== false)
    return fallback
  const volumes = new Map<string, number>()
  const busBands = new Map<string, readonly CreatorAudioBand[]>()
  const resources = new Set<AudioResource>()
  const bandsFor = (bus: string, track: readonly CreatorAudioBand[]) => [...track, ...(bus === 'master' ? [] : busBands.get(bus) ?? []), ...(busBands.get('master') ?? [])]
  const update = () => {
    for (const resource of resources) resource.apply()
  }
  return {
    playbackRate: true,
    gainAboveUnity: true,
    setBusVolume(bus, volume) {
      volumes.set(bus, volume)
      update()
    },
    setBusEq(bus, bands) {
      if (bands.length > 16)
        throw new RangeError('Creator supports at most 16 EQ bands per stage.')
      busBands.set(bus, bands as readonly CreatorAudioBand[])
      update()
    },
    async createAudioHandle(resource, initial) {
      const node = new cc.Node(`qua-audio-${initial.id}`)
      rootNode.addChild(node)
      let volume = initial.volume
      let rate = initial.playbackRate ?? 1
      let loop = initial.loop
      let trackBands: readonly CreatorAudioBand[] = []
      let disposed = false
      let playing = false
      let position = 0
      let startedAt = 0
      const listeners = new Set<() => void>()
      let inspect: () => any
      let apply: () => void
      let play: () => Promise<void> | void
      let pause: () => void
      let stop: () => void
      let seek: (ms: number) => void
      let cleanup: () => void
      const bus = initial.bus ?? 'master'
      const gain = () => volume * (volumes.get('master') ?? 1) * (bus === 'master' ? 1 : volumes.get(bus) ?? 1)
      const ended = () => {
        playing = false
        for (const fn of listeners) fn()
      }
      if (processor) {
        const clip = resource.native as any
        const url = clip.nativeUrl || clip._nativeAsset?.url
        const path = fileUtils?.fullPathForFilename(url) || url
        const nativeId = processor.create(path)
        if (!(nativeId > 0)) {
          node.destroy()
          throw new Error(`Creator native audio cannot decode imported resource: ${resource.id}`)
        }
        const project = () => {
          const coefficients = new Float64Array(bandsFor(bus, trackBands).flatMap(band => creatorBiquad(band, 44100)))
          if (!processor.project(nativeId, gain(), rate, loop, coefficients.buffer))
            throw new Error(`Creator native audio projection failed: ${initial.id}`)
        }
        const control = (command: number, ms = 0) => {
          if (!processor.control(nativeId, command, ms))
            throw new Error(`Creator native audio control failed: ${initial.id}`)
        }
        let didEnd = false
        const frame = () => {
          const state = processor.inspect(nativeId)
          if (state.ended && !didEnd) {
            didEnd = true
            ended()
          }
        }
        cc.director.on(cc.Director.EVENT_BEFORE_DRAW, frame)
        apply = project
        play = () => {
          didEnd = false
          control(1)
          playing = true
        }
        pause = () => {
          control(2)
          playing = false
        }
        stop = () => {
          control(3)
          playing = false
          didEnd = false
        }
        seek = (ms) => {
          control(4, ms)
          didEnd = false
        }
        inspect = () => {
          const state = processor.inspect(nativeId, true)
          return {
            ...state,
            playing: !!state.playing,
            eq: bandsFor(bus, trackBands),
            backend: 'creator-macos-pcm',
            pcm: state.pcm ? creatorPcmMetrics(new Float32Array(state.pcm), state.sampleRate) : undefined,
          }
        }
        cleanup = () => {
          cc.director.off(cc.Director.EVENT_BEFORE_DRAW, frame)
          processor.dispose(nativeId)
        }
      }
      else {
        const audio = node.addComponent(cc.AudioSource)
        audio.clip = resource.native
        // Await Creator's own imported AudioPlayer. No context or browser activation policy is created here.
        const deadline = Date.now() + 5000
        while (!audio._player && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
        const player = audio._player?._player
        const context = player?._gainNode?.context
        if (!context || !player._startSourceNode || !player._audioBuffer) {
          node.destroy()
          throw new Error('Creator 3.8 WebAudio player processing seam is unavailable.')
        }
        const filters: any[] = []
        const meter = context.createAnalyser()
        meter.fftSize = 4096
        const pcm = new Float32Array(meter.fftSize)
        const clock = () => position + (playing ? Math.max(0, context.currentTime - startedAt) * rate * 1000 : 0)
        const anchor = () => {
          const value = clock()
          const duration = player.duration * 1000
          position = loop && duration ? value % duration : value
          startedAt = context.currentTime
        }
        const original = player._startSourceNode
        const detachedSource = () => {
          if (player._sourceNode)
            player._sourceNode.onended = null
        }
        const rewire = () => {
          const bands = bandsFor(bus, trackBands)
          while (filters.length > bands.length) filters.pop().disconnect()
          while (filters.length < bands.length) filters.push(context.createBiquadFilter())
          for (const [i, band] of bands.entries()) {
            const filter = filters[i]
            filter.type = band.type ?? 'peaking'
            filter.frequency.value = band.frequency ?? 350
            filter.Q.value = band.q ?? 1
            filter.gain.value = band.gainDb ?? 0
            filter.detune.value = band.detune ?? 0
          }
          player._gainNode.disconnect()
          filters.forEach(filter => filter.disconnect())
          meter.disconnect()
          const chain = [player._gainNode, ...filters, meter, context.destination]
          for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1])
          player._gainNode.gain.value = gain()
          if (player._sourceNode)
            player._sourceNode.playbackRate.value = rate
          audio.loop = loop
        }
        player._startSourceNode = function () {
          detachedSource()
          original.call(player)
          clearTimeout(player._currentTimer)
          const source = player._sourceNode
          startedAt = context.currentTime
          playing = true
          rewire()
          source.onended = () => {
            if (disposed || !playing || player._sourceNode !== source || loop)
              return
            position = player.duration * 1000
            playing = false
            void player.stop()
            ended()
          }
        }
        apply = () => {
          anchor()
          rewire()
        }
        play = async () => {
          await player.seek(position / 1000)
          audio.play()
        }
        pause = () => {
          anchor()
          playing = false
          detachedSource()
          audio.pause()
        }
        stop = () => {
          playing = false
          position = 0
          detachedSource()
          audio.stop()
        }
        seek = (ms) => {
          position = ms
          startedAt = context.currentTime
          detachedSource()
          audio.currentTime = ms / 1000
        }
        inspect = () => {
          meter.getFloatTimeDomainData(pcm)
          const duration = player.duration * 1000
          const value = clock()
          return {
            positionMs: loop && duration ? value % duration : Math.min(value, duration),
            durationMs: duration,
            playing: playing && context.state === 'running',
            gain: player._gainNode.gain.value,
            playbackRate: player._sourceNode?.playbackRate.value ?? rate,
            eq: bandsFor(bus, trackBands),
            pcm: creatorPcmMetrics(pcm, context.sampleRate),
            backend: 'creator-sdk-audio-player',
          }
        }
        cleanup = () => {
          detachedSource()
          player._startSourceNode = original
          audio.stop()
          filters.forEach(filter => filter.disconnect())
          meter.disconnect()
        }
      }
      const entry = {
        bus,
        apply,
      }
      resources.add(entry)
      try {
        apply()
      }
      catch (error) {
        cleanup()
        resources.delete(entry)
        node.destroy()
        throw error
      }
      node.__quaAudio = {
        inspect,
      }
      const handle: CocosHostAudioHandle = {
        id: initial.id,
        play,
        pause,
        stop,
        setLoop(value) {
          loop = value
          apply()
        },
        setVolume(value) {
          volume = value
          apply()
        },
        setPlaybackRate(value) {
          // Re-anchor at the previous rate before updating the live source.
          apply()
          rate = value
          apply()
        },
        setEq(bands) {
          if (bands.length > 16)
            throw new RangeError('Creator supports at most 16 track EQ bands.')
          trackBands = bands as readonly CreatorAudioBand[]
          apply()
        },
        seek,
        getPosition: () => inspect().positionMs,
        onEnded(fn) {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
        dispose() {
          if (disposed)
            return
          disposed = true
          cleanup()
          resources.delete(entry)
          listeners.clear()
          node.__quaAudio = undefined
          node.destroy()
        },
      }
      return handle
    },
  }
}
