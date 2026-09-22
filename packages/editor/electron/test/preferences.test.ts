import { describe, expect, it } from 'vitest'
import { defaults, readPreferences, validSetting } from '../../ui/src/features/settings/schema'

describe('local editor settings', () => {
  it('migrates existing settings and validates new fields independently', () => {
    const settings = readPreferences({ fontSize: 16, minimap: false, tabSize: 4, terminalScrollback: -1, density: 'unknown', previewFps: Infinity })
    expect(settings).toEqual({ ...defaults, fontSize: 16, minimap: false, tabSize: 4 })
    expect(readPreferences(null)).toEqual(defaults)
  })

  it('rejects invalid numeric drafts and supports declared discrete choices', () => {
    expect(validSetting('fontSize', Number.NaN)).toBe(false)
    expect(validSetting('fontSize', '16')).toBe(false)
    expect(validSetting('lineHeight', 1.75)).toBe(false)
    expect(validSetting('lineHeight', 1.8)).toBe(true)
    expect(validSetting('previewFps' as never, 60)).toBe(false)
    expect(validSetting('whitespace', 'all')).toBe(true)
    expect(validSetting('minimap', 'false')).toBe(false)
  })

  it('defaults older profiles to the Qua system theme and rejects unknown theme values', () => {
    expect(readPreferences({ fontSize: 16 }).colorTheme).toBe('qua')
    expect(readPreferences({ fontSize: 16 }).colorMode).toBe('system')
    expect(readPreferences({ colorTheme: 'graphite', colorMode: 'light' })).toMatchObject({ colorTheme: 'graphite', colorMode: 'light' })
    expect(readPreferences({ colorTheme: 'url(https://example.com)', colorMode: 'unknown' })).toMatchObject({ colorTheme: 'qua', colorMode: 'system' })
  })
})
