import type { QuaEngine } from '@quajs/engine'
import type {
  EditorAnimationSample,
  EditorAnimationSceneResult,
} from './animation.js'
import { validateAnimationSample } from './animation.js'

const id = 'editor:animation-preview'

/** Engine owns all preview writes; renderer remains an ordinary pipeline projection. */
export function createAnimationSceneRuntime(engine: QuaEngine) {
  let dialogue: ReturnType<QuaEngine['getViewState']>['dialogue'] | undefined
  let hidden = false
  let point: string | undefined
  const currentPoint = () => JSON.stringify(engine.getStoryPoint())
  const describe = (): EditorAnimationSceneResult => {
    const view = engine.getViewState()
    const characters = view.characters
      .filter(character => character.visible)
      .map(character => ({
        id: character.id,
        name: character.name || character.id,
      }))
    const speaker = (dialogue ?? view.dialogue).characterId
    return {
      characters,
      self: characters.some(character => character.id === speaker)
        ? speaker
        : characters[0]?.id,
    }
  }
  return {
    describe,
    async sample(
      sample: EditorAnimationSample,
    ): Promise<EditorAnimationSceneResult> {
      validateAnimationSample(sample)
      if (point !== undefined && point !== currentPoint())
        throw new Error('剧情位置已变化，请重新载入动画预览场景。')
      const state = describe()
      const self = sample.self ?? state.self
      const targets = new Set(
        engine.getViewState().characters.map(character => character.id),
      )
      const tracks = sample.tracks.map((track) => {
        const target
          = track.target === 'self' ? self && `character:${self}` : track.target
        if (!target || !targets.has(target.slice('character:'.length))) {
          throw new Error(
            `场景中没有动画目标 ${track.target}，请选择 self 绑定或其他场景。`,
          )
        }
        return { ...track, target }
      })
      dialogue ??= structuredClone(engine.getViewState().dialogue)
      point ??= currentPoint()
      await engine.stopAuto()
      await engine.stopSkip()
      if (sample.hideDialogue !== hidden) {
        if (sample.hideDialogue) {
          await engine.hideDialogue()
        }
        else if (dialogue.visible) {
          await engine.showDialogue({
            ...dialogue,
            typewriter: { ...dialogue.typewriter, enabled: false },
          })
        }
        hidden = sample.hideDialogue
      }
      await engine.setAnimationProjection({
        id,
        state: 'paused',
        startedAt: 0,
        pausedAt: sample.time,
        duration: sample.duration,
        playbackRate: sample.playbackRate,
        delay: sample.delay,
        loop: sample.loop,
        direction: sample.direction,
        fill: sample.fill,
        commit: 'none',
        resolvedTracks: tracks,
      })
      return state
    },
    async release(): Promise<void> {
      if (!dialogue)
        return
      await engine.removeAnimationProjection(id)
      if (hidden && dialogue.visible && point === currentPoint()) {
        await engine.showDialogue({
          ...dialogue,
          typewriter: { ...dialogue.typewriter, enabled: false },
        })
      }
      hidden = false
      dialogue = undefined
      point = undefined
    },
  }
}
