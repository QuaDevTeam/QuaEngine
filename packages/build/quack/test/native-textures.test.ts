import type { BuildLog } from '../src/core/types'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { buildNativeTextureVariants } from '../src/assets/native-textures'
import { QPKBundler } from '../src/bundlers/qpk-bundler'
import { QuackBundler } from '../src/core/bundler'
import { PatchGenerator } from '../src/workspace/patch-generator'

it('requires an artifact platform for automatic texture selection', async () => {
  await expect(buildNativeTextureVariants([], { format: 'auto' })).rejects.toThrow('explicit astc or bc7')
  await expect(buildNativeTextureVariants([], { format: 'astc', paths: ['../images'] })).rejects.toThrow('source-relative')
})

it.runIf(process.env.QUA_KTX)('stores GPU blocks as private data and preserves the character image in the QPK', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quack-texture-test-'))
  try {
    const source = join(root, 'assets')
    await mkdir(join(source, 'characters'), { recursive: true })
    const pixels = Buffer.alloc(32 * 32 * 4)
    pixels.fill(255, (16 * 32 + 12) * 4, (16 * 32 + 13) * 4)
    const png = await sharp(pixels, { raw: { channels: 4, width: 32, height: 32 } }).png().toBuffer()
    await writeFile(join(source, 'characters', 'actor.png'), png)
    await new QuackBundler({
      source,
      output: join(root, 'fixture.qpk'),
      format: 'qpk',
      compatibility: { minGameVersion: '1.0.0' },
      compression: { algorithm: 'none' },
      assetTarget: { platform: 'native', name: 'native', nativeTextures: { format: 'astc', ktx: process.env.QUA_KTX } },
      versioning: { incrementVersion: false, versionFile: join(root, 'version.json'), bundleVersion: 1, buildNumber: '1' },
    }).bundle('fixture')
    const file = (await readdir(root)).find(path => path.endsWith('.qpk'))!
    const { manifest, assets } = await new QPKBundler().readBundle(join(root, file))
    expect(manifest.assetTarget?.nativeTextureFormat).toBe('astc')
    expect(Object.keys(manifest.assets.characters)).toEqual(['actor.png'])
    expect(assets.get('assets/characters/actor.png')).toEqual(png)
    const blocks = assets.get('assets/data/qua-native-textures/characters/actor.png.qua-astc')!
    expect(blocks.toString('ascii', 0, 4)).toBe('QNT1')
    expect(Array.from({ length: 7 }, (_, i) => blocks.readUInt32LE(4 + i * 4))).toEqual([157, 32, 32, 8, 12, 12, 12])
    // 12×12, 6×6, 3×3, 1×1 mips take 9, 4, 1, 1 ASTC blocks respectively.
    expect(blocks.length).toBe(32 + 15 * 16)

    // An incremental release must use the exact published GPU and fallback bytes.
    await rm(source, { recursive: true })
    const toBuildLog: BuildLog = JSON.parse(await readFile(join(root, '.quack-logs', '1.native.json'), 'utf8'))
    const output = join(root, 'patch.qpk')
    await new PatchGenerator(root).generatePatch({
      fromVersion: 0,
      toVersion: 1,
      fromBuildLog: { ...toBuildLog, assets: {}, bundleVersion: 0 },
      toBuildLog,
      output,
      format: 'qpk',
    })
    expect((await new QPKBundler().readBundle(output)).assets).toEqual(assets)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
