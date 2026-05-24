import type { VersionCompatibility } from './types'
import { isSemverAtLeast, isValidSemverVersion } from '@quajs/utils'

export function assertValidAppVersion(appVersion: string | undefined): void {
  if (appVersion !== undefined && !isValidSemverVersion(appVersion)) {
    throw new Error(`Invalid appVersion "${appVersion}".`)
  }
}

export function assertValidCompatibility(
  compatibility: VersionCompatibility | undefined,
  subject = 'Resource',
): void {
  const minGameVersion = compatibility?.minGameVersion
  if (minGameVersion && !isValidSemverVersion(minGameVersion)) {
    throw new Error(`${subject} has invalid minGameVersion "${minGameVersion}".`)
  }
}

export function getCompatibilityErrors(
  compatibility: VersionCompatibility | undefined,
  appVersion: string | undefined,
  subject = 'Resource',
): string[] {
  const minGameVersion = compatibility?.minGameVersion
  if (!minGameVersion) {
    return []
  }

  const errors: string[] = []
  if (!isValidSemverVersion(minGameVersion)) {
    errors.push(`${subject} has invalid minGameVersion "${minGameVersion}".`)
  }
  if (!appVersion) {
    errors.push(`${subject} requires game version ${minGameVersion} or newer, but no appVersion was provided.`)
  }
  else if (!isValidSemverVersion(appVersion)) {
    errors.push(`Invalid appVersion "${appVersion}".`)
  }

  if (errors.length === 0 && appVersion && !isSemverAtLeast(appVersion, minGameVersion)) {
    errors.push(`${subject} requires game version ${minGameVersion} or newer. Current appVersion is ${appVersion}; upgrade the game before upgrading resources.`)
  }

  return errors
}

export function assertCompatibleGameVersion(
  compatibility: VersionCompatibility | undefined,
  appVersion: string | undefined,
  subject = 'Resource',
): void {
  const errors = getCompatibilityErrors(compatibility, appVersion, subject)
  if (errors.length > 0) {
    throw new Error(errors.join(' '))
  }
}

export function isCompatibleWithGameVersion(
  compatibility: VersionCompatibility | undefined,
  appVersion: string | undefined,
): boolean {
  return getCompatibilityErrors(compatibility, appVersion).length === 0
}
