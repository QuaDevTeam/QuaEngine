import type { GameStepAssetHint } from '@quajs/engine'

export interface NativeAssetPreloadOptions {
  resolveCharacter?: (hint: GameStepAssetHint) => { sprite?: string, expression?: string } | undefined
}

/** Native resource hints travel through pipeline, never through a second asset push API. */
export function createNativeAssetPreloadProjection(hints: readonly GameStepAssetHint[], options: NativeAssetPreloadOptions = {}) {
  const images: Array<Record<string, unknown>> = []
  const characters: Array<Record<string, unknown>> = []
  for (const hint of hints.slice(0, 12)) {
    const provenance = {
      contentPackageId: hint.contentPackageId,
      requiredRuntimePackages: hint.requiredRuntimePackages,
    }
    if (hint.type === 'character') {
      const assets = options.resolveCharacter?.(hint)
      if (assets?.sprite)
        characters.push({ id: `preload:${characters.length}`, ...assets, provenance })
    }
    else if (hint.type === 'images' || hint.type === 'characters') {
      images.push({ assetType: hint.type, assetName: hint.name, provenance })
    }
  }
  return { images, characters }
}
