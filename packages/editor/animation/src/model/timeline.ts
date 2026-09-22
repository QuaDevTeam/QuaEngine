import type {
  AnimationKeyframe,
  AnimationTimeline,
  AnimationTrack,
} from '@quajs/plugin-animation'
import type { ActiveAnimationProjection } from '@quajs/render-core'
import { collectTrackValues } from '@quajs/render-core'

export const properties = {
  'position.x': { title: '位置 X', initial: 960 },
  'position.y': { title: '位置 Y', initial: 540 },
  'position.scale': { title: '缩放', initial: 1 },
  'position.rotation': { title: '旋转', initial: 0 },
  'opacity': { title: '透明度', initial: 1 },
} as const
export const easings = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
]
export const MAX_DURATION = 600000
export type Property = keyof typeof properties

/** Validate a deliberately bounded numeric character timeline; never discard unknown authored fields. */
export function parseTimeline(text: string): AnimationTimeline {
  if (text.length > 512 * 1024 || new TextEncoder().encode(text).byteLength > 512 * 1024)
    throw new Error('动画文件超过 512 KiB。')
  const value = JSON.parse(text)
  const record = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
  const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value)
  const only = (value: Record<string, unknown>, keys: string[]) => {
    if (Object.keys(value).some(key => !keys.includes(key)))
      throw new Error('动画含当前可视化编辑器不支持的字段，请在源码中编辑。')
  }
  if (!record(value))
    throw new Error('动画必须是时间轴对象。')
  only(value, [
    'id',
    'duration',
    'tracks',
    'delay',
    'playbackRate',
    'loop',
    'fill',
    'direction',
    'commit',
    'metadata',
    'contentPackageId',
    'requiredRuntimePackages',
  ])
  const packageId = (id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 256
  if (value.contentPackageId !== undefined && !packageId(value.contentPackageId))
    throw new Error('无效的内容包 ID。')
  if (value.requiredRuntimePackages !== undefined && (!Array.isArray(value.requiredRuntimePackages) || value.requiredRuntimePackages.length > 128 || !value.requiredRuntimePackages.every(packageId)))
    throw new Error('无效的运行时包依赖。')
  if (value.metadata !== undefined && !record(value.metadata))
    throw new Error('metadata 必须是对象。')
  if (
    typeof value.id !== 'string'
    || !value.id.trim()
    || value.id.length > 160
    || !finite(value.duration)
    || value.duration < 1
    || value.duration > MAX_DURATION
  ) {
    throw new Error('动画需要 ID 和 1–600000 ms 的时长。')
  }
  if (!Array.isArray(value.tracks) || value.tracks.length > 64)
    throw new Error('最多支持 64 条轨道。')
  if (
    value.delay !== undefined
    && (!finite(value.delay) || value.delay < 0 || value.delay > MAX_DURATION)
  ) {
    throw new Error('无效的延迟。')
  }
  if (
    value.playbackRate !== undefined
    && (!finite(value.playbackRate)
      || value.playbackRate < 0.01
      || value.playbackRate > 100)
  ) {
    throw new Error('无效的播放速度。')
  }
  if (
    value.loop !== undefined
    && typeof value.loop !== 'boolean'
    && (!Number.isInteger(value.loop)
      || Number(value.loop) < 1
      || Number(value.loop) > 1000)
  ) {
    throw new Error('无效的循环次数。')
  }
  for (const [key, options] of Object.entries({
    fill: ['none', 'forwards', 'backwards', 'both'],
    direction: ['normal', 'reverse', 'alternate', 'alternate-reverse'],
    commit: ['none', 'final'],
  })) {
    if (value[key] !== undefined && !options.includes(String(value[key])))
      throw new Error(`不支持的 ${key}，请在源码中编辑。`)
  }
  const pairs = new Set<string>()
  for (const track of value.tracks) {
    if (!record(track))
      throw new Error('无效的轨道。')
    only(track, ['target', 'property', 'interpolation', 'keyframes'])
    if (
      track.target !== undefined
      && (typeof track.target !== 'string'
        || (track.target !== 'self' && !/^character:.{1,160}$/.test(track.target)))
    ) {
      throw new Error('当前预览支持 self 与 character:<id> 目标。')
    }
    if (
      typeof track.property !== 'string'
      || !Object.hasOwn(properties, track.property)
    ) {
      throw new Error('当前预览支持角色位置、缩放、旋转与透明度。')
    }
    const pair = `${track.target ?? 'self'}/${track.property}`
    if (pairs.has(pair))
      throw new Error('同一目标的属性轨道不能重复。')
    pairs.add(pair)
    if (
      track.interpolation !== undefined
      && !['number', 'step', 'discrete'].includes(String(track.interpolation))
    ) {
      throw new Error('当前编辑器仅支持数值或阶梯插值。')
    }
    if (
      !Array.isArray(track.keyframes)
      || !track.keyframes.length
      || track.keyframes.length > 256
    ) {
      throw new Error('每条轨道需要 1–256 个关键帧。')
    }
    const times = new Set<number>()
    for (const key of track.keyframes) {
      if (!record(key))
        throw new Error('无效的关键帧。')
      only(key, ['at', 'value', 'easing'])
      if (
        !finite(key.at)
        || key.at < 0
        || key.at > value.duration
        || times.has(key.at)
      ) {
        throw new Error(
          '关键帧时间须在时长内且不能重复；百分比时间请在源码中编辑。',
        )
      }
      times.add(key.at)
      if (
        !finite(key.value)
        || Math.abs(key.value) > 1000000
        || (track.property === 'opacity' && (key.value < 0 || key.value > 1))
      ) {
        throw new Error('关键帧数值无效；透明度范围为 0–1。')
      }
      if (
        key.easing !== undefined
        && (typeof key.easing !== 'string' || !validEasing(key.easing))
      ) {
        throw new Error(
          '请选择缓动函数或有效的 cubic-bezier(x1, y1, x2, y2)。',
        )
      }
    }
  }
  return value as unknown as AnimationTimeline
}

