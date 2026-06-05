import type { ViewCharacterProjection } from '@quajs/render-core'
import type { CharacterPresencePhase, CharacterTransitionConfig } from '@quajs/renderer-web/plugins/character'
import { resolveSpriteReference } from '@quajs/plugin-sprite/contracts'
import { characterProjectionVars, projectCharacter, resolveCharacterPositionAnchor, runtimePackageCandidatesFromMetadata } from '@quajs/renderer-web'
import { resolveCharacterTransitionOptions } from '@quajs/renderer-web/plugins/character'
import { computed, defineComponent, h, onBeforeUnmount, ref, watch } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useCharacters, useRendererActions } from '../../composables'
import { QuaSprite } from '../sprite'

export interface CharacterVueRendererLayerOptions {
  transitions?: CharacterTransitionConfig
}

interface RenderedCharacterPresence {
  id: string
  character: ViewCharacterProjection
  phase: CharacterPresencePhase
  removeTimer?: ReturnType<typeof setTimeout>
}

export const QuaCharacter = defineComponent({
  name: 'QuaCharacter',
  props: {
    character: {
      type: Object,
      required: true,
    },
    presence: {
      type: String,
      default: 'idle',
    },
  },
  setup(props: any) {
    const className = computed(() => ['qua-character', props.character.visible ? 'is-visible' : 'is-hidden'])
    const spriteReference = computed(() => resolveSpriteReference(props.character.sprite))
    const sharedAttrs = () => ({
      'class': className.value,
      'data-character-id': props.character.id,
      'data-character-presence': props.presence,
      'data-character-visible': props.character.visible ? 'true' : 'false',
      'data-character-anchor': resolveCharacterPositionAnchor(props.character.position),
      'data-character-x': props.character.position?.x,
      'data-character-y': props.character.position?.y,
      'data-character-scale': props.character.position?.scale,
      'data-character-rotation': props.character.position?.rotation,
      'data-character-layer': props.character.layer,
      'data-sprite-family': spriteReference.value?.family,
      'data-sprite': spriteReference.value?.asset ?? props.character.sprite,
      'data-sprite-expression': props.character.expression || '',
      'style': characterProjectionVars(props.character),
      'aria-hidden': 'true',
    })

    return () => h('div', sharedAttrs(), props.character.sprite
      ? [
          h(QuaSprite, {
            alt: props.character.name,
            sprite: props.character.sprite,
            expression: props.character.expression,
            animationTargetPrefix: props.character.id,
            targetPackageIds: runtimePackageCandidatesFromMetadata(props.character.metadata),
          }),
        ]
      : undefined)
  },
})

export const QuaCharacterLayer = defineComponent({
  name: 'QuaCharacterLayer',
  props: {
    transitions: {
      type: [Boolean, Object],
      default: undefined,
    },
  },
  setup(props: CharacterVueRendererLayerOptions, { slots }) {
    const characters = useCharacters()
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const actions = useRendererActions()
    const projectedCharacters = computed(() => characters.value.map(character => projectCharacter(character, animations.value, animationNow.value)))
    const renderedCharacters = ref<RenderedCharacterPresence[]>([])
    const transition = computed(() => resolveCharacterTransitionOptions(props.transitions))

    watch(projectedCharacters, (nextCharacters) => {
      renderedCharacters.value = resolveRenderedCharacters(
        renderedCharacters.value,
        nextCharacters,
        transition.value,
        (item, durationMs) => {
          item.removeTimer = setTimeout(() => {
            renderedCharacters.value = renderedCharacters.value.filter(current => current !== item)
          }, durationMs)
        },
      )
    }, { immediate: true })

    onBeforeUnmount(() => {
      for (const item of renderedCharacters.value) {
        if (item.removeTimer) {
          clearTimeout(item.removeTimer)
        }
      }
    })

    return () => h('div', {
      'class': 'qua-character-layer',
      'data-character-transitions': transition.value.enabled ? 'enabled' : 'disabled',
      'style': {
        '--qua-character-enter-duration': `${transition.value.enterDurationMs}ms`,
        '--qua-character-exit-duration': `${transition.value.exitDurationMs}ms`,
        '--qua-character-move-duration': `${transition.value.moveDurationMs}ms`,
        '--qua-character-enter-easing': transition.value.enterEasing,
        '--qua-character-exit-easing': transition.value.exitEasing,
        '--qua-character-move-easing': transition.value.moveEasing,
      },
    }, slots.default?.({ ...useProjectionProps(), characters: renderedCharacters.value.map(item => item.character), actions }) || renderedCharacters.value.map(item =>
      slots.character?.({ ...useProjectionProps(), character: item.character, presence: item.phase, actions }) || h(QuaCharacter, { key: item.id, character: item.character, presence: item.phase }),
    ))
  },
})

function resolveRenderedCharacters(
  current: readonly RenderedCharacterPresence[],
  nextCharacters: readonly ViewCharacterProjection[],
  transition: ReturnType<typeof resolveCharacterTransitionOptions>,
  scheduleRemove: (item: RenderedCharacterPresence, durationMs: number) => void,
): RenderedCharacterPresence[] {
  if (!transition.enabled) {
    return nextCharacters.map(character => ({
      id: character.id,
      character,
      phase: 'idle',
    }))
  }

  const visibleCharacters = nextCharacters.filter(character => character.visible !== false)
  const nextIds = new Set(visibleCharacters.map(character => character.id))
  const byId = new Map(current.map(item => [item.id, item]))
  const rendered = [...current]

  for (const character of visibleCharacters) {
    const existing = byId.get(character.id)
    if (existing) {
      if (existing.removeTimer) {
        clearTimeout(existing.removeTimer)
      }
      const wasVisible = existing.character.visible !== false
      existing.character = character
      existing.phase = existing.phase === 'exit' || (!wasVisible && character.visible !== false) ? 'enter' : 'idle'
      existing.removeTimer = undefined
    }
    else {
      rendered.push({
        id: character.id,
        character,
        phase: 'enter',
      })
    }
  }

  for (const item of rendered) {
    if (nextIds.has(item.id) || item.phase === 'exit') {
      continue
    }
    item.phase = 'exit'
    scheduleRemove(item, transition.exitDurationMs)
  }

  return rendered.filter(item => nextIds.has(item.id) || item.phase === 'exit')
}
