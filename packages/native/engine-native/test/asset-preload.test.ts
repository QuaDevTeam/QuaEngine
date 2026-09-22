import { expect, it, vi } from 'vitest'
import { createNativeAssetPreloadProjection } from '../src/asset-preload'

it('projects image and resolved sprite hints with package provenance, without a renderer mutation', () => {
  const resolveCharacter = vi.fn(() => ({ sprite: 'mara/sprite.manifest.json', expression: 'smile' }))
  const projection = createNativeAssetPreloadProjection([
    { type: 'images', name: 'bg/rain.webp', contentPackageId: 'chapter-2', requiredRuntimePackages: ['base'] },
    { type: 'character', name: 'mara', expression: 'smile' },
    { type: 'audio', name: 'not-an-image.ogg' },
  ], { resolveCharacter })
  expect(projection.images).toEqual([{ assetType: 'images', assetName: 'bg/rain.webp', provenance: { contentPackageId: 'chapter-2', requiredRuntimePackages: ['base'] } }])
  expect(projection.characters).toMatchObject([{ sprite: 'mara/sprite.manifest.json', expression: 'smile' }])
  expect(resolveCharacter).toHaveBeenCalledTimes(1)
})
