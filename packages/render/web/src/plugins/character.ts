import type { AnimationTimingFunction, ViewCharacterProjection } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { runtimePackageCandidatesFromMetadata } from '../assets'
import { characterProjectionVars, projectCharacters, resolveCharacterPositionAnchor } from '../projection'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars, assignData } from './shared'
import { updateSpriteLayerAnimations } from './sprite'
import { characterLightingSvg, createCharacterLightingId, createCharacterLightingSvgElement } from './character-lighting'

export { characterLightingSvg, createCharacterLightingId, createCharacterLightingSvgElement } from './character-lighting'
export type { CharacterLightingSvgNode } from './character-lighting'

export interface CharacterTransitionOptions {
  enabled?: boolean
  enterDurationMs?: number
  exitDurationMs?: number
  moveDurationMs?: number
  enterEasing?: AnimationTimingFunction
  exitEasing?: AnimationTimingFunction
  moveEasing?: AnimationTimingFunction
}

export type CharacterTransitionConfig = boolean | CharacterTransitionOptions

export interface ResolvedCharacterTransitionOptions {
  enabled: boolean
  enterDurationMs: number
  exitDurationMs: number
  moveDurationMs: number
  enterEasing: AnimationTimingFunction
  exitEasing: AnimationTimingFunction
  moveEasing: AnimationTimingFunction
}

export type CharacterPresencePhase = 'enter' | 'idle' | 'exit'

export interface CharacterWebRendererPluginOptions {
  renderSprite?: (context: QuaWebDomLayerContext, character: Readonly<ViewCharacterProjection>) => Node | null | undefined
  transitions?: CharacterTransitionConfig
}

interface RenderedCharacterPresence {
  character: ViewCharacterProjection
  phase: CharacterPresencePhase
  removeTimer?: ReturnType<typeof setTimeout>
}

interface CharacterRendererState {
  rendered: Map<string, RenderedCharacterPresence>
}

export function createCharacterWebRendererPlugin(options: CharacterWebRendererPluginOptions = {}): QuaWebDomRendererPlugin {
  const state: CharacterRendererState = {
    rendered: new Map(),
  }
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/character',
    setup() {},
    layers: [{
      id: 'characters',
      order: 30,
      plane: 'subject',
      render: context => renderCharacterLayer(context, options, state),
      update: updateCharacterLayer,
    }],
  })
}

export const characterWebRendererPlugin = createCharacterWebRendererPlugin()

function renderCharacterLayer(
  context: QuaWebDomLayerContext,
  options: CharacterWebRendererPluginOptions,
  state: CharacterRendererState,
): Node {
  const transition = resolveCharacterTransitionOptions(options.transitions)
  const layer = context.document.createElement('div')
  layer.className = 'qua-character-layer'
  layer.setAttribute('data-character-transitions', transition.enabled ? 'enabled' : 'disabled')
  layer.style.setProperty('--qua-character-enter-duration', `${transition.enterDurationMs}ms`)
  layer.style.setProperty('--qua-character-exit-duration', `${transition.exitDurationMs}ms`)
  layer.style.setProperty('--qua-character-move-duration', `${transition.moveDurationMs}ms`)
  layer.style.setProperty('--qua-character-enter-easing', transition.enterEasing)
  layer.style.setProperty('--qua-character-exit-easing', transition.exitEasing)
  layer.style.setProperty('--qua-character-move-easing', transition.moveEasing)
  const characters = projectCharacters(context.view.characters, context.view.animations, Date.now())
  const rendered = transition.enabled
    ? resolveRenderedCharacters(context, state, characters, transition.exitDurationMs)
    : characters.map(character => ({ character, phase: 'idle' as const }))

  for (const item of rendered) {
    layer.append(renderCharacterRoot(context, options, item.character, item.phase))
  }
  return layer
}

function updateCharacterLayer(context: QuaWebDomLayerContext, node: Node): void {
  if (!(node instanceof HTMLElement)) {
    return
  }
  const characters = projectCharacters(context.view.characters, context.view.animations, Date.now())
  for (const character of characters) {
    const element = findCharacterElement(node, character.id)
    if (!element) {
      continue
    }
    element.className = ['qua-character', character.visible ? 'is-visible' : 'is-hidden'].join(' ')
    assignData(element, 'data-character-anchor', resolveCharacterPositionAnchor(character.position))
    assignData(element, 'data-character-x', character.position?.x)
    assignData(element, 'data-character-y', character.position?.y)
    assignData(element, 'data-character-scale', character.position?.scale)
    assignData(element, 'data-character-rotation', character.position?.rotation)
    assignData(element, 'data-character-layer', character.layer)
    applyStyleVars(element, characterProjectionVars(character))
    updateSpriteLayerAnimations(element, context.view.animations, Date.now())
  }
}

