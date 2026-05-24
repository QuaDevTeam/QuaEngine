import type { AssetInfo } from '@quajs/quack'
import { initializeCanvas, writePsdBuffer } from 'ag-psd'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { createSpriteQuackPlugin } from '../src/build'
import {
  createSpriteManifestFromAssets,
  resolveSpriteProjection,
  resolveSpriteReference,
  resolveSpriteSkinProjection,
} from '../src/contracts'

vi.mock('@quajs/quack', () => ({
  QuackPlugin: class {},
}))

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

  it('creates expression-only manifests as runtime sprite deltas over a shared base asset', () => {
    const manifest = createSpriteManifestFromAssets([
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

    const projection = resolveSpriteProjection(manifest!, 'alice/base.png', 'happy')
    expect(projection?.layers.map(layer => layer.asset)).toEqual([
      'alice/base.png',
      'alice/expressions/happy.png',
    ])
  })

  it('contributes generated sprite manifests as character assets with family-relative names', async () => {
    const root = await createTempSpriteSource({
      'characters/alice/base.psb': createPsdBuffer(['base', 'happy']),
    })

    const generated = await createSpriteQuackPlugin().collectAssets({
      source: root,
      assets: [],
    })

    expect(generated.map(asset => asset.relativePath)).toEqual(expect.arrayContaining([
      'characters/alice/base.png',
      'characters/alice/happy.png',
      'characters/alice/sprite.manifest.json',
    ]))

    const manifestAsset = generated.find(asset => asset.relativePath === 'characters/alice/sprite.manifest.json')
    expect(manifestAsset).toBeTruthy()
    const manifest = JSON.parse(new TextDecoder().decode(manifestAsset!.content))
    expect(manifest.base.asset).toBe('alice/base.png')
    expect(manifest.expressions.happy.layers[0].asset).toBe('alice/happy.png')
  })

  it('leaves physical sidecar manifests authoritative', async () => {
    const root = await createTempSpriteSource({
      'characters/alice/base.psb': createPsdBuffer(['base', 'happy']),
    })

    const generated = await createSpriteQuackPlugin().collectAssets({
      source: root,
      assets: [
        spriteAsset('characters/alice/sprite.manifest.json', 'application/json'),
      ],
    })

    expect(generated.some(asset => asset.relativePath === 'characters/alice/sprite.manifest.json')).toBe(false)
    expect(generated.map(asset => asset.relativePath)).toEqual(expect.arrayContaining([
      'characters/alice/base.png',
      'characters/alice/happy.png',
    ]))
  })

  it('exports character layers from psb sources and keeps family-relative manifest names', async () => {
    const root = await createTempSpriteSource({
      'characters/alice/base.psb': createPsdBuffer(['base']),
    })

    const generated = await createSpriteQuackPlugin().collectAssets({
      source: root,
      assets: [],
    })

    expect(generated.map(asset => asset.relativePath)).toEqual(expect.arrayContaining([
      'characters/alice/base.png',
      'characters/alice/sprite.manifest.json',
    ]))

    const manifest = JSON.parse(new TextDecoder().decode(generated.find(asset => asset.relativePath === 'characters/alice/sprite.manifest.json')!.content))
    expect(manifest.family).toBe('alice')
    expect(manifest.base.asset).toBe('alice/base.png')
  })

  it('exports ui skin layers from psb sources and resolves ui theme references', async () => {
    const root = await createTempSpriteSource({
      'ui/default/button.psb': createPsdBuffer(['default', 'hover']),
      'ui/default/button/ui-skin.json': JSON.stringify({
        family: 'default',
        skins: {
          button: {
            base: { asset: 'button/default.png' },
            states: {
              hover: { asset: 'button/hover.png' },
            },
            slice: { top: 1, right: 1, bottom: 1, left: 1 },
            fill: true,
            contentInsets: { top: 2, right: 3, bottom: 4, left: 5 },
          },
        },
      }),
    })

    const generated = await createSpriteQuackPlugin().collectAssets({
      source: root,
      assets: [],
    })
    const skinManifestAsset = generated.find(asset => asset.relativePath === 'ui/default/ui-skin.manifest.json')
    expect(skinManifestAsset).toBeTruthy()
    expect(generated.map(asset => asset.relativePath)).toContain('ui/default/button/default.png')

    const manifest = JSON.parse(new TextDecoder().decode(skinManifestAsset!.content))
    expect(manifest.family).toBe('ui/default')
    expect(manifest.skins.button.base.asset).toBe('ui/default/button/default.png')
    expect(manifest.skins.button.states.hover.asset).toBe('ui/default/button/hover.png')

    const projection = resolveSpriteSkinProjection({
      version: 1,
      family: 'default',
      skins: {
        button: {
          base: { asset: 'button/default.png' },
          states: {
            hover: { asset: 'button/hover.png' },
          },
          slice: { top: 1, right: 1, bottom: 1, left: 1 },
        },
      },
    }, 'ui/default/button', 'hover')

    expect(projection).toBeTruthy()
    expect(projection?.base.asset).toBe('ui/default/button/default.png')
    expect(projection?.active.asset).toBe('ui/default/button/hover.png')
    expect(projection?.fallbackUsed).toBe(false)
  })

  it('merges inferred ui skin states with explicit manifest states', async () => {
    const root = await createTempSpriteSource({
      'ui/default/button.psb': createPsdBuffer(['default', 'hover']),
      'ui/default/button/ui-skin.json': JSON.stringify({
        family: 'default',
        skins: {
          button: {
            states: {
              hover: { asset: 'button/hover.png' },
            },
            slice: { top: 1, right: 1, bottom: 1, left: 1 },
          },
        },
      }),
    })

    const generated = await createSpriteQuackPlugin().collectAssets({
      source: root,
      assets: [],
    })
    const skinManifestAsset = generated.find(asset => asset.relativePath === 'ui/default/ui-skin.manifest.json')
    expect(skinManifestAsset).toBeTruthy()

    const manifest = JSON.parse(new TextDecoder().decode(skinManifestAsset!.content))
    expect(manifest.skins.button.states.default.asset).toBe('ui/default/button/default.png')
    expect(manifest.skins.button.states.hover.asset).toBe('ui/default/button/hover.png')
  })

  it('keeps physical ui skin manifests authoritative over generated ones', async () => {
    const root = await createTempSpriteSource({
      'ui/default/button.psb': createPsdBuffer(['default']),
      'ui/default/button/ui-skin.json': JSON.stringify({
        family: 'default',
        skins: {
          button: {
            base: { asset: 'button/default.png' },
            slice: { top: 1, right: 1, bottom: 1, left: 1 },
          },
        },
      }),
      'ui/default/ui-skin.manifest.json': JSON.stringify({
        version: 1,
        family: 'ui/default',
        skins: {
          button: {
            base: { asset: 'ui/default/button/default.png' },
            slice: { top: 1, right: 1, bottom: 1, left: 1 },
          },
        },
      }),
    })

    const generated = await createSpriteQuackPlugin().collectAssets({
      source: root,
      assets: [{
      name: 'ui/default/ui-skin.manifest.json',
      path: '/project/assets/ui/default/ui-skin.manifest.json',
      relativePath: 'ui/default/ui-skin.manifest.json',
      size: 1,
      hash: 'physical-ui-manifest',
      type: 'data',
      locales: ['default'],
      mimeType: 'application/json',
      mtime: 1,
    }],
    })
    expect(generated.some(asset => asset.relativePath === 'ui/default/ui-skin.manifest.json')).toBe(false)
    expect(generated.map(asset => asset.relativePath)).toContain('ui/default/button/default.png')
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

async function createTempSpriteSource(files: Record<string, string | Uint8Array>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'qua-sprite-'))
  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const target = join(root, relativePath)
    await ensureParentDirectory(target)
    await writeFile(target, content)
  }))
  return root
}

async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
}

function createPsdBuffer(layerNames: string[]): Uint8Array {
  initializeCanvas(
    (width: number, height: number) => ({
      width,
      height,
      getContext: (kind: string) => kind === '2d'
        ? {
            createImageData: (nextWidth: number, nextHeight: number) => ({
              width: nextWidth,
              height: nextHeight,
              data: new Uint8ClampedArray(nextWidth * nextHeight * 4),
            }),
            putImageData: () => {},
          }
        : null,
    }) as any,
    (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }) as any,
  )

  const psd = {
    width: 2,
    height: 2,
    children: layerNames.map((name, index) => ({
      name,
      left: 0,
      top: 0,
      right: 2,
      bottom: 2,
      opacity: 100,
      imageData: {
        width: 2,
        height: 2,
        data: new Uint8ClampedArray([
          index * 64, 0, 255 - index * 64, 255, 0, index * 64, 0, 255,
          0, 0, index * 64, 255, 255, 255, 255, 255,
        ]),
      },
    })),
  }

  return new Uint8Array(writePsdBuffer(psd as any))
}
