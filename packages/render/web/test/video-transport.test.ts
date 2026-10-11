import { describe, expect, it } from 'vitest'
import { projectBackgroundVideoTransport } from '../src/plugins/background'

describe('web video transport projection', () => {
  it('waits for metadata, honors seek and avoids seeking again on unrelated refresh', () => {
    const video = document.createElement('video')
    video.src = 'blob:clip'
    Object.defineProperty(video, 'duration', { value: 3 })
    const projection = { assetName: 'clip.mp4', seekMs: 1800, loop: true, muted: false, volume: 0.4, playbackRate: 1.5 }
    projectBackgroundVideoTransport(video, projection)
    expect(video.currentTime).toBe(0)
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.currentTime).toBe(1.8)
    expect(video.volume).toBe(0.4)
    expect(video.playbackRate).toBe(1.5)
    video.currentTime = 2.1
    projectBackgroundVideoTransport(video, { ...projection })
    expect(video.currentTime).toBe(2.1)
  })

  it('replaces stale pending seeks and wraps looping offsets only after duration is known', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 3 })
    projectBackgroundVideoTransport(video, { assetName: 'old.mp4', seekMs: 500 })
    projectBackgroundVideoTransport(video, { assetName: 'new.mp4', offsetMs: 4800, loop: true })
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.currentTime).toBeCloseTo(1.8)
    Object.defineProperty(video, 'readyState', { value: 1 })
    projectBackgroundVideoTransport(video, { assetName: 'new.mp4', seekMs: 5000, loop: false })
    expect(video.currentTime).toBe(3)
  })
})