function renderCharacterRoot(
  context: QuaWebDomLayerContext,
  options: CharacterWebRendererPluginOptions,
  character: ViewCharacterProjection,
  phase: RenderedCharacterPresence['phase'],
): HTMLElement {
  const root = context.document.createElement('div')
  root.className = ['qua-character', character.visible ? 'is-visible' : 'is-hidden'].join(' ')
  root.setAttribute('data-character-id', character.id)
  root.setAttribute('data-character-presence', phase)
  root.setAttribute('data-character-visible', character.visible ? 'true' : 'false')
  assignData(root, 'data-character-anchor', resolveCharacterPositionAnchor(character.position))
  assignData(root, 'data-character-x', character.position?.x)
  assignData(root, 'data-character-y', character.position?.y)
  assignData(root, 'data-character-scale', character.position?.scale)
  assignData(root, 'data-character-rotation', character.position?.rotation)
  assignData(root, 'data-character-layer', character.layer)
  root.setAttribute('aria-hidden', 'true')
  applyStyleVars(root, characterProjectionVars(character))

  if (character.sprite && character.visible) {
    const id = createCharacterLightingId()
    const lighting = characterLightingSvg(id, context.view.background?.characterLighting)
    if (lighting) {
      root.append(createCharacterLightingSvgElement(context.document, lighting))
      root.style.filter = `url(#${id})`
      root.setAttribute('data-character-lighting', 'graded')
    }
  }

  if (character.sprite) {
    const sprite = options.renderSprite?.(context, character)
    if (sprite) {
      root.append(sprite)
    }
    else {
      const image = context.document.createElement('img')
      image.className = 'qua-character-sprite'
      image.alt = character.name
      context.bindAssetUrl(image, 'characters', character.sprite, 'src', runtimePackageCandidatesFromMetadata(character.metadata))
      root.append(image)
    }
  }

  return root
}

function resolveRenderedCharacters(
  context: QuaWebDomLayerContext,
  state: CharacterRendererState,
  characters: readonly ViewCharacterProjection[],
  exitDurationMs: number,
): RenderedCharacterPresence[] {
  const visibleCharacters = characters.filter(character => character.visible !== false)
  const nextIds = new Set(visibleCharacters.map(character => character.id))

  for (const character of visibleCharacters) {
    const existing = state.rendered.get(character.id)
    if (existing?.removeTimer) {
      clearTimeout(existing.removeTimer)
    }
    const phase = !existing || existing.phase === 'exit' || (!existing.character.visible && character.visible)
      ? 'enter'
      : 'idle'
    state.rendered.set(character.id, {
      character,
      phase,
    })
  }

  for (const item of [...state.rendered.values()]) {
    if (nextIds.has(item.character.id) || item.phase === 'exit') {
      continue
    }
    item.phase = 'exit'
    item.removeTimer = setTimeout(() => {
      const current = state.rendered.get(item.character.id)
      if (current === item) {
        state.rendered.delete(item.character.id)
        context.renderer.render()
      }
    }, exitDurationMs)
  }

  return [...state.rendered.values()]
}

export function resolveCharacterTransitionOptions(options: CharacterTransitionConfig | undefined): ResolvedCharacterTransitionOptions {
  if (options === false) {
    return {
      enabled: false,
      enterDurationMs: 0,
      exitDurationMs: 0,
      moveDurationMs: 0,
      enterEasing: 'linear',
      exitEasing: 'linear',
      moveEasing: 'linear',
    }
  }
  const config = typeof options === 'object' && options !== null ? options : undefined
  return {
    enabled: config?.enabled !== false,
    enterDurationMs: positiveDuration(config?.enterDurationMs, 220),
    exitDurationMs: positiveDuration(config?.exitDurationMs, 180),
    moveDurationMs: positiveDuration(config?.moveDurationMs, 220),
    enterEasing: normalizeEasing(config?.enterEasing, 'ease'),
    exitEasing: normalizeEasing(config?.exitEasing, 'ease'),
    moveEasing: normalizeEasing(config?.moveEasing, 'ease'),
  }
}

function positiveDuration(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

function normalizeEasing(value: unknown, fallback: AnimationTimingFunction): AnimationTimingFunction {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function findCharacterElement(root: HTMLElement, characterId: string): HTMLElement | undefined {
  for (const element of root.querySelectorAll('[data-character-id]')) {
    if (element instanceof HTMLElement && element.dataset.characterId === characterId) {
      return element
    }
  }
  return undefined
}
