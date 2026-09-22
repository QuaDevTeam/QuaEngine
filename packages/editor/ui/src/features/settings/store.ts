import type { Preferences, SettingKey } from './schema'
import { defaults, readPreferences, validSetting } from './schema'

const storageKey = 'qua-editor-preferences-v1'
export class PreferencesStore {
  value: Preferences = { ...defaults }
  persisted = true
  private readonly listeners = new Set<() => void>()
  constructor() {
    try {
      this.value = readPreferences(JSON.parse(localStorage.getItem(storageKey) || '{}'))
    }
    catch { /* Use validated defaults when profile storage is unavailable. */ }
    // Popout chrome shares this origin/profile, but owns no preference writes.
    window.addEventListener('storage', (event) => {
      if (event.storageArea !== localStorage || (event.key !== storageKey && event.key !== null))
        return
      try {
        this.value = readPreferences(JSON.parse(event.newValue || '{}'))
        for (const listener of this.listeners) listener()
      }
      catch { /* Ignore malformed updates from another window. */ }
    })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(key: SettingKey, value: unknown): boolean {
    if (!validSetting(key, value))
      return false
    this.value = { ...this.value, [key]: value }
    this.save()
    return true
  }

  reset(key?: SettingKey): void {
    this.value = key ? { ...this.value, [key]: defaults[key] } : { ...defaults }
    this.save()
  }

  private save(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.value))
      this.persisted = true
    }
    catch {
      this.persisted = false
    }
    for (const listener of this.listeners) listener()
  }
}
export const preferences = new PreferencesStore()
