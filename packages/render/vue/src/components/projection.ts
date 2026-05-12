import { useQuaRenderer } from '../context'

export function projectionProps() {
  return {
    view: Object,
    layout: Object,
    background: Object,
    characters: Array,
    dialogue: Object,
    choices: Array,
    effects: Array,
    animations: Array,
    plugins: Object,
    actions: Object,
  }
}

export function useProjectionProps() {
  const { view } = useQuaRenderer()
  return {
    view: view.value,
    layout: view.value.layout,
    background: view.value.background,
    characters: view.value.characters,
    dialogue: view.value.dialogue,
    choices: view.value.choices,
    effects: view.value.effects,
    animations: view.value.animations,
    plugins: view.value.plugins,
  }
}
