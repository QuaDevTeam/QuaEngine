import type {
  QuaTargetBootstrap,
  TargetBundleManifest,
} from '@quajs/native-contracts'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  COCOS_TARGET_BOOTSTRAP,
  createTargetBundleNativeRendererInfo,
  createTargetBundleNativeRuntimeInfo,
  createTargetCoreSelection,
  NATIVE_TARGET_BOOTSTRAP,
  validateTargetBundleManifest,
  WEB_TARGET_BOOTSTRAP,
} from '@quajs/native-contracts'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createQuaProjectAssetTargets,
  createQuaProjectNativeArtifactPlans,
  createQuaProjectNativeTargetBundleManifest,
  doctorQuaProjectConfig,
  emitQuaProjectNativeTargetBundleManifest,
  emitQuaTargetBundleManifest,
  loadQuaProjectConfig,
  mergeQuaProjectAssetTargets,
  normalizeQuaProjectConfig,
  QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE,
  QUA_TARGET_BUNDLE_MANIFEST_FILE,
  syncQuaProjectCocos,
} from '../src/project'

const tempDirs: string[] = []

const NATIVE_RENDERER_CAPABILITIES = [
  {
    id: 'native-wgpu.ui.surface@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.ui.overlays'],
    quiComponents: ['Box', 'Text'],
    qssFeatures: ['background-color'],
    fallback: 'reject-package',
  },
] as const

const CORE_ADAPTERS_BY_TARGET = {
  web: WEB_TARGET_BOOTSTRAP.coreAdapters,
  cocos: COCOS_TARGET_BOOTSTRAP.coreAdapters,
  native: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
} satisfies Record<QuaTargetBootstrap, readonly string[]>

