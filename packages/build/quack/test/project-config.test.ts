import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createQuaProjectAssetTargets,
  doctorQuaProjectConfig,
  loadQuaProjectConfig,
  mergeQuaProjectAssetTargets,
  normalizeQuaProjectConfig,
  syncQuaProjectCocos,
} from '../src/project'

const tempDirs: string[] = []

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
      },
    })

    const targets = createQuaProjectAssetTargets(project)
    expect(targets.map(target => target.name)).toEqual(['web-modern', 'cocos-android', 'cocos-ios'])
    expect(targets[1]).toMatchObject({
      platform: 'cocos',
      cocos: {
        creatorVersion: '3.8',
        buildPlatforms: ['android'],
        resourceRoot: 'assets/resources',
        hybrid: { enabled: true },
      },
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
      },
    })

    const result = await doctorQuaProjectConfig(project, { cwd: root })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'web.devices.none', severity: 'error' }),
      expect.objectContaining({ id: 'cocos.project-dir.missing', severity: 'warning' }),
      expect.objectContaining({ id: 'cocos.hybrid.enabled', severity: 'info' }),
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

async function writeProjectConfig(root: string, lines: string[]): Promise<string> {
  const configPath = join(root, 'qua.project.yaml')
  await writeFile(configPath, lines.join('\n'), 'utf8')
  return configPath
}
