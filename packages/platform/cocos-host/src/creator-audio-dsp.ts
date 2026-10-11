/** Normalized Web Audio biquads for the injected native PCM processor. */
export interface CreatorAudioBand {
  type?: string
  frequency?: number
  gainDb?: number
  q?: number
  detune?: number
}
export function creatorBiquad(band: CreatorAudioBand, sampleRate: number): number[] {
  const w = 2 * Math.PI * Math.max(0.001, Math.min(sampleRate / 2 - 0.001, (band.frequency ?? 350) * 2 ** ((band.detune ?? 0) / 1200))) / sampleRate
  const c = Math.cos(w)
  const s = Math.sin(w)
  const A = 10 ** ((band.gainDb ?? 0) / 40)
  const type = band.type ?? 'peaking'
  const q = band.q ?? 1
  const alpha = s / (2 * (type === 'lowpass' || type === 'highpass' ? 10 ** (q / 20) : Math.max(0.0001, q)))
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number
  switch (type) {
    case 'lowpass':
      b0 = (1 - c) / 2
      b1 = 1 - c
      b2 = b0
      a0 = 1 + alpha
      a1 = -2 * c
      a2 = 1 - alpha
      break
    case 'highpass':
      b0 = (1 + c) / 2
      b1 = -(1 + c)
      b2 = b0
      a0 = 1 + alpha
      a1 = -2 * c
      a2 = 1 - alpha
      break
    case 'bandpass':
      b0 = alpha
      b1 = 0
      b2 = -alpha
      a0 = 1 + alpha
      a1 = -2 * c
      a2 = 1 - alpha
      break
    case 'notch':
      b0 = 1
      b1 = -2 * c
      b2 = 1
      a0 = 1 + alpha
      a1 = b1
      a2 = 1 - alpha
      break
    case 'allpass':
      b0 = 1 - alpha
      b1 = -2 * c
      b2 = 1 + alpha
      a0 = 1 + alpha
      a1 = b1
      a2 = 1 - alpha
      break
    case 'peaking':
      b0 = 1 + alpha * A
      b1 = -2 * c
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = b1
      a2 = 1 - alpha / A
      break
    case 'lowshelf':
    {
      const z = s * Math.sqrt(2 * A)
      b0 = A * (A + 1 - (A - 1) * c + z)
      b1 = 2 * A * (A - 1 - (A + 1) * c)
      b2 = A * (A + 1 - (A - 1) * c - z)
      a0 = A + 1 + (A - 1) * c + z
      a1 = -2 * (A - 1 + (A + 1) * c)
      a2 = A + 1 + (A - 1) * c - z
      break
    }
    case 'highshelf':
    {
      const z = s * Math.sqrt(2 * A)
      b0 = A * (A + 1 + (A - 1) * c + z)
      b1 = -2 * A * (A - 1 + (A + 1) * c)
      b2 = A * (A + 1 + (A - 1) * c - z)
      a0 = A + 1 - (A - 1) * c + z
      a1 = 2 * (A - 1 - (A + 1) * c)
      a2 = A + 1 - (A - 1) * c - z
      break
    }
    default:
      throw new TypeError(`Unsupported Creator audio filter: ${type}`)
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}
export function creatorPcmMetrics(pcm: Float32Array, sampleRate: number): {
  rms: number
  peak: number
  frequency: number
} {
  let energy = 0
  let peak = 0
  const crossings: number[] = []
  for (let i = 0; i < pcm.length; i++) {
    const value = pcm[i]
    energy += value * value
    peak = Math.max(peak, Math.abs(value))
    if (i && pcm[i - 1] <= 0 && value > 0)
      crossings.push(i - 1 - pcm[i - 1] / (value - pcm[i - 1]))
  }
  return {
    rms: Math.sqrt(energy / Math.max(1, pcm.length)),
    peak,
    frequency: crossings.length < 2 ? 0 : sampleRate * (crossings.length - 1) / (crossings[crossings.length - 1] - crossings[0]),
  }
}
