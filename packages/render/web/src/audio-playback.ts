import type { Pipeline } from '@quajs/pipeline'
import type { WebAudioAudioRuntime } from './audio-runtime'

export interface WebAudioPlaybackEntry {
  id: string
  positionMs: number
  durationMs: number
  /** Live processing controls; inspection never creates or changes nodes. */
  pcm?: { rms: number, peak: number, frequency: number }
  playbackRate: number
  gain: number
  eq: Array<{ type: BiquadFilterType, frequency: number, q: number, gainDb: number }>
  state: 'playing' | 'scheduled' | 'paused' | 'pending' | 'suspended' | 'stopped'
}

// Resource handles only, scoped to each renderer pipeline and released on destroy.
const runtimes = new WeakMap<Pipeline, Set<WebAudioAudioRuntime>>()

export function registerAudioPlayback(pipeline: Pipeline, runtime: WebAudioAudioRuntime): () => void {
  const entries = runtimes.get(pipeline) || new Set<WebAudioAudioRuntime>()
  entries.add(runtime)
  runtimes.set(pipeline, entries)
  return () => {
    entries.delete(runtime)
    if (!entries.size)
      runtimes.delete(pipeline)
  }
}

/** Read the audio device clock without starting a context, decoding, or advancing it. */
export function getWebAudioPlaybackEntries(pipeline: Pipeline): WebAudioPlaybackEntry[] {
  return [...runtimes.get(pipeline) || []].flatMap(runtime => runtime.getPlaybackEntries())
}
