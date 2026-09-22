import type { BundleIndexRecord, WorkspaceBundleIndex } from './types'

/** Resolve the complete plan before performing any network/storage mutations. */
export function resolveWorkspaceBundles(index: WorkspaceBundleIndex, names?: readonly string[], target?: string): Array<{ name: string, record: BundleIndexRecord }> {
  const result: Array<{ name: string, record: BundleIndexRecord }> = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (name: string) => {
    if (visiting.has(name))
      throw new Error(`Circular bundle dependency: ${name}`)
    if (visited.has(name))
      return
    const bundle = index.bundles[name]
    if (!bundle)
      throw new Error(`Unknown workspace bundle: ${name}`)
    const record = target ? bundle.targets?.[target] : bundle.latestBundle
    if (!record?.filename || !record.hash || !record.buildNumber || !Number.isSafeInteger(record.version))
      throw new Error(`Missing versioned artifact for bundle: ${name}${target ? ` (${target})` : ''}`)
    visiting.add(name)
    for (const dependency of bundle.dependencies) visit(dependency)
    visiting.delete(name)
    visited.add(name)
    result.push({ name: bundle.name, record })
  }
  const requested = names ?? Object.keys(index.bundles)
    .filter(name => index.bundles[name].loadTrigger === 'immediate')
    .sort((a, b) => index.bundles[a].priority - index.bundles[b].priority)
  for (const name of requested) visit(name)
  return result
}
