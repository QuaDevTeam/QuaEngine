import type { AssetCollectionContext, AssetInfo } from '@quajs/quack'
import type { SpriteManifest } from './contracts'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createLogger } from '@quajs/logger'
import { QuackPlugin } from '@quajs/quack'
import {
  createSpriteManifestFromAssets,
  getSpriteManifestPath,
  normalizeSpritePath,
  resolveSpriteFamily,
  serializeSpriteManifest,
  SPRITE_CHARACTERS_DIR,
} from './contracts'

const logger = createLogger('plugin-sprite:quack')

export interface SpriteQuackPluginOptions {
  generateMissingManifests?: boolean
}

export class SpriteQuackPlugin extends QuackPlugin {
  readonly name = '@quajs/plugin-sprite'
  readonly version = '0.1.0'

  constructor(private readonly options: SpriteQuackPluginOptions = {}) {
    super()
  }

  async collectAssets(context: AssetCollectionContext): Promise<AssetInfo[]> {
    if (this.options.generateMissingManifests === false) {
      return []
    }

    const generated: AssetInfo[] = []
    for (const family of collectSpriteFamilies(context.assets)) {
      if (hasPhysicalManifest(context.assets, family)) {
        continue
      }

      const manifest = createSpriteManifestFromAssets(context.assets, family)
      if (!manifest) {
        continue
      }

      generated.push(createManifestAssetInfo(context.source, family, manifest, context.assets))
    }

    if (generated.length > 0) {
      logger.info(`Generated ${generated.length} sprite manifest asset${generated.length === 1 ? '' : 's'}`)
    }

    return generated
  }
}

export function createSpriteQuackPlugin(options?: SpriteQuackPluginOptions): SpriteQuackPlugin {
  return new SpriteQuackPlugin(options)
}

function collectSpriteFamilies(assets: readonly AssetInfo[]): string[] {
  const families = new Set<string>()
  for (const asset of assets) {
    if (!isCharacterAssetPath(asset.relativePath)) {
      continue
    }

    const family = resolveSpriteFamily(asset.relativePath)
    if (family) {
      families.add(family)
    }
  }
  return [...families].sort()
}

function hasPhysicalManifest(assets: readonly AssetInfo[], family: string): boolean {
  const manifestRelativePath = `${SPRITE_CHARACTERS_DIR}/${getSpriteManifestPath(family)}`
  return assets.some(asset => normalizeSpritePath(asset.relativePath) === manifestRelativePath)
}

function createManifestAssetInfo(
  sourceRoot: string,
  family: string,
  manifest: SpriteManifest,
  assets: readonly AssetInfo[],
): AssetInfo {
  const relativePath = `${SPRITE_CHARACTERS_DIR}/${getSpriteManifestPath(family)}`
  const content = Buffer.from(`${serializeSpriteManifest(manifest)}\n`, 'utf8')
  const familyMtimes = assets
    .filter(asset => resolveSpriteFamily(asset.relativePath) === family)
    .map(asset => asset.mtime || 0)
    .filter(Boolean)
  const familyMtime = familyMtimes.length > 0 ? Math.max(...familyMtimes) : Date.now()

  return {
    name: getSpriteManifestPath(family),
    path: resolve(sourceRoot, relativePath),
    relativePath,
    size: content.byteLength,
    hash: createHash('sha256').update(content).digest('hex'),
    type: 'characters',
    locales: ['default'],
    mimeType: 'application/json',
    mtime: familyMtime,
    content,
  }
}

function isCharacterAssetPath(relativePath: string): boolean {
  return Boolean(normalizeSpritePath(relativePath)?.startsWith(`${SPRITE_CHARACTERS_DIR}/`))
}
