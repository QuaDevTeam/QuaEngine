import type { SettingsScopeContribution } from './contracts'
import { BASE_SETTINGS_SCOPE } from './contracts'

export interface BaseLocaleOption {
  locale: string
  label?: string
}

export type BaseLocaleInput = string | BaseLocaleOption

export interface BaseDeveloperSettings {
  defaultLocale: string
  supportedLocales: readonly BaseLocaleOption[]
  systemLocale?: string
  allowUnsafeRendererSettings: boolean
}

export interface BasePlayerSettings {
  locale: string
  textSpeedCps: number
  autoAdvanceDelayMs: number
  skipMode: 'read' | 'all'
  confirmBeforeQuit: boolean
}

export type BaseDeveloperSettingsInput = Partial<Omit<BaseDeveloperSettings, 'supportedLocales'>> & {
  supportedLocales?: readonly BaseLocaleInput[]
}

export interface BaseSettingsScopeOptions {
  developer?: BaseDeveloperSettingsInput
  player?: Partial<BasePlayerSettings>
}

export const baseDeveloperSettingsDefaults: BaseDeveloperSettings = {
  defaultLocale: 'default',
  supportedLocales: [{ locale: 'default', label: 'Default' }],
  allowUnsafeRendererSettings: false,
}

export const basePlayerSettingsDefaults: BasePlayerSettings = {
  locale: 'default',
  textSpeedCps: 36,
  autoAdvanceDelayMs: 2000,
  skipMode: 'read',
  confirmBeforeQuit: true,
}

export function createBaseSettingsScope(options: BaseSettingsScopeOptions = {}): SettingsScopeContribution<BaseDeveloperSettings, BasePlayerSettings> {
  const developerSettings = createBaseDeveloperSettings(options.developer)
  const playerSettings = createBasePlayerSettings(options.player, developerSettings)
  return {
    scope: BASE_SETTINGS_SCOPE,
    version: 1,
    title: 'Config',
    description: 'Core visual novel flow control and interaction preferences.',
    developer: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          defaultLocale: {
            type: 'string',
            title: 'Default Locale',
          },
          supportedLocales: {
            type: 'array',
            title: 'Supported Locales',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                locale: {
                  type: 'string',
                  title: 'Locale',
                },
                label: {
                  type: 'string',
                  title: 'Label',
                },
              },
            },
          },
          systemLocale: {
            type: 'string',
            title: 'System Locale',
          },
          allowUnsafeRendererSettings: {
            type: 'boolean',
            title: 'Allow Unsafe Renderer Settings',
          },
        },
      },
      defaults: baseDeveloperSettingsDefaults,
      values: developerSettings,
    },
    player: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          locale: {
            type: 'string',
            title: 'Language',
            enum: developerSettings.supportedLocales.map(option => option.locale),
            default: playerSettings.locale,
          },
          textSpeedCps: {
            type: 'number',
            title: 'Text Speed',
            description: 'Characters per second.',
            minimum: 5,
            maximum: 120,
            multipleOf: 1,
            default: basePlayerSettingsDefaults.textSpeedCps,
          },
          autoAdvanceDelayMs: {
            type: 'integer',
            title: 'Auto Advance Delay',
            description: 'Delay before advancing automatically.',
            minimum: 0,
            maximum: 10000,
            multipleOf: 100,
            default: basePlayerSettingsDefaults.autoAdvanceDelayMs,
          },
          skipMode: {
            type: 'string',
            title: 'Skip Mode',
            enum: ['read', 'all'],
            default: basePlayerSettingsDefaults.skipMode,
          },
          confirmBeforeQuit: {
            type: 'boolean',
            title: 'Confirm Before Quit',
            default: basePlayerSettingsDefaults.confirmBeforeQuit,
          },
        },
      },
      defaults: playerSettings,
      expose: true,
      ui: {
        label: 'Config',
        order: 0,
        groups: {
          flowControl: {
            label: 'Flow Control',
            order: 0,
          },
          interaction: {
            label: 'Interaction',
            order: 1,
          },
        },
        controls: {
          locale: {
            control: 'select',
            group: 'interaction',
            order: 0,
            options: developerSettings.supportedLocales.map(option => ({
              label: option.label || titleFromLocale(option.locale),
              value: option.locale,
            })),
          },
          textSpeedCps: {
            control: 'slider',
            group: 'flowControl',
            order: 0,
            min: 5,
            max: 120,
            step: 1,
          },
          autoAdvanceDelayMs: {
            control: 'slider',
            group: 'flowControl',
            order: 1,
            min: 0,
            max: 10000,
            step: 100,
          },
          skipMode: {
            control: 'select',
            group: 'flowControl',
            order: 2,
            options: [
              { label: 'Read Text', value: 'read' },
              { label: 'All Text', value: 'all' },
            ],
          },
          confirmBeforeQuit: {
            control: 'switch',
            group: 'interaction',
            order: 1,
          },
        },
      },
    },
    apply: async ({ engine, player, developer }) => {
      await engine.setLocale(resolveSupportedLocale(
        player.locale,
        developer.supportedLocales,
        developer.defaultLocale,
      ))
      const textSpeedCps = normalizePositiveNumber(
        player.textSpeedCps,
        basePlayerSettingsDefaults.textSpeedCps,
      )
      await engine.setDialogueOptions({
        typewriter: {
          enabled: true,
          charactersPerSecond: textSpeedCps,
          revealOnAdvance: true,
        },
      })
      await engine.setFlowControlOptions({
        skipMode: player.skipMode === 'all' ? 'all' : 'read',
        timings: {
          autoAdvanceDelayMs: normalizeNonNegativeNumber(
            player.autoAdvanceDelayMs,
            basePlayerSettingsDefaults.autoAdvanceDelayMs,
          ),
        },
      })
    },
  }
}

