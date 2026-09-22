import { collectTrackValues } from '@quajs/render-core'
import { describe, expect, it } from 'vitest'
import { animationEditorIndexer } from '../src/indexing/indexer.js'
import {
  authoredProjection,
  editTimeline,
  newTimeline,
  parseTimeline,
  playbackCursor,
  previewProjection,
  sampleTrack,
  serializeTimeline,
} from '../src/model/timeline.js'

describe('animation source and shared renderer sampling', () => {
  it('round trips authored metadata and matches engine interpolation when inserting a key', () => {
    const timeline = {
      ...newTimeline('enter'),
      metadata: { author: '测试' },
      contentPackageId: 'chapter-2',
      requiredRuntimePackages: ['chapter-1'],
    }
    expect(parseTimeline(serializeTimeline(timeline))).toEqual(timeline)
    expect(sampleTrack(timeline, 0, 500)).toBe(960)
    const next = editTimeline(timeline, (draft) => {
      draft.tracks[0].keyframes.push({
        at: 500,
        value: sampleTrack(timeline, 0, 500),
      })
    })
    expect(next.tracks[0].keyframes).toHaveLength(3)
    expect(timeline.tracks[0].keyframes).toHaveLength(2)
  })

  it('distinguishes authored scrubbing from actual delay, playback rate, alternate and fill', () => {
    const timeline = {
      ...newTimeline(),
      delay: 200,
      playbackRate: 2,
      loop: 2,
      direction: 'alternate' as const,
    }
    const sample = (animation: ReturnType<typeof previewProjection>) =>
      collectTrackValues([animation], 'character:self', 12345)[0].value
    expect(sample(previewProjection(timeline, 50))).toBe(640)
    expect(sample(previewProjection(timeline, 350))).toBe(960)
    expect(sample(previewProjection(timeline, 850))).toBe(960)
    expect(sample(previewProjection(timeline, 1100))).toBe(640)
    expect(sample(authoredProjection(timeline, 1000))).toBe(1280)
    expect(playbackCursor(timeline, 850)).toBe(500)
    expect(playbackCursor(timeline, 1100)).toBe(0)
  })

  it('rejects edits that would lose unsupported source data, poison paths or collide keys', () => {
    const timeline = newTimeline()
    for (const edit of [
      (draft: any) => {
        draft.tracks[0].property = '__proto__.polluted'
      },
      (draft: any) => {
        draft.tracks[0].keyframes[1].at = 0
      },
      (draft: any) => {
        draft.tracks[0].keyframes[1].at = '100%'
      },
      (draft: any) => {
        draft.tracks[0].unknown = true
      },
      (draft: any) => {
        draft.tracks[0].keyframes[0].value = Infinity
      },
      (draft: any) => {
        draft.duration = 100
      },
      (draft: any) => {
        draft.tracks[0].keyframes[1].easing = 'cubic-bezier(2, 0, 0, 1)'
      },
    ])
      expect(() => editTimeline(timeline, edit)).toThrow()
    expect(timeline).toEqual(newTimeline())
    expect(({} as any).polluted).toBeUndefined()
  })

  it('indexes only animation source files with exact revision guards and per-file errors', async () => {
    const good = serializeTimeline(newTimeline())
    const result = (await animationEditorIndexer.index({
      root: '/game',
      entries: [
        'move.animation.json',
        'bad.animation.json',
        'unrelated.json',
      ].map(path => ({ path, kind: 'document', size: 100, modified: 0 })),
      readDocument: async path => ({
        path,
        revision: 'hash',
        text: path.startsWith('move') ? good : '{invalid',
      }),
    })) as any
    expect(result.animations).toHaveLength(1)
    expect(result.animations[0].edit).toEqual({
      root: '/game',
      path: 'move.animation.json',
      revision: 'hash',
      start: 0,
      end: good.length,
      expectedText: good,
    })
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toContain('bad.animation.json')
  })
})
