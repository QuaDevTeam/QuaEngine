import { characterProjectionVars, projectCharacter, runtimePackageCandidatesFromMetadata } from '@quajs/renderer-web'
import { computed, defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useCharacters, useRendererActions } from '../../composables'
import { QuaSprite } from '../sprite'

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
          animationTargetPrefix: props.character.id,
          targetPackageIds: runtimePackageCandidatesFromMetadata(props.character.metadata),
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
    return () => h('div', { class: 'qua-character-layer' }, slots.default?.({ ...useProjectionProps(), characters: projectedCharacters.value, actions }) || projectedCharacters.value.map(character =>
      slots.character?.({ ...useProjectionProps(), character, actions }) || h(QuaCharacter, { key: character.id, character }),
    ))
  },
})