describe('qua project config', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('loads YAML and normalizes package-version and Web defaults', async () => {
    const root = await createProjectRoot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '2.3.4' }), 'utf8')
    await writeFile(join(root, 'qua.project.yaml'), [
      'schemaVersion: 1',
      'name: Star Light',
      'bundleId: com.example.starlight',
      'icons:',
      '  source: assets/app/icon.png',
      '',
    ].join('\n'), 'utf8')

    const project = await loadQuaProjectConfig({ cwd: root })

    expect(project.version).toBe('2.3.4')
    expect(project.home.title).toBe('Star Light')
    expect(project.targets.web).toMatchObject({
      enabled: true,
      layout: 'landscape',
      devices: { desktop: true, pad: true, phone: true },
      pwa: { enabled: false, serviceWorker: 'generated' },
    })
    expect(project.targets.cocos).toBeUndefined()
    expect(project.targets.native).toBeUndefined()
  })

  it('loads JSON and requires an explicit path when duplicate config files exist', async () => {
    const root = await createProjectRoot()
    await writeFile(join(root, 'qua.project.json'), JSON.stringify(createProjectConfig(), null, 2), 'utf8')
    await writeFile(join(root, 'qua.project.yaml'), [
      'schemaVersion: 1',
      'name: Duplicate',
      'bundleId: com.example.duplicate',
      'icons:',
      '  source: assets/app/icon.png',
      '',
    ].join('\n'), 'utf8')

    await expect(loadQuaProjectConfig({ cwd: root })).rejects.toThrow('Multiple Qua project config files found')
    await expect(loadQuaProjectConfig({ cwd: root, configPath: 'qua.project.json' }))
      .resolves
      .toMatchObject({ name: 'Star Light', bundleId: 'com.example.starlight' })
  })

  it('rejects invalid bundle IDs and missing Web icons', () => {
    expect(() => normalizeQuaProjectConfig({
      schemaVersion: 1,
      name: 'Bad Id',
      bundleId: 'bad id',
      icons: { source: 'assets/app/icon.png' },
    })).toThrow('Invalid bundleId')

    expect(() => normalizeQuaProjectConfig({
      schemaVersion: 1,
      name: 'No Icon',
      bundleId: 'com.example.noicon',
    })).toThrow('icons.favicon or icons.source')
  })

  it('rejects missing local icon source files during loading', async () => {
    const root = await createProjectRoot({ icon: false })
    await writeFile(join(root, 'qua.project.yaml'), [
      'schemaVersion: 1',
      'name: Missing Icon',
      'bundleId: com.example.missingicon',
      'icons:',
      '  source: assets/app/missing.png',
      '',
    ].join('\n'), 'utf8')

    await expect(loadQuaProjectConfig({ cwd: root })).rejects.toThrow('Qua project icon source file not found')
  })

  it('lets doctor report missing icon sources when asset validation is skipped', async () => {
    const root = await createProjectRoot({ icon: false })
    await writeFile(join(root, 'qua.project.yaml'), [
      'schemaVersion: 1',
      'name: Missing Icon Doctor',
      'bundleId: com.example.missingicondoctor',
      'icons:',
      '  source: assets/app/missing.png',
      '',
    ].join('\n'), 'utf8')

    const project = await loadQuaProjectConfig({ cwd: root, validateAssets: false })
    const result = await doctorQuaProjectConfig(project, { cwd: root })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'web.asset.missing',
        filePath: 'assets/app/missing.png',
        severity: 'error',
      }),
    ]))
  })

  it('validates PWA and Cocos target requirements', () => {
    expect(() => normalizeQuaProjectConfig({
      schemaVersion: 1,
      name: 'PWA No Icon',
      bundleId: 'com.example.pwanoicon',
      targets: { web: { pwa: { enabled: true } } },
    })).toThrow('at least one icon source')

    expect(() => normalizeQuaProjectConfig({
      schemaVersion: 1,
      name: 'Cocos No Platforms',
      bundleId: 'com.example.cocosnoplat',
      icons: { source: 'assets/app/icon.png' },
      targets: { cocos: { enabled: true } },
    })).toThrow('targets.cocos.platforms')
  })

  it('creates and merges project asset targets', () => {
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        web: {
          assetTarget: {
            name: 'web-modern',
            platform: 'web',
            suffix: 'web',
            pipeline: { images: { format: 'webp' } },
          },
        },
        cocos: {
          projectDir: 'cocos',
          creatorVersion: '3.8',
          platforms: ['android', 'ios'],
          assetTarget: {
            resourceRoot: 'assets/resources',
            hybrid: { enabled: true },
          },
        },
        native: {
          platforms: ['macos', 'windows'],
          profiles: ['debug', 'release'],
          assetTarget: {
            name: 'native-desktop',
            suffix: 'desktop',
            pipeline: { images: { format: 'webp' } },
          },
        },
      },
    })

    const targets = createQuaProjectAssetTargets(project)
    expect(targets.map(target => target.name)).toEqual([
      'web-modern',
      'cocos-android',
      'cocos-ios',
      'native-desktop-macos',
      'native-desktop-windows',
    ])
    expect(targets[1]).toMatchObject({
      platform: 'cocos',
      cocos: {
        creatorVersion: '3.8',
        buildPlatforms: ['android'],
        resourceRoot: 'assets/resources',
        hybrid: { enabled: true },
      },
    })
    expect(targets[3]).toMatchObject({
      platform: 'native',
      suffix: 'desktop-macos',
      pipeline: { images: { format: 'webp' } },
    })

    const merged = mergeQuaProjectAssetTargets([
      { name: 'web-modern', platform: 'web', suffix: 'old', compression: { algorithm: 'none' } },
    ], targets)
    expect(merged.find(target => target.name === 'web-modern')).toMatchObject({
      suffix: 'web',
      compression: { algorithm: 'none' },
      pipeline: { images: { format: 'webp' } },
    })
  })

  it('normalizes native target packaging metadata', () => {
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['macos', 'windows'],
          profiles: ['release'],
          layout: 'portrait',
          outputDir: 'dist/native-apps',
          app: {
            buildNumber: '42',
            icon: 'assets/app/icon.png',
          },
        },
      },
    })

    expect(project.targets.native).toMatchObject({
      enabled: true,
      platforms: ['macos', 'windows'],
      profiles: ['release'],
      layout: 'portrait',
      outputDir: 'dist/native-apps',
      app: {
        bundleId: 'com.example.starlight',
        version: '1.0.0',
        buildNumber: '42',
        icon: 'assets/app/icon.png',
      },
    })
  })

  it('creates version-isolated native artifact plans', () => {
    const noNativeProject = normalizeQuaProjectConfig(createProjectConfig())
    expect(createQuaProjectNativeArtifactPlans(noNativeProject)).toEqual([])

    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['macos', 'windows'],
          profiles: ['debug', 'release'],
          outputDir: 'dist/native-apps',
          app: {
            version: '1.2.3 beta',
            buildNumber: 'build 42',
            icon: 'assets/app/icon.icns',
          },
          assetTarget: {
            name: 'native-desktop',
            pipeline: { images: { format: 'webp' } },
          },
          build: {
            hardening: true,
          },
        },
      },
    })

    const plans = createQuaProjectNativeArtifactPlans(project)

    expect(plans.map(plan => `${plan.profile}/${plan.platform}`)).toEqual([
      'debug/macos',
      'debug/windows',
      'release/macos',
      'release/windows',
    ])
    expect(plans[0]).toMatchObject({
      target: 'native',
      platform: 'macos',
      profile: 'debug',
      outputDir: 'dist/native-apps',
      versionSegment: '1.2.3-beta-build-42',
      artifactDir: join('dist/native-apps', 'debug', '1.2.3-beta-build-42', 'macos'),
      app: {
        bundleId: 'com.example.starlight',
        version: '1.2.3 beta',
        buildNumber: 'build 42',
        icon: 'assets/app/icon.icns',
      },
      assetTarget: {
        name: 'native-desktop',
        pipeline: { images: { format: 'webp' } },
      },
      build: {
        hardening: true,
      },
    })
    expect(new Set(plans.map(plan => plan.versionSegment))).toEqual(new Set(['1.2.3-beta-build-42']))
    expect(plans.map(plan => plan.artifactDir)).toEqual([
      join('dist/native-apps', 'debug', '1.2.3-beta-build-42', 'macos'),
      join('dist/native-apps', 'debug', '1.2.3-beta-build-42', 'windows'),
      join('dist/native-apps', 'release', '1.2.3-beta-build-42', 'macos'),
      join('dist/native-apps', 'release', '1.2.3-beta-build-42', 'windows'),
    ])
  })

  it('creates native target bundle manifests from artifact plans', () => {
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['macos'],
          profiles: ['release'],
          outputDir: 'dist/native-apps',
          app: {
            icon: 'assets/app/AppIcon.icns',
          },
        },
      },
    })
    const [plan] = createQuaProjectNativeArtifactPlans(project)
    const manifest = createQuaProjectNativeTargetBundleManifest(plan, {
      nativeRenderer: createTestNativeRendererInfo(),
      nativeRuntime: createTestNativeRuntimeInfo(),
      dependencies: [
        '@quajs/engine',
        '@quajs/pipeline',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      ],
      rendererEntries: [
        { specifier: '@quajs/native-renderer/builtin', target: 'native' },
      ],
      runtimePackages: [
        {
          id: 'runtime.chapter.native',
          executableDependencies: ['@quajs/character'],
          rendererEntries: [
            { specifier: '@quajs/native-renderer/ui', target: 'native' },
          ],
        },
      ],
    })

    expect(validateTargetBundleManifest(manifest, { expectedTarget: 'native' })).toMatchObject({
      ok: true,
      diagnostics: [],
    })
    expect(manifest).toMatchObject({
      target: 'native',
      profile: 'release',
      platform: 'macos',
      app: {
        bundleId: 'com.example.starlight',
        version: '1.0.0',
        buildNumber: '1',
        icon: 'assets/app/AppIcon.icns',
      },
      targetCoreResolver: 'native-core-resolver',
      selectedCorePluginFamily: 'native-core',
      selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      nativeRuntime: {
        quickjsVersion: '2025-04-26',
        nativeRuntimeVersion: '0.1.0',
        assetAdapterVersion: '0.1.0',
        storeAdapterVersion: '0.1.0',
      },
      projectGraphs: [
        {
          id: 'native.release.macos.post-bundle',
          kind: 'post-bundle',
          references: expect.arrayContaining([
            '@quajs/engine',
            '@quajs/pipeline',
            '@quajs/engine-native',
            { specifier: '@quajs/native-renderer/builtin', target: 'native' },
            '@quajs/character',
            { specifier: '@quajs/native-renderer/ui', target: 'native' },
          ]),
        },
      ],
    })
  })

  it('rejects native project template graphs that redeclare target core adapters', () => {
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['macos'],
          profiles: ['release'],
          outputDir: 'dist/native-apps',
          app: {
            icon: 'assets/app/AppIcon.icns',
          },
        },
      },
    })
    const [plan] = createQuaProjectNativeArtifactPlans(project)
    const manifest = createQuaProjectNativeTargetBundleManifest(plan, {
      nativeRenderer: createTestNativeRendererInfo(),
      nativeRuntime: createTestNativeRuntimeInfo(),
      dependencies: [
        '@quajs/engine',
        '@quajs/pipeline',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      ],
      rendererEntries: [
        { specifier: '@quajs/native-renderer/builtin', target: 'native' },
      ],
      projectGraphs: [
        {
          id: 'native.template.generated',
          kind: 'project-template',
          references: [
            '@quajs/engine',
            '@quajs/engine-native/native-host',
          ],
        },
      ],
    })
    const validation = validateTargetBundleManifest(manifest, { expectedTarget: 'native' })

    expect(validation.ok).toBe(false)
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER',
        target: 'native',
        packageName: '@quajs/engine-native',
        projectGraphId: 'native.template.generated',
        projectGraphKind: 'project-template',
      }),
    ]))
  })

  it('emits validated native target bundle manifests into artifact directories', async () => {
    const root = await createProjectRoot()
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['macos'],
          profiles: ['release'],
          outputDir: join(root, 'dist/native-apps'),
          app: {
            icon: 'assets/app/AppIcon.icns',
          },
        },
      },
    })
    const [plan] = createQuaProjectNativeArtifactPlans(project)
    const result = await emitQuaProjectNativeTargetBundleManifest(plan, {
      nativeRenderer: createTestNativeRendererInfo(),
      nativeRuntime: createTestNativeRuntimeInfo(),
      dependencies: [
        '@quajs/engine',
        '@quajs/pipeline',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      ],
      rendererEntries: [
        { specifier: '@quajs/native-renderer/builtin', target: 'native' },
      ],
    })
    const manifestJson = JSON.parse(await readFile(result.manifestPath, 'utf8')) as Record<string, any>

    expect(result.validation.ok).toBe(true)
    expect(result.manifestPath).toBe(join(plan.artifactDir, QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE))
    expect(manifestJson).toMatchObject({
      target: 'native',
      targetCoreResolver: 'native-core-resolver',
      selectedCorePluginFamily: 'native-core',
      nativeRuntime: {
        quickjsVersion: '2025-04-26',
        nativeRuntimeVersion: '0.1.0',
        assetAdapterVersion: '0.1.0',
        storeAdapterVersion: '0.1.0',
      },
      projectGraphs: [
        {
          id: 'native.release.macos.post-bundle',
          kind: 'post-bundle',
        },
      ],
    })
  })

  it('refuses to overwrite an existing native release manifest with different metadata', async () => {
    const root = await createProjectRoot()
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['macos'],
          profiles: ['release'],
          outputDir: join(root, 'dist/native-apps'),
          app: {
            icon: 'assets/app/AppIcon.icns',
          },
        },
      },
    })
    const [plan] = createQuaProjectNativeArtifactPlans(project)
    const baseOptions = {
      nativeRenderer: createTestNativeRendererInfo(),
      nativeRuntime: createTestNativeRuntimeInfo(),
      dependencies: [
        '@quajs/engine',
        '@quajs/pipeline',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      ],
      rendererEntries: [
        { specifier: '@quajs/native-renderer/builtin', target: 'native' as const },
      ],
    }

    const first = await emitQuaProjectNativeTargetBundleManifest(plan, baseOptions)

    await expect(emitQuaProjectNativeTargetBundleManifest(plan, {
      ...baseOptions,
      dependencies: [
        ...baseOptions.dependencies,
        '@quajs/plugin-background',
      ],
    })).rejects.toThrow('already contains a different target-bundle-manifest.json')

    const manifestJson = JSON.parse(await readFile(first.manifestPath, 'utf8')) as Record<string, any>
    expect(manifestJson.dependencies).not.toContain('@quajs/plugin-background')
  })

  it('allows debug native manifests to be regenerated in place', async () => {
    const root = await createProjectRoot()
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['macos'],
          profiles: ['debug'],
          outputDir: join(root, 'dist/native-apps'),
          app: {
            icon: 'assets/app/AppIcon.icns',
          },
        },
      },
    })
    const [plan] = createQuaProjectNativeArtifactPlans(project)
    const baseOptions = {
      nativeRenderer: createTestNativeRendererInfo(),
      nativeRuntime: createTestNativeRuntimeInfo(),
      dependencies: [
        '@quajs/engine',
        '@quajs/pipeline',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      ],
      rendererEntries: [
        { specifier: '@quajs/native-renderer/builtin', target: 'native' as const },
      ],
    }

    const first = await emitQuaProjectNativeTargetBundleManifest(plan, baseOptions)
    const second = await emitQuaProjectNativeTargetBundleManifest(plan, {
      ...baseOptions,
      dependencies: [
        ...baseOptions.dependencies,
        '@quajs/plugin-background',
      ],
    })
    const manifestJson = JSON.parse(await readFile(second.manifestPath, 'utf8')) as Record<string, any>

    expect(first.manifestPath).toBe(second.manifestPath)
    expect(manifestJson.dependencies).toContain('@quajs/plugin-background')
  })

  it('rejects invalid native target bundle manifests before writing them', async () => {
    const root = await createProjectRoot()
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['macos'],
          profiles: ['release'],
          outputDir: join(root, 'dist/native-apps'),
          app: {
            icon: 'assets/app/AppIcon.icns',
          },
        },
      },
    })
    const [plan] = createQuaProjectNativeArtifactPlans(project)
    const manifestPath = join(plan.artifactDir, QUA_NATIVE_TARGET_BUNDLE_MANIFEST_FILE)

    await expect(emitQuaProjectNativeTargetBundleManifest(plan, {
      manifestPath,
      nativeRenderer: createTestNativeRendererInfo(),
      nativeRuntime: createTestNativeRuntimeInfo(),
      dependencies: [
        '@quajs/engine',
        '@quajs/pipeline',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
        '@quajs/renderer-web',
      ],
    })).rejects.toThrow('Target bundle manifest validation failed')
    await expect(readFile(manifestPath, 'utf8')).rejects.toThrow()
  })

  it('emits validated target bundle manifests for Web, Cocos, and native artifacts', async () => {
    const root = await createProjectRoot()

    for (const target of ['web', 'cocos', 'native'] as const) {
      const artifactDir = join(root, 'dist', target)
      const manifest = createTargetBundleManifestFixture(target)
      const result = await emitQuaTargetBundleManifest({
        artifactDir,
        expectedTarget: target,
        manifest,
      })
      const manifestJson = JSON.parse(await readFile(result.manifestPath, 'utf8')) as Record<string, any>

      expect(result.validation.ok).toBe(true)
      expect(result.manifestPath).toBe(join(artifactDir, QUA_TARGET_BUNDLE_MANIFEST_FILE))
      expect(manifestJson).toMatchObject({
        target,
        targetCoreResolver: `${target}-core-resolver`,
        selectedCoreAdapters: CORE_ADAPTERS_BY_TARGET[target],
      })
    }
  })

  it('rejects cross-target core adapters for Web, Cocos, and native manifests before writing', async () => {
    const root = await createProjectRoot()

    for (const target of ['web', 'cocos', 'native'] as const) {
      const artifactDir = join(root, 'dist', `leak-${target}`)
      const manifestPath = join(artifactDir, QUA_TARGET_BUNDLE_MANIFEST_FILE)
      const foreignCoreAdapters = foreignCoreAdaptersForTarget(target)
      const cleanManifest = createTargetBundleManifestFixture(target)
      const manifest: TargetBundleManifest = {
        ...cleanManifest,
        dependencies: [
          ...(cleanManifest.dependencies || []),
          ...foreignCoreAdapters,
        ],
      }
      const validation = validateTargetBundleManifest(manifest, { expectedTarget: target })

      expect(validation.ok).toBe(false)
      for (const packageName of foreignCoreAdapters) {
        expect(validation.diagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: 'TARGET_CORE_ADAPTER_FORBIDDEN',
            target,
            packageName,
          }),
        ]))
      }

      await expect(emitQuaTargetBundleManifest({
        artifactDir,
        expectedTarget: target,
        manifest,
        manifestPath,
      })).rejects.toThrow('Target bundle manifest validation failed')
      await expect(readFile(manifestPath, 'utf8')).rejects.toThrow()
    }
  })

  it('rejects generated project shells that redeclare active target core adapters before writing', async () => {
    const root = await createProjectRoot()

    for (const target of ['web', 'cocos', 'native'] as const) {
      const artifactDir = join(root, 'dist', `shell-core-${target}`)
      const manifestPath = join(artifactDir, QUA_TARGET_BUNDLE_MANIFEST_FILE)
      const activeCoreAdapter = CORE_ADAPTERS_BY_TARGET[target][0]
      const manifest: TargetBundleManifest = {
        ...createTargetBundleManifestFixture(target),
        projectGraphs: [
          {
            id: `${target}.startup.generated`,
            kind: 'startup-shell',
            references: [
              '@quajs/engine',
              activeCoreAdapter,
            ],
          },
        ],
      }
      const validation = validateTargetBundleManifest(manifest, { expectedTarget: target })

      expect(validation.ok).toBe(false)
      expect(validation.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER',
          target,
          packageName: activeCoreAdapter,
          projectGraphId: `${target}.startup.generated`,
          projectGraphKind: 'startup-shell',
        }),
      ]))

      await expect(emitQuaTargetBundleManifest({
        artifactDir,
        expectedTarget: target,
        manifest,
        manifestPath,
      })).rejects.toThrow('Target bundle manifest validation failed')
      await expect(readFile(manifestPath, 'utf8')).rejects.toThrow()
    }
  })

  it('rejects generated artifact graphs that pre-union Web, Cocos, and native core plugins before writing', async () => {
    const root = await createProjectRoot()
    const graphKinds = ['debug-shell', 'release-shell', 'smoke-runner', 'installer', 'updater'] as const
    const allTargetCoreAdapters = allTargetCoreAdaptersForProjectGraphs()

    for (const target of ['web', 'cocos', 'native'] as const) {
      const artifactDir = join(root, 'dist', `all-target-core-union-${target}`)
      const manifestPath = join(artifactDir, QUA_TARGET_BUNDLE_MANIFEST_FILE)
      const manifest: TargetBundleManifest = {
        ...createTargetBundleManifestFixture(target),
        projectGraphs: graphKinds.map(kind => ({
          id: `${target}.${kind}.generated`,
          kind,
          references: [
            '@quajs/engine',
            '@quajs/plugin-background',
            ...allTargetCoreAdapters,
          ],
        })),
      }
      const validation = validateTargetBundleManifest(manifest, { expectedTarget: target })

      expect(validation.ok).toBe(false)
      for (const kind of graphKinds) {
        expect(validation.diagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER',
            target,
            projectGraphId: `${target}.${kind}.generated`,
            projectGraphKind: kind,
          }),
        ]))
      }

      await expect(emitQuaTargetBundleManifest({
        artifactDir,
        expectedTarget: target,
        manifest,
        manifestPath,
      })).rejects.toThrow('Target bundle manifest validation failed')
      await expect(readFile(manifestPath, 'utf8')).rejects.toThrow()
    }
  })

  it('rejects target bundle manifests before writing when the expected target does not match', async () => {
    const root = await createProjectRoot()
    const manifestPath = join(root, 'dist/native', QUA_TARGET_BUNDLE_MANIFEST_FILE)

    await expect(emitQuaTargetBundleManifest({
      artifactDir: join(root, 'dist/native'),
      expectedTarget: 'native',
      manifest: createTargetBundleManifestFixture('web'),
      manifestPath,
    })).rejects.toThrow('Target bundle manifest validation failed')
    await expect(readFile(manifestPath, 'utf8')).rejects.toThrow()
  })

  it('validates native target platforms and profiles', () => {
    expect(() => normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        native: {
          platforms: ['ios'],
          profiles: ['staging'],
        },
      },
    })).toThrow(/targets\.native\.platforms.*targets\.native\.profiles/s)
  })

  it('syncs Cocos build config files and icon assets', async () => {
    const root = await createProjectRoot()
    await writeFile(join(root, 'qua.project.yaml'), [
      'schemaVersion: 1',
      'name: Star Light',
      'bundleId: com.example.starlight',
      'icons:',
      '  source: assets/app/icon.png',
      'targets:',
      '  cocos:',
      '    projectDir: cocos',
      '    creatorVersion: \'3.8\'',
      '    platforms: [android]',
      '    layout: portrait',
      '    buildOptions:',
      '      buildPath: native-build',
      '',
    ].join('\n'), 'utf8')

    const project = await loadQuaProjectConfig({ cwd: root })
    const result = await syncQuaProjectCocos(project, { cwd: root })
    const buildConfigPath = join(root, 'cocos/qua-build/android.build.json')
    const iconPath = join(root, 'cocos/assets/qua-app-icons/icon.png')
    const buildConfig = JSON.parse(await readFile(buildConfigPath, 'utf8')) as Record<string, any>

    expect(result.files).toEqual(expect.arrayContaining([buildConfigPath, iconPath]))
    expect(buildConfig).toMatchObject({
      name: 'Star Light',
      platform: 'android',
      buildPath: 'native-build',
      packages: {
        native: {
          packageName: 'com.example.starlight',
          bundleIdentifier: 'com.example.starlight',
          orientation: 'portrait',
          icons: {
            default: 'assets/qua-app-icons/icon.png',
          },
        },
      },
    })
  })

  it('doctors project target readiness', async () => {
    const root = await createProjectRoot()
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      targets: {
        web: {
          devices: { desktop: false, pad: false, phone: false },
        },
        cocos: {
          platforms: ['android'],
          assetTarget: {
            resourceRoot: 'assets/resources',
            hybrid: { enabled: true },
          },
        },
        native: {
          platforms: ['macos', 'windows'],
          profiles: ['debug'],
          outputDir: 'dist/native',
          app: {
            buildNumber: '7',
            icon: 'assets/app/icon.png',
          },
        },
      },
    })

    const result = await doctorQuaProjectConfig(project, { cwd: root })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'web.devices.none', severity: 'error' }),
      expect.objectContaining({ id: 'cocos.project-dir.missing', severity: 'warning' }),
      expect.objectContaining({ id: 'cocos.hybrid.enabled', severity: 'info' }),
      expect.objectContaining({ id: 'native.platforms', severity: 'info' }),
      expect.objectContaining({ id: 'native.profiles', severity: 'info' }),
    ]))
  })

  it('doctors native target icon readiness', async () => {
    const root = await createProjectRoot({ icon: false })
    const project = normalizeQuaProjectConfig({
      ...createProjectConfig(),
      icons: {},
      targets: {
        web: false,
        native: {
          platforms: ['macos'],
          app: {
            icon: 'assets/app/missing.icns',
          },
        },
      },
    })

    const result = await doctorQuaProjectConfig(project, { cwd: root })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'native.asset.missing',
        target: 'native',
        filePath: 'assets/app/missing.icns',
        severity: 'error',
      }),
    ]))
  })

  it('doctors PWA icon and service worker warnings', async () => {
    const root = await createProjectRoot()
    const project = await loadQuaProjectConfig({ cwd: root, configPath: await writeProjectConfig(root, [
      'schemaVersion: 1',
      'name: PWA Warnings',
      'bundleId: com.example.pwawarnings',
      'icons:',
      '  source: assets/app/icon.png',
      'targets:',
      '  web:',
      '    pwa:',
      '      enabled: true',
      '      serviceWorker: none',
      '      icons:',
      '        - src: assets/app/icon.png',
      '          sizes: 192x192',
      '          purpose: any',
      '',
    ]) })

    const result = await doctorQuaProjectConfig(project, { cwd: root })

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pwa.icons.maskable', severity: 'warning' }),
      expect.objectContaining({ id: 'pwa.service-worker.none', severity: 'warning' }),
    ]))
  })
})

