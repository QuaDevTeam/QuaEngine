import type { AnimationTimingFunction, ViewCharacterProjection } from '@quajs/render-core'
import { easeProgress, LogicToRenderEvents, projectCharacters } from '@quajs/render-core'
import { renderCocosCharacters } from '../projection'
import { defineCocosRendererPlugin } from './core'

export interface CharacterCocosRendererPluginOptions {
  transitions?: boolean | {
    enabled?: boolean
    enterDurationMs?: number
    exitDurationMs?: number
    enterEasing?: AnimationTimingFunction
    exitEasing?: AnimationTimingFunction
  }
}

export function createCharacterCocosRendererPlugin(options: CharacterCocosRendererPluginOptions = {}) {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/character',
    setup(context) {
      const presence = new Map<string, CharacterPresenceRecord>()
      const transition = resolveCharacterTransitionOptions(options.transitions)
      let frame: number | undefined
      const cancelFrame = () => {
        if (frame !== undefined) {
          context.cocos.host.scheduler.cancelFrame(frame)
          frame = undefined
        }
      }
      const scheduleFrame = () => {
        cancelFrame()
        if (!hasActivePresenceTransition(presence))
          return
        frame = context.cocos.host.scheduler.requestFrame(() => {
          frame = undefined
          sync()
        })
      }
      const sync = () => {
        const now = context.cocos.host.runtime.now()
        const projectedCharacters = projectCharacters(context.getViewState().characters, context.getViewState().animations, now)
        const projected = resolvePresenceCharacters(
          projectedCharacters,
          now,
          presence,
          transition,
        )
        void renderCocosCharacters(context.cocos, {
          characters: projected.characters,
          presencePhases: projected.phases,
        }).then(() => scheduleFrame()).catch(error => context.reportError(error, {
          message: 'Cocos character projection failed.',
          phase: 'renderer-cocos:character',
          pluginName: '@quajs/renderer-cocos/character',
        }))
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, sync))
      context.addDisposer(context.cocos.registerAnimationSync(sync))
      context.addDisposer(() => {
        cancelFrame()
        presence.clear()
      })
      sync()
    },
  })
}

export const characterCocosRendererPlugin = createCharacterCocosRendererPlugin()

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

function resolveCharacterTransitionOptions(options: CharacterCocosRendererPluginOptions['transitions']): ResolvedCharacterTransitionOptions {
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
