import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { QPKBundler } from '../src/bundlers/qpk-bundler'
import { QuackBundler } from '../src/core/bundler'

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
})