async function createProjectRoot(options: { icon?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'qua-project-config-'))
  tempDirs.push(root)
  await mkdir(join(root, 'assets/app'), { recursive: true })
  if (options.icon !== false) {
    await writeFile(join(root, 'assets/app/icon.png'), new Uint8Array([1, 2, 3]))
  }
  return root
}

function createProjectConfig() {
  return {
    schemaVersion: 1,
    name: 'Star Light',
    bundleId: 'com.example.starlight',
    version: '1.0.0',
    icons: {
      source: 'assets/app/icon.png',
    },
  }
}

function createTestNativeRendererInfo() {
  return createTargetBundleNativeRendererInfo({
    version: '0.1.0',
    backendVersion: 'wgpu-test',
    capabilities: NATIVE_RENDERER_CAPABILITIES,
  }, payload => `sha256:test-${payload.length}`)
}

function createTestNativeRuntimeInfo() {
  return createTargetBundleNativeRuntimeInfo({
    quickjsVersion: '2025-04-26',
    nativeRuntimeVersion: '0.1.0',
    assetAdapterVersion: '0.1.0',
    storeAdapterVersion: '0.1.0',
  })
}

function createTargetBundleManifestFixture(target: QuaTargetBootstrap): TargetBundleManifest {
  const targetCore = createTargetCoreSelection(target)
  return {
    schemaVersion: 1,
    target,
    profile: 'release',
    platform: target === 'native' ? 'macos' : target,
    app: {
      bundleId: `com.example.${target}`,
      version: '1.0.0',
      buildNumber: '1',
      icon: 'assets/app/icon.png',
    },
    ...(target === 'native'
      ? {
          nativeRenderer: createTestNativeRendererInfo(),
          nativeRuntime: createTestNativeRuntimeInfo(),
        }
      : {}),
    targetCoreResolver: targetCore.targetCoreResolver,
    selectedCorePluginFamily: targetCore.selectedCorePluginFamily,
    selectedCoreAdapters: targetCore.selectedCoreAdapters,
    dependencies: [
      '@quajs/engine',
      '@quajs/pipeline',
      ...CORE_ADAPTERS_BY_TARGET[target],
    ],
    rendererEntries: [
      { specifier: rendererEntryForTarget(target), target },
    ],
  }
}

function rendererEntryForTarget(target: QuaTargetBootstrap): string {
  switch (target) {
    case 'web':
      return '@quajs/renderer-web/plugins/ui'
    case 'cocos':
      return '@quajs/renderer-cocos/plugins/ui'
    case 'native':
      return '@quajs/native-renderer/builtin'
  }
}

function foreignCoreAdaptersForTarget(target: QuaTargetBootstrap): string[] {
  return (Object.keys(CORE_ADAPTERS_BY_TARGET) as QuaTargetBootstrap[])
    .filter(candidate => candidate !== target)
    .flatMap(candidate => CORE_ADAPTERS_BY_TARGET[candidate])
}

function allTargetCoreAdaptersForProjectGraphs(): string[] {
  return (Object.keys(CORE_ADAPTERS_BY_TARGET) as QuaTargetBootstrap[])
    .flatMap(target => CORE_ADAPTERS_BY_TARGET[target])
}

async function writeProjectConfig(root: string, lines: string[]): Promise<string> {
  const configPath = join(root, 'qua.project.yaml')
  await writeFile(configPath, lines.join('\n'), 'utf8')
  return configPath
}
