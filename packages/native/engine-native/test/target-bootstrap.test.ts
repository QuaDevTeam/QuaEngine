import {
  COCOS_TARGET_BOOTSTRAP,
  getTargetCorePluginFamily,
  NATIVE_TARGET_BOOTSTRAP,
} from '@quajs/native-contracts'
import { describe, expect, it } from 'vitest'
import {
  assertNativeTargetBootstrap,
  assertNativeTargetBundleManifest,
  checkNativeAppManifestCompatibility,
  checkNativeRendererManifestCompatibility,
  checkNativeTargetBootstrap,
  checkNativeTargetBundleManifest,
  createNativeEngineBootstrap,
  NativeHostPlugin,
} from '../src'
import {
  CAPABILITY_MANIFEST_HASH,
  createHost,
  createHostInfo,
  createNativeTargetBundleManifest,
  escapeRegExp,
} from './fixtures'

describe('@quajs/engine-native target bootstrap', () => {
  it('accepts native startup package roots through the native target bootstrap guard', () => {
    const result = checkNativeTargetBootstrap(NATIVE_TARGET_BOOTSTRAP.coreAdapters)

    expect(result.ok).toBe(true)
    expect(result.selectedTargets).toEqual(['native'])
    expect(assertNativeTargetBootstrap(NATIVE_TARGET_BOOTSTRAP.coreAdapters)).toEqual(result)
  })

  it('rejects mixed target bootstrap packages before reading host info', async () => {
    const host = createHost()
    const plugin = new NativeHostPlugin({
      host,
      targetBootstrapPackages: [
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
        '@quajs/renderer-web/plugins/ui',
        ...COCOS_TARGET_BOOTSTRAP.coreAdapters,
      ],
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native target bootstrap validation failed.*mixes target bootstrap core adapters/,
    )
    expect(plugin.getTargetBootstrapValidation()?.selectedTargets).toEqual(['web', 'cocos', 'native'])
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('accepts native post-bundle manifests during startup bootstrap validation', async () => {
    const manifest = createNativeTargetBundleManifest()
    const result = checkNativeTargetBundleManifest(manifest)
    const host = createHost()
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: manifest,
    })

    expect(result.ok).toBe(true)
    expect(assertNativeTargetBundleManifest(manifest)).toEqual(result)

    await plugin.init({} as any)

    expect(plugin.getTargetBundleManifestValidation()).toEqual(result)
    expect(plugin.getTargetBootstrapValidation()).toEqual(result.bootstrapValidation)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('checks emitted native renderer metadata against the native host info', () => {
    expect(checkNativeRendererManifestCompatibility(
      createHostInfo(),
      createNativeTargetBundleManifest().nativeRenderer!,
    )).toEqual([])
  })

  it('checks emitted native app metadata against the native host info', () => {
    expect(checkNativeAppManifestCompatibility(
      createHostInfo(),
      createNativeTargetBundleManifest(),
    )).toEqual([])
  })

  it('rejects emitted native app metadata that drifts from host info', async () => {
    const hostInfo = createHostInfo()
    hostInfo.app = {
      ...hostInfo.app,
      bundleId: 'dev.quajs.native.other',
      version: '2.0.0',
      buildNumber: '200',
      profile: 'release',
      platform: 'windows',
    }
    const host = createHost(hostInfo)
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest(),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native manifest compatibility validation failed.*app\.bundleId "dev\.quajs\.native\.fixture" does not match host app bundleId "dev\.quajs\.native\.other".*app\.version "1\.0\.0" does not match host app version "2\.0\.0".*app\.buildNumber "100" does not match host app buildNumber "200".*profile "debug" does not match host app profile "release".*platform "macos" does not match host app platform "windows"/,
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(true)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
    expect(plugin.getHostInfo()).toBeUndefined()
  })

  it('rejects emitted native renderer metadata that drifts from host info', async () => {
    const host = createHost(createHostInfo('0.2.0'))
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest({
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          version: '0.1.0',
          backend: 'wgpu',
          capabilityIds: [
            'native-wgpu.ui.surface@1',
            'native-wgpu.audio@1',
          ],
          capabilityManifestHash: 'sha256:stale-native-capabilities',
        },
      }),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      new RegExp(`Native manifest compatibility validation failed.*renderer version "0\\.1\\.0" does not match host renderer version "0\\.2\\.0".*capability hash "sha256:stale-native-capabilities" does not match host renderer capability hash "${escapeRegExp(CAPABILITY_MANIFEST_HASH)}".*capability "native-wgpu\\.audio@1" is not provided`),
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(true)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
    expect(plugin.getHostInfo()).toBeUndefined()
  })

  it('rejects emitted native renderer backendVersion that drifts from host info', async () => {
    const hostInfo = createHostInfo()
    hostInfo.renderer = {
      ...hostInfo.renderer,
      backendVersion: 'wgpu-host',
    }
    const host = createHost(hostInfo)
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest({
        nativeRenderer: {
          ...createNativeTargetBundleManifest().nativeRenderer!,
          backendVersion: 'wgpu-manifest',
        },
      }),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native manifest compatibility validation failed.*renderer backendVersion "wgpu-manifest" does not match host renderer backendVersion "wgpu-host"/,
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(true)
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
    expect(plugin.getHostInfo()).toBeUndefined()
  })

  it('rejects native post-bundle manifests with foreign target core plugin families before host info', async () => {
    const host = createHost()
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest({
        dependencies: [
          '@quajs/engine',
          ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
          '@quajs/renderer-web/plugins/ui',
        ],
        rendererEntries: [
          { specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' },
        ],
      }),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native target bundle manifest validation failed.*core plugin family "web-core".*Renderer entry "@quajs\/renderer-vue" declares target "web"/,
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(false)
    expect(plugin.getTargetBootstrapValidation()?.selectedTargets).toEqual(['web', 'native'])
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('rejects generated native project graphs that redeclare target core adapters before host info', async () => {
    const host = createHost()
    const plugin = new NativeHostPlugin({
      host,
      targetBundleManifest: createNativeTargetBundleManifest({
        projectGraphs: [
          {
            id: 'native.template.generated',
            kind: 'project-template',
            references: [
              '@quajs/engine',
              '@quajs/engine-native/native-host',
            ],
          },
          {
            id: 'native.debug.macos.post-bundle',
            kind: 'post-bundle',
            references: [
              '@quajs/engine',
              ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
            ],
          },
        ],
      }),
    })

    await expect(plugin.init({} as any)).rejects.toThrow(
      /Native target bundle manifest validation failed.*Project graph "native\.template\.generated" \(project-template\).*must not declare target core adapter "@quajs\/engine-native"/,
    )
    expect(plugin.getTargetBundleManifestValidation()?.ok).toBe(false)
    expect(plugin.getTargetBundleManifestValidation()?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PROJECT_GRAPH_CORE_ADAPTER',
        target: 'native',
        packageName: '@quajs/engine-native',
        projectGraphId: 'native.template.generated',
        projectGraphKind: 'project-template',
      }),
    ]))
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('rejects post-bundle manifests declared for another target before host info', async () => {
    const host = createHost()
    const bootstrap = createNativeEngineBootstrap(host, {
      targetBundleManifest: createNativeTargetBundleManifest({
        target: 'web',
        platform: 'web',
        nativeRenderer: undefined,
        selectedCorePluginFamily: getTargetCorePluginFamily('web'),
        selectedCoreAdapters: ['@quajs/assets-web', '@quajs/renderer-web'],
        dependencies: [
          '@quajs/engine',
          '@quajs/assets-web',
          '@quajs/renderer-web/plugins/ui',
        ],
        rendererEntries: [
          { specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' },
        ],
      }),
    })

    await expect(bootstrap.plugin.init({} as any)).rejects.toThrow(
      /Native target bundle manifest validation failed.*declares target "web", but expected "native"/,
    )
    expect(bootstrap.plugin.getTargetBundleManifestValidation()?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_TARGET_MISMATCH',
        target: 'web',
        expectedTarget: 'native',
      }),
    ]))
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })

  it('creates native runtime adapters with a host plugin wired to the emitted bundle manifest', async () => {
    const manifest = createNativeTargetBundleManifest()
    const host = createHost()
    const bootstrap = createNativeEngineBootstrap(host, {
      targetBundleManifest: manifest,
    })

    expect(bootstrap.adapters.host).toBe(host)
    expect(bootstrap.adapters.trustPolicy).toEqual(expect.objectContaining({
      verifyPackage: expect.any(Function),
    }))

    await bootstrap.plugin.init({} as any)

    expect(bootstrap.plugin.getTargetBundleManifestValidation()?.ok).toBe(true)
    expect(bootstrap.plugin.getTargetBootstrapValidation()?.selectedTargets).toEqual(['native'])
    expect(host.getHostInfo).toHaveBeenCalledTimes(1)
  })

  it('rejects mixed target bootstrap manifests through the native bootstrap helper before host info', async () => {
    const host = createHost()
    const bootstrap = createNativeEngineBootstrap(host, {
      targetBundleManifest: createNativeTargetBundleManifest({
        dependencies: [
          '@quajs/engine',
          ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
          '@quajs/renderer-web/plugins/ui',
        ],
      }),
    })

    await expect(bootstrap.plugin.init({} as any)).rejects.toThrow(
      /Native target bundle manifest validation failed.*core plugin family "web-core"/,
    )
    expect(host.getHostInfo).not.toHaveBeenCalled()
  })
})
