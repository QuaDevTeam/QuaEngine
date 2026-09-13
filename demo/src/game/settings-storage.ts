import type { SettingsStorageAdapter, SettingsStoredProfile } from '@quajs/plugin-settings'

/** Web platform adapter. Preferences are independent of story slots/checkpoints. */
export function createDemoSettingsStorage(storage: Storage): SettingsStorageAdapter {
  const key = (profileId: string) => `call-me-tomorrow:settings:${profileId}`
  return {
    async loadProfile(profileId) {
      const raw = storage.getItem(key(profileId))
      if (!raw) return undefined
      try {
        const profile = JSON.parse(raw) as SettingsStoredProfile
        return profile?.profileId === profileId ? profile : undefined
      }
      catch { return undefined }
    },
    async saveProfile(profile) { storage.setItem(key(profile.profileId), JSON.stringify(profile)) },
    async deleteProfile(profileId) { storage.removeItem(key(profileId)) },
  }
}
