import type { GameStep } from '../src'
import { describe, expect, it, vi } from 'vitest'
import { collectUpcomingAssetHints } from '../src'

describe('script asset lookahead', () => {
  it('bounds speculation, deduplicates and carries runtime QPK provenance without executing steps', () => {
    const run = vi.fn()
    const steps: GameStep[] = Array.from({ length: 80 }, (_, i) => ({ uuid: String(i), run, metadata: { assetHints: [{ type: 'images', name: `bg/${Math.floor(i / 2)}.webp` }], runtimePackage: { packageId: 'chapter-2' }, requiredRuntimePackages: ['base'] } }))
    const hints = collectUpcomingAssetHints(steps, 4)
    expect(hints).toHaveLength(12)
    expect(hints[0]).toEqual({ type: 'images', name: 'bg/2.webp', contentPackageId: 'chapter-2', requiredRuntimePackages: ['base'] })
    expect(run).not.toHaveBeenCalled()
  })

  it('does not look beyond the step window or merge equal names across packages', () => {
    const steps: GameStep[] = Array.from({ length: 65 }, (_, i) => ({ uuid: String(i), run() {}, metadata: { assetHints: i === 64 ? [{ type: 'images', name: 'distant.png' }] : [] } }))
    expect(collectUpcomingAssetHints(steps)).toEqual([])
    const hint = { type: 'images', name: 'same.png' }
    expect(collectUpcomingAssetHints(['a', 'b'].map(packageId => ({ uuid: packageId, run() {}, metadata: { assetHints: [hint], runtimePackage: { packageId } } })))).toHaveLength(2)
  })
})