function createBaseDeveloperSettings(input: BaseDeveloperSettingsInput = {}): BaseDeveloperSettings {
  const rawSystemLocale = typeof input.systemLocale === 'string' ? normalizeLocale(input.systemLocale) : undefined
  const rawDefaultLocale = typeof input.defaultLocale === 'string' ? normalizeLocale(input.defaultLocale) : baseDeveloperSettingsDefaults.defaultLocale
  const supportedLocales = normalizeSupportedLocales(
    input.supportedLocales,
    rawDefaultLocale === 'system' ? baseDeveloperSettingsDefaults.defaultLocale : rawDefaultLocale,
  )
  const defaultLocale = resolveSupportedLocale(
    rawDefaultLocale === 'system' ? rawSystemLocale : rawDefaultLocale,
    supportedLocales,
    baseDeveloperSettingsDefaults.defaultLocale,
  )
  return {
    defaultLocale,
    supportedLocales: ensureSupportedLocale(supportedLocales, defaultLocale),
    systemLocale: rawSystemLocale,
    allowUnsafeRendererSettings: input.allowUnsafeRendererSettings === true,
  }
}

function createBasePlayerSettings(
  input: Partial<BasePlayerSettings> = {},
  developer: BaseDeveloperSettings,
): BasePlayerSettings {
  const locale = resolveSupportedLocale(
    input.locale || developer.systemLocale || developer.defaultLocale,
    developer.supportedLocales,
    developer.defaultLocale,
  )
  return {
    locale,
    textSpeedCps: input.textSpeedCps ?? basePlayerSettingsDefaults.textSpeedCps,
    autoAdvanceDelayMs: input.autoAdvanceDelayMs ?? basePlayerSettingsDefaults.autoAdvanceDelayMs,
    skipMode: input.skipMode === 'all' ? 'all' : input.skipMode === 'read' ? 'read' : basePlayerSettingsDefaults.skipMode,
    confirmBeforeQuit: input.confirmBeforeQuit ?? basePlayerSettingsDefaults.confirmBeforeQuit,
  }
}

function normalizeSupportedLocales(
  input: readonly BaseLocaleInput[] | undefined,
  defaultLocale: string,
): BaseLocaleOption[] {
  const normalized = new Map<string, BaseLocaleOption>()
  const candidates = input?.length ? input : [defaultLocale]
  for (const item of candidates) {
    const option = normalizeLocaleOption(item)
    if (!option || option.locale === 'system') {
      continue
    }
    normalized.set(option.locale, option)
  }
  const fallback = normalizeLocale(defaultLocale)
  if (!normalized.has(fallback)) {
    normalized.set(fallback, { locale: fallback, label: titleFromLocale(fallback) })
  }
  return [...normalized.values()]
}

function normalizeLocaleOption(input: BaseLocaleInput): BaseLocaleOption | undefined {
  if (typeof input === 'string') {
    const locale = normalizeLocale(input)
    return locale ? { locale, label: titleFromLocale(locale) } : undefined
  }
  const locale = normalizeLocale(input.locale)
  return locale
    ? {
        locale,
        label: input.label || titleFromLocale(locale),
      }
    : undefined
}

function ensureSupportedLocale(locales: readonly BaseLocaleOption[], locale: string): BaseLocaleOption[] {
  return locales.some(option => option.locale === locale)
    ? [...locales]
    : [{ locale, label: titleFromLocale(locale) }, ...locales]
}

function resolveSupportedLocale(
  requested: unknown,
  locales: readonly BaseLocaleOption[],
  defaultLocale: string,
): string {
  const normalized = typeof requested === 'string' ? normalizeLocale(requested) : ''
  const fallback = normalizeLocale(defaultLocale) || locales[0]?.locale || basePlayerSettingsDefaults.locale
  if (!normalized || normalized === 'system') {
    return fallback
  }
  const exact = locales.find(option => option.locale === normalized)
  if (exact) {
    return exact.locale
  }
  const language = normalized.split('-')[0]
  const languageMatch = locales.find(option => option.locale.split('-')[0] === language)
  return languageMatch?.locale || fallback
}

function normalizeLocale(locale: string | undefined): string {
  return (locale || '').trim().toLowerCase().replace(/_/g, '-')
}

function titleFromLocale(locale: string): string {
  switch (locale) {
    case 'default':
      return 'Default'
    case 'zh':
    case 'zh-cn':
      return '简体中文'
    case 'zh-tw':
    case 'zh-hk':
      return '繁體中文'
    case 'ja':
    case 'ja-jp':
      return '日本語'
    case 'en':
    case 'en-us':
    case 'en-gb':
      return 'English'
    default:
      return locale
        .split('-')
        .map(part => part.toUpperCase())
        .join('-')
  }
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}