function validEasing(value: string): boolean {
  if (easings.includes(value))
    return true
  const match = value.match(
    /^cubic-bezier\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)$/,
  )
  return Boolean(
    match
    && match.slice(1).every(number => Number.isFinite(Number(number)))
    && [Number(match[1]), Number(match[3])].every(
      number => number >= 0 && number <= 1,
    ),
  )
}

export function serializeTimeline(timeline: AnimationTimeline): string {
  return `${JSON.stringify(parseTimeline(JSON.stringify(timeline)), null, 2)}\n`
}

export function newTimeline(id = 'animation'): AnimationTimeline {
  return {
    id,
    duration: 1000,
    commit: 'none',
    fill: 'both',
    tracks: [
      {
        target: 'self',
        property: 'position.x',
        interpolation: 'number',
        keyframes: [
          { at: 0, value: 640 },
          { at: 1000, value: 1280, easing: 'ease-in-out' },
        ],
      },
    ],
  }
}

export function previewProjection(
  timeline: AnimationTimeline,
  time: number,
): ActiveAnimationProjection {
  return {
    ...timeline,
    id: 'editor-preview',
    state: 'paused',
    startedAt: 0,
    pausedAt: time,
    playbackRate: timeline.playbackRate ?? 1,
    resolvedTracks: timeline.tracks.map(track => ({
      ...track,
      // Keep self and a real character named self distinct inside the isolated preview.
      target: `character:${track.target ?? 'self'}`,
    })),
  }
}

/** Reuse runtime timing math for the displayed playhead, even for reverse/alternate loops. */
export function playbackCursor(timeline: AnimationTimeline, wallTime: number): number {
  const projection = previewProjection({ ...timeline, fill: 'both' }, wallTime)
  projection.resolvedTracks = [{ target: 'editor-clock', property: 'time', interpolation: 'number', keyframes: [{ at: 0, value: 0 }, { at: timeline.duration, value: timeline.duration }] }]
  return Number(collectTrackValues([projection], 'editor-clock', 0)[0]?.value ?? 0)
}

/** Scrubbing edits authored time, independently of the playback delay/rate/direction. */
export function authoredProjection(
  timeline: AnimationTimeline,
  time: number,
): ActiveAnimationProjection {
  return previewProjection(
    {
      ...timeline,
      delay: 0,
      playbackRate: 1,
      direction: 'normal',
      loop: false,
      fill: 'both',
    },
    time,
  )
}

export function sampleTrack(
  timeline: AnimationTimeline,
  index: number,
  time: number,
): number {
  const track = timeline.tracks[index]
  const projection = authoredProjection(timeline, time)
  return Number(
    collectTrackValues(
      [projection],
      projection.resolvedTracks[index].target,
      0,
    ).find(value => value.property === track.property)?.value
    ?? properties[track.property as Property].initial,
  )
}

type MutableTimeline = Omit<AnimationTimeline, 'tracks'> & {
  tracks: (Omit<AnimationTrack, 'keyframes'> & {
    keyframes: AnimationKeyframe[]
  })[]
}

export function editTimeline(
  timeline: AnimationTimeline,
  edit: (draft: MutableTimeline) => void,
): AnimationTimeline {
  const draft = JSON.parse(JSON.stringify(timeline))
  edit(draft)
  return parseTimeline(JSON.stringify(draft))
}
