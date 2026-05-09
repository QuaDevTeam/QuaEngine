import { useQuaRenderer } from '../context'

export function projectionProps() {
  return {
    view: Object,
    background: Object,
    characters: Array,
    dialogue: Object,
    choices: Array,
    audio: Object,
    effects: Array,
    animations: Array,
    actions: Object,
  }
}

export function useProjectionProps() {
  const { view } = useQuaRenderer()
  return {
    view: view.value,
    background: view.value.background,
    characters: view.value.characters,
    dialogue: view.value.dialogue,
    choices: view.value.choices,
    audio: view.value.audio,
    effects: view.value.effects,
    animations: view.value.animations,
  }
}
