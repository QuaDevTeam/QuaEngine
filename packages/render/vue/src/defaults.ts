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
    audio: {
      volumeSettings: {
        master: 1,
        bgm: 1,
        sound: 1,
        voice: 1,
      },
      sounds: [],
      voices: [],
    },
  }
}
