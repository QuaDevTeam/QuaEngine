export interface ParsedSemverVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z.-]+))?$/i

export function isValidSemverVersion(version: string): boolean {
  return SEMVER_PATTERN.test(version)
}

export function parseSemverVersion(version: string): ParsedSemverVersion {
  const match = SEMVER_PATTERN.exec(version)
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`)
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

export function compareSemverVersions(left: string, right: string): number {
  const leftVersion = parseSemverVersion(left)
  const rightVersion = parseSemverVersion(right)

  const coreDelta = compareNumber(leftVersion.major, rightVersion.major)
    || compareNumber(leftVersion.minor, rightVersion.minor)
    || compareNumber(leftVersion.patch, rightVersion.patch)
  if (coreDelta !== 0) {
    return coreDelta
  }

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease)
}

export function isSemverAtLeast(version: string, minimumVersion: string): boolean {
  return compareSemverVersions(version, minimumVersion) >= 0
}

function compareNumber(left: number, right: number): number {
  return left === right ? 0 : left > right ? 1 : -1
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0)
    return 0
  if (left.length === 0)
    return 1
  if (right.length === 0)
    return -1

  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index++) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (leftPart === undefined)
      return -1
    if (rightPart === undefined)
      return 1
    if (leftPart === rightPart)
      continue

    const leftNumber = parseNumericIdentifier(leftPart)
    const rightNumber = parseNumericIdentifier(rightPart)
    if (leftNumber !== undefined && rightNumber !== undefined) {
      return compareNumber(leftNumber, rightNumber)
    }
    if (leftNumber !== undefined)
      return -1
    if (rightNumber !== undefined)
      return 1
    return leftPart.localeCompare(rightPart)
  }

  return 0
}

function parseNumericIdentifier(value: string): number | undefined {
  if (!/^\d+$/.test(value))
    return undefined
  return Number.parseInt(value, 10)
}
