import type { AnimationTimingFunction, ViewCharacterProjection } from '@quajs/render-core'
import { easeProgress, projectCharacters } from '@quajs/render-core'
import { renderSceneCharacters } from '../projection'
import { defineSceneRendererPlugin } from './core'
import { createSceneProjectionTask, subscribeSceneProjection } from './projection-task'

export interface CharacterSceneRendererPluginOptions {
  boxSize?: { width: number, height: number }
  transitions?: boolean | {
    enabled?: boolean
    enterDurationMs?: number
    exitDurationMs?: number
    enterEasing?: AnimationTimingFunction
    exitEasing?: AnimationTimingFunction
  }
}

export function createCharacterSceneRendererPlugin(options: CharacterSceneRendererPluginOptions = {}) {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/character',
    setup(context) {
      const presence = new Map<string, CharacterPresenceRecord>()
      const transition = resolveCharacterTransitionOptions(options.transitions)
      let frame: number | undefined
      let disposed = false

      function cancelFrame() {
        if (frame !== undefined) {
          context.scene.host.scheduler.cancelFrame(frame)
          frame = undefined
        }
      }

      function scheduleFrame() {
        cancelFrame()
        if (disposed || !hasActivePresenceTransition(presence))
          return
        frame = context.scene.host.scheduler.requestFrame(() => {
          frame = undefined
          const scene = context.scene
          const children = scene.host.nodes.getNodeChildren?.(scene.getLayerNode('characters', 'character-layer', 30))
          if (!children) {
            sync()
            return
          }
          const now = scene.host.runtime.now()
          const projected = resolvePresenceCharacters(projectCharacters(scene.getViewState().characters, scene.getViewState().animations, now), now, presence, transition)
          for (const node of children) {
            const id = scene.host.nodes.getNodeMetadata?.(node)?.characterId
            const character = projected.characters.find(character => character.id === id)
            if (character) {
              scene.host.nodes.setNodeTransform(node, { opacity: character.opacity ?? 1 })
            }
            else {
              sync()
              return
            }
          }
          scheduleFrame()
        })
      }

      const project = createSceneProjectionTask(context, 'character', async (scene) => {
        const now = context.scene.host.runtime.now()
        const projectedCharacters = projectCharacters(scene.getViewState().characters, scene.getViewState().animations, now)
        const projected = resolvePresenceCharacters(
          projectedCharacters,
          now,
          presence,
          transition,
        )
        await renderSceneCharacters(scene, {
          characters: projected.characters,
          presencePhases: projected.phases,
          boxSize: options.boxSize,
        })
        scheduleFrame()
      }, { subscribe: false })
      // Dialogue, choices and settings updates must retain character nodes and
      // their decoded textures. Releasing them here causes native frame stalls.
      const identity = () => JSON.stringify([context.getViewState().characters, context.getViewState().background?.characterLighting, context.getViewState().animations, context.scene.getAssetRevision(), context.scene.getStageLayout()])
      let previous = identity()
      let previousAssets = context.scene.assets
      context.addDisposer(subscribeSceneProjection(context, () => {
        const next = identity()
        if (next !== previous || context.scene.assets !== previousAssets) {
          previous = next
          previousAssets = context.scene.assets
          sync()
        }
      }))
      function sync() {
        void project()
      }
      context.addDisposer(context.scene.registerAnimationSync(sync))
      context.addDisposer(() => {
        disposed = true
        cancelFrame()
        presence.clear()
      })
      sync()
    },
  })
}

export const characterSceneRendererPlugin = createCharacterSceneRendererPlugin()

interface ResolvedCharacterTransitionOptions {
  enabled: boolean
  enterDurationMs: number
  exitDurationMs: number
  enterEasing: AnimationTimingFunction
  exitEasing: AnimationTimingFunction
}

interface CharacterPresenceRecord {
  character: ViewCharacterProjection
  phase: 'enter' | 'idle' | 'exit'
  startedAt: number
  durationMs: number
}

