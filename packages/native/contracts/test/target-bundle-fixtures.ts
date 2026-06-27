import type { QuaTargetBootstrap, TargetBundleManifest } from '../src'
import {
  COCOS_TARGET_BOOTSTRAP,
  createTargetBundleNativeRendererInfo,
  createTargetBundleNativeRuntimeInfo,
  createTargetCoreSelection,
  NATIVE_TARGET_BOOTSTRAP,
  WEB_TARGET_BOOTSTRAP,
} from '../src'

export const CORE_ADAPTERS_BY_TARGET = {
  web: WEB_TARGET_BOOTSTRAP.coreAdapters,
  cocos: COCOS_TARGET_BOOTSTRAP.coreAdapters,
  native: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
} satisfies Record<QuaTargetBootstrap, readonly string[]>

const PLATFORM_BY_TARGET = {
  web: 'web',
  cocos: 'cocos',
  native: 'macos',
} satisfies Record<QuaTargetBootstrap, string>

export const NATIVE_RENDERER_CAPABILITIES = [
  {
    id: 'native-wgpu.stage-layout@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['QuaViewProjection.layout'],
    qssFeatures: ['safe-area', 'logical-stage'],
    quiComponents: ['Stage'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.ui.surface@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.ui.overlays'],
    qssFeatures: ['background-color', 'border-radius'],
    quiComponents: ['Box', 'Button', 'Text'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.input.pointer@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.choices', 'view.ui.overlays'],
    intentEvents: ['choice/select', 'ui/intent'],
    quiComponents: ['Button', 'Panel'],
    fallback: 'reject-package',
  },
] as const

export function targetDependencies(target: QuaTargetBootstrap): TargetBundleManifest['dependencies'] {
  const shared = ['@quajs/engine', '@quajs/pipeline']
  switch (target) {
    case 'web':
      return [
        ...shared,
        '@quajs/assets-web',
        '@quajs/renderer-web/plugins/audio',
      ]
    case 'cocos':
      return [
        ...shared,
        '@quajs/cocos-host/runtime',
        '@quajs/assets-cocos',
        '@quajs/renderer-cocos/plugins/audio',
      ]
    case 'native':
      return [
        ...shared,
        '@quajs/native-contracts/bootstrap',
        { specifier: '@quajs/engine-native/native-host', runtime: true, source: 'static-import' },
        { specifier: '@quajs/assets-native', runtime: true, source: 'static-import' },
        { specifier: '@quajs/store-native', runtime: true, source: 'static-import' },
      ]
  }
}

export function rendererEntry(target: QuaTargetBootstrap): NonNullable<TargetBundleManifest['rendererEntries']>[number] {
  switch (target) {
    case 'web':
      return { specifier: '@quajs/renderer-vue/plugins/ui', target: 'web' }
    case 'cocos':
      return { specifier: '@quajs/renderer-cocos/plugins/ui', target: 'cocos' }
    case 'native':
      return { specifier: '@quajs/native-renderer/builtin', target: 'native' }
  }
}

export function nativeRendererInfo(): NonNullable<TargetBundleManifest['nativeRenderer']> {
  return createTargetBundleNativeRendererInfo({
    version: '0.1.0',
    backendVersion: 'wgpu-0.20',
    capabilities: NATIVE_RENDERER_CAPABILITIES,
  }, sha256Fixture)
}

export function nativeRuntimeInfo(): NonNullable<TargetBundleManifest['nativeRuntime']> {
  return createTargetBundleNativeRuntimeInfo({
    quickjsVersion: '2025-04-26',
    nativeRuntimeVersion: '0.1.0',
    assetAdapterVersion: '0.1.0',
    storeAdapterVersion: '0.1.0',
  })
}

export function targetBundleManifest(overrides: Partial<TargetBundleManifest> = {}): TargetBundleManifest {
  return targetBundleManifestFor('native', overrides)
}

export function targetBundleManifestFor(
  target: QuaTargetBootstrap,
  overrides: Partial<TargetBundleManifest> = {},
): TargetBundleManifest {
  const targetCoreSelection = createTargetCoreSelection(target)
  return {
    schemaVersion: 1,
    target,
    profile: 'release',
    platform: PLATFORM_BY_TARGET[target],
    app: {
      bundleId: `dev.quajs.${target}.fixture`,
      version: '1.0.0',
      buildNumber: '100',
      icon: 'AppIcon.icns',
    },
    ...(target === 'native'
      ? {
          nativeRenderer: nativeRendererInfo(),
          nativeRuntime: nativeRuntimeInfo(),
        }
      : {}),
    targetCoreResolver: targetCoreSelection.targetCoreResolver,
    selectedCorePluginFamily: targetCoreSelection.selectedCorePluginFamily,
    selectedCoreAdapters: targetCoreSelection.selectedCoreAdapters,
    dependencies: targetDependencies(target),
    rendererEntries: [rendererEntry(target)],
    runtimePackages: [
      {
        id: 'runtime.chapter.1',
        executableDependencies: ['@quajs/character'],
        rendererEntries: [{ specifier: `@quajs/${target}-renderer/ui`, target }],
      },
    ],
    ...overrides,
  }
}

export function sha256Fixture(payload: string): string {
  return `fixture-${payload.length}`
}
