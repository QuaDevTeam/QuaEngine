import type { QuaViewProjection } from '@quajs/render-core'
import { createViewLayoutProjection } from '@quajs/render-core'

export function emptyView(): QuaViewProjection {
  return {
    layout: createViewLayoutProjection(),
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