function resolvePresenceCharacters(
  characters: readonly ViewCharacterProjection[],
  now: number,
  presence: Map<string, CharacterPresenceRecord>,
  transition: ResolvedCharacterTransitionOptions,
): { characters: readonly ViewCharacterProjection[], phases: ReadonlyMap<string, string> } {
  if (!transition.enabled) {
    presence.clear()
    return {
      characters,
      phases: new Map(characters.map(character => [character.id, 'idle'])),
    }
  }

  const visibleCharacters = characters.filter(character => character.visible !== false)
  const nextIds = new Set(visibleCharacters.map(character => character.id))
  for (const character of visibleCharacters) {
    const current = presence.get(character.id)
    if (!current || current.phase === 'exit') {
      presence.set(character.id, {
        character,
        phase: transition.enterDurationMs > 0 ? 'enter' : 'idle',
        startedAt: now,
        durationMs: transition.enterDurationMs,
      })
    }
    else {
      current.character = character
      if (current.phase === 'enter' && transitionProgress(current, now) >= 1) {
        current.phase = 'idle'
      }
    }
  }

  for (const [characterId, record] of [...presence]) {
    if (nextIds.has(characterId))
      continue
    if (record.phase !== 'exit') {
      record.phase = transition.exitDurationMs > 0 ? 'exit' : 'idle'
      record.startedAt = now
      record.durationMs = transition.exitDurationMs
    }
    if (record.durationMs <= 0 || transitionProgress(record, now) >= 1) {
      presence.delete(characterId)
    }
  }

  const phases = new Map<string, string>()
  const rendered: ViewCharacterProjection[] = []
  for (const [characterId, record] of presence) {
    const progress = transitionProgress(record, now)
    if (record.phase === 'enter' && progress >= 1) {
      record.phase = 'idle'
    }
    if (record.phase === 'exit' && progress >= 1) {
      presence.delete(characterId)
      continue
    }
    phases.set(characterId, record.phase)
    rendered.push(projectPresenceCharacter(record, progress, transition))
  }
  return { characters: rendered, phases }
}

function projectPresenceCharacter(
  record: CharacterPresenceRecord,
  progress: number,
  transition: ResolvedCharacterTransitionOptions,
): ViewCharacterProjection {
  const baseOpacity = record.character.opacity ?? 1
  if (record.phase === 'enter') {
    return { ...record.character, visible: true, opacity: baseOpacity * easeProgress(progress, transition.enterEasing) }
  }
  if (record.phase === 'exit') {
    return { ...record.character, visible: true, opacity: baseOpacity * (1 - easeProgress(progress, transition.exitEasing)) }
  }
  return record.character
}

function hasActivePresenceTransition(presence: ReadonlyMap<string, CharacterPresenceRecord>): boolean {
  return [...presence.values()].some(record => record.phase === 'enter' || record.phase === 'exit')
}

function transitionProgress(record: CharacterPresenceRecord, now: number): number {
  if (record.durationMs <= 0)
    return 1
  return Math.min(1, Math.max(0, (now - record.startedAt) / record.durationMs))
}

function resolveCharacterTransitionOptions(options: CharacterSceneRendererPluginOptions['transitions']): ResolvedCharacterTransitionOptions {
  if (options === false) {
    return {
      enabled: false,
      enterDurationMs: 0,
      exitDurationMs: 0,
      enterEasing: 'linear',
      exitEasing: 'linear',
    }
  }
  const config = typeof options === 'object' && options !== null ? options : undefined
  return {
    enabled: config?.enabled !== false,
    enterDurationMs: positiveDuration(config?.enterDurationMs, 220),
    exitDurationMs: positiveDuration(config?.exitDurationMs, 180),
    enterEasing: normalizeEasing(config?.enterEasing, 'linear'),
    exitEasing: normalizeEasing(config?.exitEasing, 'linear'),
  }
}

function positiveDuration(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeEasing(value: unknown, fallback: AnimationTimingFunction): AnimationTimingFunction {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}
