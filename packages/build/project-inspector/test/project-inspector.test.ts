import type { AssetInfo, BundleManifest } from '../../quack/src/core/types'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QPKBundler } from '../../quack/src/bundlers/qpk-bundler'
import { createQuaProjectInspector } from '../src'

describe('@quajs/project-inspector', () => {
  it('aggregates story tree declarations from multiple QuaScript files', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    writeFileSync(join(projectRoot, 'start.qs'), '@Scene("school")\n@Node("start")\nYuki: Hi\n- Go -> library')
    writeFileSync(join(projectRoot, 'library.qs'), '@Scene("school")\n@Node("library")\nYuki: Library')

    const inspector = createQuaProjectInspector({ projectRoot })
    const snapshot = await inspector.refresh()

    expect(snapshot.storyTree.scenes.map(scene => scene.id)).toContain('school')
    expect(snapshot.storyTree.nodes.map(node => node.id)).toEqual(expect.arrayContaining(['start', 'library']))
    expect(inspector.inspectStoryPoint({ nodeId: 'start' }).edges.outbound[0]?.to).toBe('library')
  })

  it('indexes runtime package metadata from manifest json', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    writeFileSync(join(projectRoot, 'runtime.json'), JSON.stringify({
      runtimePackage: {
        id: 'runtime.extra',
        version: '1.0.0',
        dependencies: ['base'],
        scripts: [{
          id: 'runtime.extra.story',
          metadata: {
            story: {
              nodes: [{ id: 'runtime-node', point: { sceneId: 'school', nodeId: 'runtime-node', contentPackageId: 'runtime.extra', requiredRuntimePackages: ['base'] } }],
            },
          },
        }],
      },
    }))

    const inspector = createQuaProjectInspector({ projectRoot })
    const snapshot = await inspector.refresh()
    const packageRecord = snapshot.packageGraph.packages.find(item => item.id === 'runtime.extra')

    expect(packageRecord?.dependencies).toEqual(['base'])
    expect(snapshot.storyTree.nodes.find(node => node.id === 'runtime-node')?.packageId).toBe('runtime.extra')
    expect(inspector.inspectStoryPoint({ nodeId: 'runtime-node' }).requiredRuntimePackages).toEqual(expect.arrayContaining(['runtime.extra', 'base']))
  })

  it('inspects entries and labels from story tree refs', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    writeFileSync(join(projectRoot, 'runtime.json'), JSON.stringify({
      runtimePackage: {
        id: 'runtime.extra',
        version: '1.0.0',
        scripts: [{
          id: 'runtime.extra.story',
          metadata: {
            story: {
              entries: [{ id: 'start', point: { sceneId: 'school', contentPackageId: 'runtime.extra', requiredRuntimePackages: ['runtime.base'] } }],
              labels: [{ id: 'checkpoint', point: { sceneId: 'school', nodeId: 'runtime-node', contentPackageId: 'runtime.extra' } }],
              nodes: [{ id: 'runtime-node', point: { sceneId: 'school', nodeId: 'runtime-node', contentPackageId: 'runtime.extra' } }],
            },
          },
        }],
      },
    }))

    const inspector = createQuaProjectInspector({ projectRoot })
    await inspector.refresh()
    const entryInspection = inspector.inspectStoryPoint({ entryId: 'start', packageId: 'runtime.extra' })
    const labelInspection = inspector.inspectStoryPoint({ labelId: 'checkpoint', packageId: 'runtime.extra' })

    expect(entryInspection.kind).toBe('entry')
    expect(entryInspection.entry?.id).toBe('start')
    expect(entryInspection.requiredRuntimePackages).toEqual(expect.arrayContaining(['runtime.extra', 'runtime.base']))
    expect(labelInspection.kind).toBe('label')
    expect(labelInspection.label?.id).toBe('checkpoint')
    expect(labelInspection.node?.id).toBe('runtime-node')
  })

  it('reads compressed qpk manifests and asset summaries', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    const asset = createAsset(projectRoot, 'story.js', 'export default {}')
    const manifest = createManifest({
      runtimePackage: {
        id: 'runtime.qpk',
        version: '1.0.0',
        scripts: [{ id: 'runtime.qpk.story', assetName: 'story.js' }],
      },
      compression: { algorithm: 'lzma', level: 1 },
      totalFiles: 1,
      totalSize: asset.size,
    })
    await new QPKBundler().createBundle([asset], manifest, join(projectRoot, 'runtime.qpk'), { compress: true, encrypt: false })

    const inspector = createQuaProjectInspector({ projectRoot })
    const snapshot = await inspector.refresh()
    const packageRecord = snapshot.packageGraph.packages.find(item => item.id === 'runtime.qpk')

    expect(packageRecord?.assetCount).toBe(1)
    expect(packageRecord?.scripts[0]?.id).toBe('runtime.qpk.story')
  })

  it('reports encrypted qpk packages as locked when no key is provided', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    const asset = createAsset(projectRoot, 'story.js', 'export default {}')
    const manifest = createManifest({
      encryption: { enabled: true, algorithm: 'xor' },
      runtimePackage: { id: 'runtime.locked', version: '1.0.0' },
      totalFiles: 1,
      totalSize: asset.size,
    })
    await new QPKBundler([], 'xor', 'secret-key').createBundle([asset], manifest, join(projectRoot, 'locked.qpk'), { compress: false, encrypt: true })

    const inspector = createQuaProjectInspector({ projectRoot })
    const snapshot = await inspector.refresh()

    expect(snapshot.packageGraph.packages.some(item => item.locked)).toBe(true)
    expect(snapshot.packageGraph.risks.some(risk => risk.code === 'qpk.locked')).toBe(true)
  })

  it('tracks asset lineage from decorators and choices', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    mkdirSync(join(projectRoot, 'assets/images'), { recursive: true })
    writeFileSync(join(projectRoot, 'assets/images/classroom.png'), '')
    writeFileSync(join(projectRoot, 'scene.qs'), '@Node("start", { image: image("classroom.png") })\nYuki: Hi')

    const inspector = createQuaProjectInspector({ projectRoot })
    const snapshot = await inspector.refresh()

    expect(snapshot.assetLineage.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'classroom.png', status: 'present', type: 'images' }),
    ]))
  })

  it('reports package health and missing runtime package dependencies', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    writeFileSync(join(projectRoot, 'runtime.json'), JSON.stringify({
      runtimePackage: {
        id: 'runtime.extra',
        version: '1.2.0',
        dependencies: ['runtime.base'],
        integrity: { hash: 'abc123', algorithm: 'sha256' },
        signature: { value: 'sig', algorithm: 'ed25519', keyId: 'dev' },
        scripts: [{
          id: 'runtime.extra.story',
          assetName: 'story.js',
          metadata: {
            story: {
              nodes: [{ id: 'runtime-node', point: { sceneId: 'school', nodeId: 'runtime-node', contentPackageId: 'runtime.extra' } }],
              labels: [{ id: 'runtime-label', point: { sceneId: 'school', nodeId: 'runtime-node', contentPackageId: 'runtime.extra' } }],
              entries: [{ id: 'start', point: { sceneId: 'school', contentPackageId: 'runtime.extra' } }],
            },
          },
        }],
        scenes: [{ id: 'runtime-scene', assetName: 'scene.js' }],
        plugins: [{ id: 'runtime-plugin', kind: 'engine', assetName: 'plugin.js' }],
        storeMigrations: [{ id: 'settings-defaults', assetName: 'migration.js' }],
        storyGraphDeltas: [{ id: 'delta-1', nodes: [] }],
      },
    }))

    const inspector = createQuaProjectInspector({ projectRoot })
    const snapshot = await inspector.refresh()
    const report = inspector.getPackageHealthReport()
    const packageHealth = report.packages.find(item => item.id === 'runtime.extra')

    expect(snapshot.packageHealthReport.summary.packageCount).toBe(1)
    expect(snapshot.packageHealthReport.summary.missingDependencyCount).toBe(1)
    expect(snapshot.packageHealthReport.risks.some(risk => risk.code === 'package.dependency_missing')).toBe(true)
    expect(packageHealth).toMatchObject({
      dependencyCount: 1,
      hasIntegrity: true,
      hasSignature: true,
      migrationCount: 1,
      missingDependencies: ['runtime.base'],
      pluginCount: 1,
      sceneCount: 1,
      scriptCount: 1,
      storyGraphDeltaCount: 1,
      storyPointCount: 3,
      version: '1.2.0',
    })
    expect(packageHealth?.riskCounts.error).toBe(1)
  })

  it('filters asset lineage by package and type', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    writeFileSync(join(projectRoot, 'runtime.json'), JSON.stringify({
      runtimePackage: {
        id: 'runtime.extra',
        version: '1.0.0',
        scripts: [{ id: 'runtime.extra.story', assetName: 'story.js' }],
      },
      assets: {
        images: {
          'runtime-bg.png': {
            hash: 'runtime-bg-hash',
            name: 'runtime-bg.png',
            path: 'assets/images/runtime-bg.png',
            relativePath: 'assets/images/runtime-bg.png',
            size: 42,
            type: 'images',
          },
        },
      },
    }))
    writeFileSync(join(projectRoot, 'scene.qs'), '@Node("start", { image: image("runtime-bg.png", { runtimePackageId: "runtime.extra" }) })\nYuki: Hi')

    const inspector = createQuaProjectInspector({ projectRoot })
    await inspector.refresh()
    const lineage = inspector.getAssetLineage({ packageId: 'runtime.extra', type: 'images' })

    expect(lineage.assets).toEqual([
      expect.objectContaining({
        name: 'runtime-bg.png',
        packageId: 'runtime.extra',
        status: 'present',
        type: 'images',
      }),
    ])
  })

  it('filters asset lineage risks with the same package and type constraints', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'qua-inspector-'))
    writeFileSync(join(projectRoot, 'scene.qs'), [
      '@Node("start", { image: image("missing-bg.png", { runtimePackageId: "runtime.extra" }) })',
      'Yuki: Hi',
      '@Node("next", { image: image("missing-base.png") })',
      'Yuki: Next',
    ].join('\n'))

    const inspector = createQuaProjectInspector({ projectRoot })
    await inspector.refresh()
    const runtimeLineage = inspector.getAssetLineage({ packageId: 'runtime.extra', type: 'images' })

    expect(runtimeLineage.assets).toEqual([
      expect.objectContaining({
        name: 'missing-bg.png',
        packageId: 'runtime.extra',
        status: 'missing',
        type: 'images',
      }),
    ])
    expect(runtimeLineage.risks).toEqual([
      expect.objectContaining({
        assetName: 'missing-bg.png',
        assetType: 'images',
        packageId: 'runtime.extra',
      }),
    ])
  })
})

function createAsset(tempDir: string, fileName: string, content: string): AssetInfo {
  const filePath = join(tempDir, fileName)
  writeFileSync(filePath, content)
  return {
    hash: `${fileName}-hash`,
    locales: ['default'],
    name: fileName,
    path: filePath,
    relativePath: fileName,
    size: Buffer.byteLength(content),
    type: 'scripts',
  }
}

function createManifest(overrides: Partial<BundleManifest> = {}): BundleManifest {
  return {
    assets: {
      audio: {},
      characters: {},
      data: {},
      fonts: {},
      images: {},
      scripts: {},
      video: {},
    },
    bundleVersion: 1,
    bundler: 'quack',
    compression: { algorithm: 'none', level: 0 },
    created: new Date().toISOString(),
    createdAt: Date.now(),
    defaultLocale: 'default',
    encryption: { enabled: false, algorithm: 'none' },
    format: 'qpk',
    locales: ['default'],
    name: 'runtime',
    totalFiles: 0,
    totalSize: 0,
    version: '1.0.0',
    ...overrides,
  }
}
