/** Narrow, data-only controls for the editor's existing Web preview session. */
export interface EditorAnimationSample {
  duration: number
  time: number
  playbackRate: number
  delay?: number
  loop?: boolean | number
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
  fill?: 'none' | 'forwards' | 'backwards' | 'both'
  self?: string
  hideDialogue: boolean
  tracks: {
    target: string
    property: string
    interpolation?: 'number' | 'step' | 'discrete'
    keyframes: { at: number, value: number, easing?: string }[]
  }[]
}

export interface EditorAnimationScene {
  path: string
  stepIndex: number
}

export interface EditorAnimationSceneResult {
  characters: { id: string, name: string }[]
  self?: string
}

export interface EditorAnimationScenePreview {
  open: (
    root: string,
    scene: EditorAnimationScene,
  ) => Promise<EditorAnimationSceneResult>
  attach: (surface?: HTMLElement) => void
  sample: (sample: EditorAnimationSample) => Promise<void>
  release: () => void
}

export function validateAnimationSample(value: EditorAnimationSample): void {
  const finite = (number: unknown, max: number, min = 0) =>
    typeof number === 'number'
    && Number.isFinite(number)
    && number >= min
    && number <= max
  if (
    !value
    || !finite(value.duration, 600000, 1)
    || !finite(value.time, 1e12)
    || !finite(value.playbackRate, 100, 0.01)
    || typeof value.hideDialogue !== 'boolean'
  ) {
    throw new Error('无效的动画预览时间。')
  }
  if (
    (value.delay !== undefined && !finite(value.delay, 600000))
    || (value.self !== undefined
      && (typeof value.self !== 'string'
        || !value.self
        || value.self.length > 160))
  ) {
    throw new Error('无效的动画预览绑定。')
  }
  if (
    value.loop !== undefined
    && typeof value.loop !== 'boolean'
    && (!Number.isInteger(value.loop) || !finite(value.loop, 1000, 1))
  ) {
    throw new Error('无效的循环次数。')
  }
  if (
    value.direction !== undefined
    && !['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(
      value.direction,
    )
  ) {
    throw new Error('无效的播放方向。')
  }
  if (
    value.fill !== undefined
    && !['none', 'forwards', 'backwards', 'both'].includes(value.fill)
  ) {
    throw new Error('无效的填充模式。')
  }
  if (!Array.isArray(value.tracks) || value.tracks.length > 64)
    throw new Error('动画轨道超过上限。')
  for (const track of value.tracks) {
    if (
      !track
      || typeof track.target !== 'string'
      || (track.target !== 'self'
        && !/^character:.{1,160}$/u.test(track.target))
      || ![
        'position.x',
        'position.y',
        'position.scale',
        'position.rotation',
        'opacity',
      ].includes(track.property)
    ) {
      throw new Error('不支持的动画目标或属性。')
    }
    if (
      track.interpolation !== undefined
      && !['number', 'step', 'discrete'].includes(track.interpolation)
    ) {
      throw new Error('不支持的插值。')
    }
    if (
      !Array.isArray(track.keyframes)
      || track.keyframes.length < 1
      || track.keyframes.length > 256
    ) {
      throw new Error('动画关键帧超过上限。')
    }
    for (const key of track.keyframes) {
      if (
        !key
        || !finite(key.at, value.duration)
        || !finite(
          key.value,
          track.property === 'opacity' ? 1 : 1e6,
          track.property === 'opacity' ? 0 : -1e6,
        )
        || (key.easing !== undefined
          && (typeof key.easing !== 'string' || key.easing.length > 128))
      ) {
        throw new Error('无效的动画关键帧。')
      }
    }
  }
}
