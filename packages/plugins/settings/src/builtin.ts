import type { SettingsScopeContribution } from './contracts'
import { BASE_SETTINGS_SCOPE } from './contracts'

export interface BaseDeveloperSettings {
  defaultLocale: string
  allowUnsafeRendererSettings: boolean
}

export interface BasePlayerSettings {
  locale: string
  textSpeedCps: number
  autoAdvanceDelayMs: number
  skipMode: 'read' | 'all'
  confirmBeforeQuit: boolean
}

export interface BaseSettingsScopeOptions {
  developer?: Partial<BaseDeveloperSettings>
  player?: Partial<BasePlayerSettings>
}

export const baseDeveloperSettingsDefaults: BaseDeveloperSettings = {
  defaultLocale: 'system',
  allowUnsafeRendererSettings: false,
}

export const basePlayerSettingsDefaults: BasePlayerSettings = {
  locale: 'system',
  textSpeedCps: 45,
  autoAdvanceDelayMs: 1200,
  skipMode: 'read',
  confirmBeforeQuit: true,
}

export function createBaseSettingsScope(options: BaseSettingsScopeOptions = {}): SettingsScopeContribution<BaseDeveloperSettings, BasePlayerSettings> {
  return {
    scope: BASE_SETTINGS_SCOPE,
    version: 1,
    title: 'System',
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
          allowUnsafeRendererSettings: {
            type: 'boolean',
            title: 'Allow Unsafe Renderer Settings',
          },
        },
      },
      defaults: baseDeveloperSettingsDefaults,
      values: options.developer,
    },
    player: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          locale: {
            type: 'string',
            title: 'Language',
            default: basePlayerSettingsDefaults.locale,
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
      defaults: basePlayerSettingsDefaults,
      values: options.player,
      expose: true,
      ui: {
        label: 'System',
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
            control: 'text',
            group: 'interaction',
            order: 0,
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
    apply: async ({ engine, player }) => {
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

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}
