import type { AudioPlayBgmOptions } from '@quajs/plugin-audio'

export const GAME_TITLE = '断链纪元'
export const GAME_ENGLISH_TITLE = 'BROKEN LINK ERA'
export const SAVE_LOAD_SLOT_COUNT = 9
export const DEMO_TITLE_REQUEST_EVENT = 'ui/title_request'

export const BGM = {
  title: 'bgm/title-menu.m4a',
  blackout: 'bgm/blackout-cold-open.m4a',
  trace: 'bgm/trace-route.m4a',
  archive: 'bgm/memory-archive.m4a',
  oracle: 'bgm/oracle-link.m4a',
  breach: 'bgm/breach-night.m4a',
} as const

export const DEFAULT_BGM_OPTIONS: AudioPlayBgmOptions = {
  loop: true,
  gainDb: -8,
  fadeInMs: 900,
  fadeOutMs: 900,
}

export const DEMO_SUPPORTED_LOCALES = [
  { locale: 'zh-cn', label: '简体中文' },
] as const

export const TRUSTED_RUNTIME_KEYS: Array<{ id: string, key: JsonWebKey }> = [
  // Production runtime QPKs should be signed with a private key whose public key is registered here.
  // Example:
  // { id: 'release-2026-01', key: { kty: 'EC', crv: 'P-256', x: '...', y: '...', ext: true } },
]
