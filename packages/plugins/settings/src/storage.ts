import type { SettingsStorageAdapter, SettingsStoredProfile } from './contracts'
import { cloneSettingsValue } from './runtime/json'

export class MemorySettingsStorage implements SettingsStorageAdapter {
  private readonly profiles = new Map<string, SettingsStoredProfile>()

  async loadProfile(profileId: string): Promise<SettingsStoredProfile | undefined> {
    const profile = this.profiles.get(profileId)
    return profile ? cloneSettingsValue(profile) : undefined
  }

  async saveProfile(profile: SettingsStoredProfile): Promise<void> {
    this.profiles.set(profile.profileId, cloneSettingsValue(profile))
  }

  async deleteProfile(profileId: string): Promise<void> {
    this.profiles.delete(profileId)
  }
}

export function createMemorySettingsStorage(): MemorySettingsStorage {
  return new MemorySettingsStorage()
}
