export function normalizePackageSpecifier(specifier: string): string {
  const normalized = stripReferenceSuffix(specifier.trim().replace(/\\/g, '/').replace(/^\0+/, ''))
  const pathPackageRoot = packageRootFromDependencyPath(normalized)
  if (pathPackageRoot)
    return pathPackageRoot

  const packageSpecifier = normalized.startsWith('npm:')
    ? normalized.slice('npm:'.length)
    : normalized

  if (!packageSpecifier.startsWith('@')) {
    const pathRoot = packageSpecifier.split('/')[0] || packageSpecifier
    return pathRoot.split('::')[0] || pathRoot
  }
  const [scope, packageName] = packageSpecifier.split('/')
  return scope && packageName ? `${scope}/${packageName}` : packageSpecifier
}

function stripReferenceSuffix(specifier: string): string {
  const queryIndex = specifier.indexOf('?')
  const hashIndex = specifier.indexOf('#')
  const suffixIndexes = [queryIndex, hashIndex].filter(index => index >= 0)
  const suffixIndex = suffixIndexes.length > 0 ? Math.min(...suffixIndexes) : -1
  return suffixIndex >= 0 ? specifier.slice(0, suffixIndex) : specifier
}

function packageRootFromDependencyPath(specifier: string): string | undefined {
  const segments = specifier.split('/').filter(Boolean)
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index] !== 'node_modules')
      continue

    if (segments[index + 1] === '.pnpm') {
      const pnpmRoot = packageRootFromPnpmSegment(segments[index + 2])
      if (pnpmRoot)
        return pnpmRoot
    }

    return packageRootFromPathSegments(segments, index + 1)
  }

  const pnpmIndex = segments.lastIndexOf('.pnpm')
  if (pnpmIndex >= 0)
    return packageRootFromPnpmSegment(segments[pnpmIndex + 1])

  return undefined
}

function packageRootFromPathSegments(segments: string[], startIndex: number): string | undefined {
  const first = segments[startIndex]
  if (!first)
    return undefined

  if (first.startsWith('@')) {
    const second = segments[startIndex + 1]
    return second ? `${first}/${second}` : first
  }

  return first.split('::')[0] || first
}

function packageRootFromPnpmSegment(segment: string | undefined): string | undefined {
  if (!segment)
    return undefined

  if (segment.startsWith('@')) {
    const match = /^(@[^+]+)\+([^@]+)@/.exec(segment)
    return match ? `${match[1]}/${match[2]}` : undefined
  }

  const match = /^([^@]+)@/.exec(segment)
  return match?.[1]
}
