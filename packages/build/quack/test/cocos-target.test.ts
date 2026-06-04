import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { QPKBundler } from '../src/bundlers/qpk-bundler'
import { QuackBundler } from '../src/core/bundler'
import { readQpkSummary } from '../src/qpk-reader'

const tempDirs: string[] = []

describe('Cocos asset target metadata', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('marks Cocos targets as static-only without changing default Web output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quack-cocos-target-'))
    tempDirs.push(dir)

    const source = join(dir, 'assets')
    const outputDir = join(dir, 'dist')
    const output = join(outputDir, 'bundle.qpk')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'story.json'), JSON.stringify({ ok: true }))

    const bundler = new QuackBundler({
      source,
      output,
      format: 'qpk',
      compression: { algorithm: 'none', level: 0 },
      encryption: { enabled: false, algorithm: 'none' },
      versioning: { bundleVersion: 1, buildNumber: 'cocos-target-test' },
      assetTargets: [{
        name: 'cocos-static',
        platform: 'cocos',
        suffix: 'cocos',
        cocos: {
          creatorVersion: '3.x',
          resourceRoot: 'assets/resources',
        },
      }],
    })

    await bundler.bundle()

    const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8'))
    const bundlePath = join(outputDir, index.targets['cocos-static'].filename)
    const { manifest } = await new QPKBundler().readBundle(bundlePath)
    expect(manifest.assetTarget).toMatchObject({
      name: 'cocos-static',
      platform: 'cocos',
      staticOnly: true,
      cocos: {
        creatorVersion: '3.x',
        resourceRoot: 'assets/resources',
        staticOnly: true,
        materialization: {
          images: 'spriteFrame',
          characters: 'spriteFrame',
          audio: 'audioClip',
          video: 'videoClip',
          fonts: 'font',
        },
      },
    })
  })

  it('normalizes Cocos hybrid asset mode with mobile image defaults and developer overrides', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quack-cocos-hybrid-'))
    tempDirs.push(dir)

    const source = join(dir, 'assets')
    const outputDir = join(dir, 'dist')
    const output = join(outputDir, 'bundle.qpk')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'story.json'), JSON.stringify({ ok: true }))

    const bundler = new QuackBundler({
      source,
      output,
      format: 'qpk',
      compression: { algorithm: 'none', level: 0 },
      encryption: { enabled: false, algorithm: 'none' },
      versioning: { bundleVersion: 1, buildNumber: 'cocos-hybrid-test' },
      assetTargets: [
        {
          name: 'cocos-mobile',
          platform: 'cocos',
          suffix: 'cocos-mobile',
          cocos: {
            creatorVersion: '3.x',
            resourceRoot: 'assets/resources',
            buildPlatforms: ['android', 'ios'],
          },
        },
        {
          name: 'cocos-mobile-disabled',
          platform: 'cocos',
          suffix: 'cocos-mobile-disabled',
          cocos: {
            creatorVersion: '3.x',
            mobile: true,
            hybrid: { enabled: false },
          },
        },
        {
          name: 'cocos-custom',
          platform: 'cocos',
          suffix: 'cocos-custom',
          cocos: {
            creatorVersion: '3.x',
            buildPlatforms: ['mac'],
            hybrid: {
              enabled: true,
              resourceRoot: 'assets/native',
              assetBundle: 'native-art',
              domains: {
                images: 'qpk',
                characters: 'cocos-bundle',
                audio: 'cocos-bundle',
              },
            },
          },
        },
      ],
    })

    await bundler.bundle()

    const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8'))
    const mobile = await new QPKBundler().readBundle(join(outputDir, index.targets['cocos-mobile'].filename))
    const disabled = await new QPKBundler().readBundle(join(outputDir, index.targets['cocos-mobile-disabled'].filename))
    const custom = await new QPKBundler().readBundle(join(outputDir, index.targets['cocos-custom'].filename))

    expect(mobile.manifest.assetTarget?.cocos?.hybrid).toEqual({
      enabled: true,
      resourceRoot: 'assets/resources',
      assetBundle: 'qua-hybrid',
      domains: {
        images: 'cocos-bundle',
        characters: 'cocos-bundle',
        audio: 'qpk',
        video: 'qpk',
        fonts: 'qpk',
      },
    })
    expect(disabled.manifest.assetTarget?.cocos?.hybrid).toEqual({
      enabled: false,
      resourceRoot: 'assets/qua-native',
      assetBundle: 'qua-hybrid',
      domains: {
        images: 'qpk',
        characters: 'qpk',
        audio: 'qpk',
        video: 'qpk',
        fonts: 'qpk',
      },
    })
    expect(custom.manifest.assetTarget?.cocos?.hybrid).toEqual({
      enabled: true,
      resourceRoot: 'assets/native',
      assetBundle: 'native-art',
      domains: {
        images: 'qpk',
        characters: 'cocos-bundle',
        audio: 'cocos-bundle',
        video: 'qpk',
        fonts: 'qpk',
      },
    })
  })

  it('defaults Cocos QPK targets to uncompressed manifests unless target compression is explicit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quack-cocos-compression-'))
    tempDirs.push(dir)

    const source = join(dir, 'assets')
    const outputDir = join(dir, 'dist')
    const output = join(outputDir, 'bundle.qpk')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'story.json'), JSON.stringify({ ok: true }))

    const bundler = new QuackBundler({
      source,
      output,
      format: 'qpk',
      compression: { algorithm: 'lzma', level: 6 },
      encryption: { enabled: false, algorithm: 'none' },
      versioning: { bundleVersion: 1, buildNumber: 'cocos-compression-test' },
      assetTargets: [
        {
          name: 'cocos-static',
          platform: 'cocos',
          suffix: 'cocos',
          cocos: { creatorVersion: '3.x' },
        },
        {
          name: 'cocos-explicit-lzma',
          platform: 'cocos',
          suffix: 'cocos-lzma',
          compression: { algorithm: 'lzma', level: 1 },
          cocos: { creatorVersion: '3.x' },
        },
      ],
    })

    await bundler.bundle()

    const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8'))
    const staticBundle = await new QPKBundler().readBundle(join(outputDir, index.targets['cocos-static'].filename))
    const explicitBundle = await new QPKBundler().readBundle(join(outputDir, index.targets['cocos-explicit-lzma'].filename))

    expect(staticBundle.manifest.compression).toEqual({ algorithm: 'none', level: 0 })
    expect(explicitBundle.manifest.compression).toMatchObject({ algorithm: 'lzma', level: 1 })
  })

  it('defaults Cocos QPK targets to unencrypted manifests unless target encryption is explicit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quack-cocos-encryption-'))
    tempDirs.push(dir)

    const source = join(dir, 'assets')
    const outputDir = join(dir, 'dist')
    const output = join(outputDir, 'bundle.qpk')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'story.json'), JSON.stringify({ ok: true }))

    const bundler = new QuackBundler({
      source,
      output,
      format: 'qpk',
      compression: { algorithm: 'none', level: 0 },
      encryption: { enabled: true, algorithm: 'xor', key: 'base-secret' },
      versioning: { bundleVersion: 1, buildNumber: 'cocos-encryption-test' },
      assetTargets: [
        {
          name: 'cocos-static',
          platform: 'cocos',
          suffix: 'cocos',
          cocos: { creatorVersion: '3.x' },
        },
        {
          name: 'cocos-explicit-encrypted',
          platform: 'cocos',
          suffix: 'cocos-encrypted',
          encryption: { enabled: true, algorithm: 'xor', key: 'target-secret' },
          cocos: { creatorVersion: '3.x' },
        },
      ],
    })

    await bundler.bundle()

    const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8'))
    const staticPath = join(outputDir, index.targets['cocos-static'].filename)
    const explicitPath = join(outputDir, index.targets['cocos-explicit-encrypted'].filename)
    const staticSummary = await readQpkSummary(staticPath)
    const explicitSummary = await readQpkSummary(explicitPath)
    const staticBundle = await new QPKBundler().readBundle(staticPath)
    const explicitBundle = await new QPKBundler([], 'xor', 'target-secret').readBundle(explicitPath)

    expect(staticSummary.header.encrypted).toBe(false)
    expect(staticBundle.manifest.encryption).toEqual({ enabled: false, algorithm: 'none' })
    expect(explicitSummary.header.encrypted).toBe(true)
    expect(explicitBundle.manifest.encryption).toMatchObject({ enabled: true, algorithm: 'xor' })
  })
})
