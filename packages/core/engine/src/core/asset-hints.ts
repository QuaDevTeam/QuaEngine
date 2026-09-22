import type { GameStep, GameStepAssetHint } from './types'

/** Advisory resource window only: never run steps, branches or expressions. */
export function collectUpcomingAssetHints(steps: readonly GameStep[], start = 0): GameStepAssetHint[] {
  const hints: GameStepAssetHint[] = []
  const seen = new Set<string>()
  for (const step of steps.slice(start, start + 64)) {
    for (const hint of step.metadata?.assetHints || []) {
      const value = {
        ...hint,
        contentPackageId: hint.contentPackageId ?? step.metadata?.runtimePackage?.packageId ?? step.metadata?.point?.contentPackageId,
        requiredRuntimePackages: [...new Set([
          ...hint.requiredRuntimePackages || [],
          ...step.metadata?.requiredRuntimePackages || [],
        ])],
      }
      const key = JSON.stringify(value)
      if (seen.has(key))
        continue
      seen.add(key)
      hints.push(value)
      if (hints.length === 12)
        return hints
    }
  }
  return hints
}
