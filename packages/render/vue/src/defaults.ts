import type { QuaViewProjection } from '@quajs/render-core'

export function emptyView(): QuaViewProjection {
  return {
    characters: [],
    dialogue: {
      visible: false,
      text: '',
    },
    choices: [],
    ui: {
      visible: true,
    },
    effects: [],
    animations: [],
    plugins: {},
  }
}
