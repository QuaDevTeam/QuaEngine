import type { BuildLog } from '../src/core/types'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QPKBundler } from '../src/bundlers/qpk-bundler'
import { PatchGenerator } from '../src/workspace/patch-generator'

describe('patchGenerator', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = join(tmpdir(), `quack-patch-generator-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('resolves multi-step patch chains', async () => {
    await writeBundleIndex(tempDir, [
      createPatch('patch-1-2.qpk', 1, 2, 1002, 4, 400),
      createPatch('patch-2-3.qpk', 2, 3, 2003, 3, 300),
      createPatch('patch-3-4.qpk', 3, 4, 3004, 2, 200),
    ])

    const generator = new PatchGenerator(tempDir)

    await expect(generator.getPatchChain(1, 4)).resolves.toEqual([
      { filename: 'patch-1-2.qpk', fromVersion: 1, toVersion: 2, patchVersion: 1002 },
      { filename: 'patch-2-3.qpk', fromVersion: 2, toVersion: 3, patchVersion: 2003 },
      { filename: 'patch-3-4.qpk', fromVersion: 3, toVersion: 4, patchVersion: 3004 },
    ])
  })

  it('returns an empty chain when source and target versions match', async () => {
    await writeBundleIndex(tempDir, [
      createPatch('patch-1-2.qpk', 1, 2, 1002, 1, 100),
    ])

    const generator = new PatchGenerator(tempDir)

    await expect(generator.getPatchChain(2, 2)).resolves.toEqual([])
  })

  it('prefers a direct patch over a longer chain', async () => {
    await writeBundleIndex(tempDir, [
      createPatch('patch-1-2.qpk', 1, 2, 1002, 4, 400),
      createPatch('patch-2-4.qpk', 2, 4, 2004, 3, 300),
      createPatch('patch-1-4.qpk', 1, 4, 1004, 10, 1000),
    ])

    const generator = new PatchGenerator(tempDir)

    await expect(generator.getPatchChain(1, 4)).resolves.toEqual([
      { filename: 'patch-1-4.qpk', fromVersion: 1, toVersion: 4, patchVersion: 1004 },
    ])
  })

  it('resolves reverse patch chains when downgrade patches are available', async () => {
    await writeBundleIndex(tempDir, [
      createPatch('patch-4-3.qpk', 4, 3, 4003, 2, 200),
      createPatch('patch-3-1.qpk', 3, 1, 3001, 5, 500),
      createPatch('patch-2-1.qpk', 2, 1, 2001, 1, 100),
    ])

    const generator = new PatchGenerator(tempDir)

    await expect(generator.getPatchChain(4, 1)).resolves.toEqual([
      { filename: 'patch-4-3.qpk', fromVersion: 4, toVersion: 3, patchVersion: 4003 },
      { filename: 'patch-3-1.qpk', fromVersion: 3, toVersion: 1, patchVersion: 3001 },
    ])
  })

  it('returns null when no chain reaches the target version', async () => {
    await writeBundleIndex(tempDir, [
      createPatch('patch-1-2.qpk', 1, 2, 1002, 1, 100),
      createPatch('patch-3-4.qpk', 3, 4, 3004, 1, 100),
    ])

    const generator = new PatchGenerator(tempDir)

    await expect(generator.getPatchChain(1, 4)).resolves.toBeNull()
  })

  it('resolves patch chains for workspace bundles independently', async () => {
    await writeWorkspaceIndex(tempDir, {
      main: [
        createPatch('main-1-2.qpk', 1, 2, 1002, 1, 100),
        createPatch('main-2-3.qpk', 2, 3, 2003, 1, 100),
      ],
      voice: [
        createPatch('voice-1-3.qpk', 1, 3, 1003, 1, 100),
      ],
    })

    const generator = new PatchGenerator(tempDir)

    await expect(generator.getWorkspaceBundlePatchChain('main', 1, 3)).resolves.toEqual([
      { filename: 'main-1-2.qpk', fromVersion: 1, toVersion: 2, patchVersion: 1002 },
      { filename: 'main-2-3.qpk', fromVersion: 2, toVersion: 3, patchVersion: 2003 },
    ])
    await expect(generator.getWorkspaceBundlePatchChain('voice', 1, 3)).resolves.toEqual([
      { filename: 'voice-1-3.qpk', fromVersion: 1, toVersion: 3, patchVersion: 1003 },
    ])
  })

  it('requires minGameVersion and records compatibility in patch manifest and index', async () => {
    await writeFile(join(tempDir, 'asset.txt'), 'new')
    const fromBuildLog = createBuildLog(1, {
      'asset.txt': { hash: 'old-hash', size: 3, version: 1, mtime: 1 },
    })
    const toBuildLog = createBuildLog(2, {
      'asset.txt': { hash: 'new-hash', path: join(tempDir, 'asset.txt'), size: 3, version: 2, mtime: 2 },
    }, { minGameVersion: '1.2.0' })
    const generator = new PatchGenerator(tempDir)

    await generator.generatePatch({
      fromVersion: 1,
      toVersion: 2,
      fromBuildLog,
      toBuildLog,
      output: join(tempDir, 'patch-1-2.qpk'),
      format: 'qpk',
    })

    const { manifest } = await new QPKBundler().readBundle(join(tempDir, 'patch-1-2.qpk'))
    const index = JSON.parse(await readFile(join(tempDir, 'index.json'), 'utf8'))

    expect(manifest.compatibility).toEqual({ minGameVersion: '1.2.0' })
    expect(manifest.buildNumber).toBe('build-2')
    expect(index.availablePatches[0].compatibility).toEqual({ minGameVersion: '1.2.0' })
  })

  it('fails patch generation when target compatibility is missing', async () => {
    await writeFile(join(tempDir, 'asset.txt'), 'new')
    const generator = new PatchGenerator(tempDir)

    await expect(generator.generatePatch({
      fromVersion: 1,
      toVersion: 2,
      fromBuildLog: createBuildLog(1, {
        'asset.txt': { hash: 'old-hash', size: 3, version: 1, mtime: 1 },
      }),
      toBuildLog: createBuildLog(2, {
        'asset.txt': { hash: 'new-hash', size: 3, version: 2, mtime: 2 },
      }),
      output: join(tempDir, 'patch-1-2.qpk'),
      format: 'qpk',
    })).rejects.toThrow('Patch requires compatibility.minGameVersion')
  })

  it('rejects patch compatibility that differs from the target build compatibility', async () => {
    await writeFile(join(tempDir, 'asset.txt'), 'new')
    const generator = new PatchGenerator(tempDir)

    await expect(generator.generatePatch({
      fromVersion: 1,
      toVersion: 2,
      fromBuildLog: createBuildLog(1, {
        'asset.txt': { hash: 'old-hash', size: 3, version: 1, mtime: 1 },
      }),
      toBuildLog: createBuildLog(2, {
        'asset.txt': { hash: 'new-hash', path: join(tempDir, 'asset.txt'), size: 3, version: 2, mtime: 2 },
      }, { minGameVersion: '1.2.0' }),
      output: join(tempDir, 'patch-1-2.qpk'),
      format: 'qpk',
      compatibility: { minGameVersion: '1.0.0' },
    })).rejects.toThrow('must match target build minGameVersion "1.2.0"')
  })
})

function createPatch(
  filename: string,
  fromVersion: number,
  toVersion: number,
  patchVersion: number,
  changeCount: number,
  size: number,
) {
  return {
    filename,
    hash: `hash-${filename}`,
    fromVersion,
    toVersion,
    patchVersion,
    created: new Date(0).toISOString(),
    size,
    changeCount,
  }
}

async function writeBundleIndex(tempDir: string, availablePatches: ReturnType<typeof createPatch>[]): Promise<void> {
  await writeFile(join(tempDir, 'index.json'), JSON.stringify({
    currentVersion: 4,
    currentBuild: 'build-4',
    latestBundle: null,
    previousBuilds: [],
    availablePatches,
  }, null, 2))
}

async function writeWorkspaceIndex(
  tempDir: string,
  bundlePatches: Record<string, ReturnType<typeof createPatch>[]>,
): Promise<void> {
  await writeFile(join(tempDir, 'workspace-index.json'), JSON.stringify({
    workspace: {
      name: 'test-workspace',
      version: '1.0.0',
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
    },
    currentVersion: 3,
    currentBuild: 'build-3',
    bundles: Object.fromEntries(
      Object.entries(bundlePatches).map(([bundleName, availablePatches]) => [
        bundleName,
        {
          name: bundleName,
          displayName: bundleName,
          currentVersion: 3,
          currentBuild: 'build-3',
          priority: 0,
          dependencies: [],
          loadTrigger: 'immediate',
          latestBundle: null,
          previousBuilds: [],
          availablePatches,
        },
      ]),
    ),
    globalPatches: [],
  }, null, 2))
}

function createBuildLog(
  bundleVersion: number,
  assets: BuildLog['assets'],
  compatibility?: BuildLog['compatibility'],
): BuildLog {
  return {
    buildNumber: `build-${bundleVersion}`,
    bundleVersion,
    timestamp: new Date(bundleVersion).toISOString(),
    bundlePath: '',
    bundleHash: '',
    compatibility,
    totalFiles: Object.keys(assets).length,
    totalSize: Object.values(assets).reduce((sum, asset) => sum + asset.size, 0),
    assets,
    merkleTree: { hash: '', isLeaf: true },
    merkleRoot: '',
    buildStats: {
      processingTime: 0,
      compressionRatio: 0,
      locales: ['default'],
    },
  }
}
