import type { AssetInfo } from '@quajs/quack'
import { describe, expect, it } from 'vitest'
import { createSpriteQuackPlugin } from '../src/build'
import {
  createSpriteManifestFromAssets,
  resolveSpriteProjection,
  resolveSpriteReference,
} from '../src/contracts'

describe('@quajs/plugin-sprite', () => {
  it('creates a base-plus-expression manifest and resolves expression diff layers', () => {
    const manifest = createSpriteManifestFromAssets([
      spriteAsset('characters/alice/base.png'),
      spriteAsset('characters/alice/expressions/happy.png'),
    ], 'alice')

    expect(manifest).toMatchObject({
      version: 1,
      family: 'alice',
      base: { asset: 'alice/base.png' },
      expressions: {
        happy: {
          fallback: 'base.png',
          layers: [{ asset: 'alice/expressions/happy.png' }],
        },
      },
    })

    const reference = resolveSpriteReference('characters/alice/base.png')
    expect(reference).toMatchObject({
      family: 'alice',
      manifestPath: 'alice/sprite.manifest.json',
    })

    const projection = resolveSpriteProjection(manifest!, 'alice/base.png', 'happy')
    expect(projection?.layers.map(layer => layer.asset)).toEqual([
      'alice/base.png',
      'alice/expressions/happy.png',
    ])
    expect(projection?.fallbackUsed).toBe(false)

    const fallbackProjection = resolveSpriteProjection(manifest!, 'alice/base.png', 'angry')
    expect(fallbackProjection?.layers.map(layer => layer.asset)).toEqual(['alice/base.png'])
    expect(fallbackProjection?.fallbackUsed).toBe(true)
  })

  it('contributes generated sprite manifests as character assets with family-relative names', async () => {
    const plugin = createSpriteQuackPlugin()
    const generated = await plugin.collectAssets({
      source: '/project/assets',
      assets: [
        spriteAsset('characters/alice/base.png'),
        spriteAsset('characters/alice/expressions/happy.png'),
      ],
    })

    expect(generated).toHaveLength(1)
    expect(generated[0]).toMatchObject({
      name: 'alice/sprite.manifest.json',
      relativePath: 'characters/alice/sprite.manifest.json',
      type: 'characters',
      mimeType: 'application/json',
    })

    const manifest = JSON.parse(new TextDecoder().decode(generated[0].content))
    expect(manifest.base.asset).toBe('alice/base.png')
    expect(manifest.expressions.happy.layers[0].asset).toBe('alice/expressions/happy.png')
  })

  it('leaves physical sidecar manifests authoritative', async () => {
    const plugin = createSpriteQuackPlugin()
    const generated = await plugin.collectAssets({
      source: '/project/assets',
      assets: [
        spriteAsset('characters/alice/base.png'),
        spriteAsset('characters/alice/sprite.manifest.json', 'application/json'),
      ],
    })

    expect(generated).toEqual([])
  })
})

function spriteAsset(relativePath: string, mimeType = 'image/png'): AssetInfo {
  return {
    name: relativePath.replace(/^characters\//, ''),
    path: `/project/assets/${relativePath}`,
    relativePath,
    size: 10,
    hash: relativePath,
    type: 'characters',
    locales: ['default'],
    mimeType,
    mtime: 1,
  }
}
