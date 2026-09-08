export const GAME_TITLE = '明天，请再一次呼唤我'
export const GAME_ENGLISH_TITLE = 'CALL ME AGAIN TOMORROW'
export const GAME_SUBTITLE = '青叶 · 2047'
export const SAVE_LOAD_SLOT_COUNT = 9
export const DEMO_TITLE_REQUEST_EVENT = 'ui/title_request'

export const DEMO_SUPPORTED_LOCALES = [
  { locale: 'zh-cn', label: '简体中文' },
] as const

export const TRUSTED_RUNTIME_KEYS: Array<{ id: string, key: JsonWebKey }> = [
  // Register public keys here before activating signed production Runtime QPKs.
]
