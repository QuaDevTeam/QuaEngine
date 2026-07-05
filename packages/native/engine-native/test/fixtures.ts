import type { QuaNativeHostApi, QuaNativeHostInfo, TargetBundleManifest } from '@quajs/native-contracts'
import {
  createNativeCapabilityManifestHash,
  getTargetCorePluginFamily,
  getTargetCoreResolverId,
  NATIVE_TARGET_BOOTSTRAP,
} from '@quajs/native-contracts'
import { vi } from 'vitest'

export const CAPABILITIES: QuaNativeHostInfo['renderer']['capabilities'] = [
  {
    id: 'native-wgpu.ui.surface@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.ui.overlays'],
    intentEvents: ['choice/select', 'ui/intent'],
    assetKinds: ['data', 'images', 'fonts', 'qui', 'qss', 'tokens'],
    qssFeatures: [
      'background-color',
      'background-image',
      'border-radius',
      'font-size',
      'object-fit',
      'object-position',
    ],
    quiComponents: ['Box', 'Button', 'Image', 'Panel', 'Text'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.video@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['background.video'],
    assetKinds: ['video', 'images'],
    fallback: 'warn-once',
  },
  {
    id: 'native-wgpu.input.pointer@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.choices', 'view.ui.overlays'],
    intentEvents: ['choice/select', 'ui/intent'],
    fallback: 'reject-package',
  },
]

export const CAPABILITY_MANIFEST_HASH = createNativeCapabilityManifestHash(
  CAPABILITIES,
  payload => `test-sha256:${payload.length}`,
)

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createHostInfo(version = '0.1.0'): QuaNativeHostInfo {
  return {
    app: {
      name: 'Native Fixture',
      bundleId: 'dev.quajs.native.fixture',
      version: '1.0.0',
      buildNumber: '100',
      profile: 'debug',
      platform: 'macos',
      arch: 'arm64',
    },
    renderer: {
      packageName: '@quajs/native-renderer',
      version,
      backend: 'wgpu',
      capabilityManifestHash: CAPABILITY_MANIFEST_HASH,
      capabilities: CAPABILITIES,
    },
    runtime: {
      quickjsVersion: '2025-04-26',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    },
  }
}

export function createHost(hostInfo = createHostInfo()): QuaNativeHostApi {
  return {
    getHostInfo: vi.fn(async () => hostInfo),
    readAssetBytes: vi.fn(),
    readStorage: vi.fn(),
    writeStorage: vi.fn(),
    deleteStorage: vi.fn(),
    hashBytes: vi.fn(),
  }
}

export function createTestPipeline() {
  const listeners = new Map<string, Set<(context: any) => unknown>>()
  return {
    on: vi.fn((type: string, listener: (context: any) => unknown) => {
      const eventListeners = listeners.get(type) || new Set()
      eventListeners.add(listener)
      listeners.set(type, eventListeners)
    }),
    off: vi.fn((type: string, listener: (context: any) => unknown) => {
      listeners.get(type)?.delete(listener)
    }),
    emit: vi.fn(async (type: string, payload: unknown) => {
      for (const listener of listeners.get(type) || []) {
        await listener({
          event: {
            type,
            payload,
            timestamp: Date.now(),
            id: `${type}:test`,
          },
          handled: false,
          stopPropagation: false,
        })
      }
    }),
  }
}

export function createNativeTargetBundleManifest(
  overrides: Partial<TargetBundleManifest> = {},
): TargetBundleManifest {
  return {
    schemaVersion: 1,
    target: 'native',
    profile: 'debug',
    platform: 'macos',
    app: {
      bundleId: 'dev.quajs.native.fixture',
      version: '1.0.0',
      buildNumber: '100',
      icon: 'AppIcon.icns',
    },
    nativeRenderer: {
      packageName: '@quajs/native-renderer',
      version: '0.1.0',
      backend: 'wgpu',
      capabilityIds: [
        'native-wgpu.ui.surface@1',
        'native-wgpu.video@1',
        'native-wgpu.input.pointer@1',
      ],
      capabilityManifestHash: CAPABILITY_MANIFEST_HASH,
    },
    nativeRuntime: {
      quickjsVersion: '2025-04-26',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    },
    targetCoreResolver: getTargetCoreResolverId('native'),
    selectedCorePluginFamily: getTargetCorePluginFamily('native'),
    selectedCoreAdapters: NATIVE_TARGET_BOOTSTRAP.coreAdapters,
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
        id: 'runtime.chapter.native-ui',
        executableDependencies: ['@quajs/character'],
        rendererEntries: [
          { specifier: '@quajs/native-renderer/ui', target: 'native' },
        ],
      },
    ],
    ...overrides,
  }
}

export function createTrustContext(overrides: Record<string, unknown> = {}) {
  const runtimePackage = {
    id: 'runtime.chapter.native-ui',
    version: '1.0.0',
    scripts: [
      { id: 'opening', assetName: 'scripts/opening.js' },
    ],
    ...overrides,
  }
  return {
    package: runtimePackage,
    bundle: {
      packageId: runtimePackage.id,
      bundleName: runtimePackage.id,
      version: '1.0.0',
      bundleVersion: 1,
      hash: 'hash',
      priority: 0,
      loadedAt: 1,
      assetCount: 1,
      manifest: {
        assets: {},
      },
    },
  } as any
}

export function createModuleLoadContext(assetCodeByName: Record<string, string> = {}) {
  const calls: unknown[] = []
  const ctx = {
    assets: {
      async getAsset(type: string, name: string, options: unknown) {
        calls.push({ type, name, options })
        return {
          data: new TextEncoder().encode(assetCodeByName[name] || `export default "${name}"`),
        }
      },
    },
    bundle: {
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      version: '1.0.0',
      bundleVersion: 1,
      hash: 'hash',
      priority: 0,
      loadedAt: 1,
      assetCount: 1,
      manifest: {
        name: 'runtime.chapter.native-ui',
        version: 1,
        buildNumber: '100',
        created: '2026-06-24T00:00:00.000Z',
        assets: [],
      },
    },
    package: {
      id: 'runtime.chapter.native-ui',
      version: '1.0.0',
    },
    locale: 'ja-JP',
  }
  return { calls, ctx: ctx as any }
}
