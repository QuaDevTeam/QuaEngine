import type { ActiveAnimationProjection, ViewCharacterProjection } from '@quajs/render-core'
import { computed, defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useCharacters, useRendererActions } from '../../composables'
import { QuaSprite } from '../sprite'
import { applyTrackValues, cloneCharacter, collectTrackValues } from '../shared/animation'

export const QuaCharacter = defineComponent({
  name: 'QuaCharacter',
  props: {
    character: {
      type: Object,
      required: true,
    },
  },
  setup(props: any) {
    const className = computed(() => ['qua-character', props.character.visible ? 'is-visible' : 'is-hidden'])
    const sharedAttrs = () => ({
      'class': className.value,
      'data-character-id': props.character.id,
      'data-character-anchor': props.character.position?.anchor,
      'data-character-x': props.character.position?.x,
      'data-character-y': props.character.position?.y,
      'data-character-scale': props.character.position?.scale,
      'data-character-rotation': props.character.position?.rotation,
      'data-character-layer': props.character.layer,
      'style': characterProjectionVars(props.character),
      'aria-hidden': 'true',
    })

    return () => props.character.sprite
      ? h(QuaSprite, {
          ...sharedAttrs(),
          alt: props.character.name,
          sprite: props.character.sprite,
          expression: props.character.expression,
        })
      : h('div', sharedAttrs())
  },
})

export const QuaCharacterLayer = defineComponent({
  name: 'QuaCharacterLayer',
  setup(_, { slots }) {
    const characters = useCharacters()
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const actions = useRendererActions()
    const projectedCharacters = computed(() => characters.value.map(character => projectCharacter(character, animations.value, animationNow.value)))
    return () => h('div', { class: 'qua-character-layer' }, slots.default?.({ ...useProjectionProps(), characters: characters.value, actions }) || projectedCharacters.value.map(character =>
      slots.character?.({ ...useProjectionProps(), character, actions }) || h(QuaCharacter, { key: character.id, character }),
    ))
  },
})

function projectCharacter(
  character: Readonly<ViewCharacterProjection>,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewCharacterProjection {
  const tracks = collectTrackValues(animations, `character:${character.id}`, now)
  if (tracks.length === 0)
    return character as ViewCharacterProjection

  const next = cloneCharacter(character)
  applyTrackValues(next as unknown as Record<string, unknown>, tracks)
  return next
}

function characterProjectionVars(character: any): Record<string, string | number> | undefined {
  const position = character.position || {}
  const vars: Record<string, string | number> = {}
  assignVar(vars, '--qua-character-x', position.x)
  assignVar(vars, '--qua-character-y', position.y)
  assignVar(vars, '--qua-character-scale', position.scale)
  assignVar(vars, '--qua-character-rotation', position.rotation)
  assignVar(vars, '--qua-character-layer', character.layer)
  assignVar(vars, '--qua-character-opacity', character.opacity)
  return Object.keys(vars).length ? vars : undefined
}

function assignVar(vars: Record<string, string | number>, name: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    vars[name] = value as string | number
  }
}
