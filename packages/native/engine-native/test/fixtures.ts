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
    id: 'native-wgpu.scene-transition@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.sceneTransition'],
    intentEvents: ['scene/ready'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.effects@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.effects'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.image@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['background', 'characters', 'ui.image'],
    assetKinds: ['images', 'characters'],
    qssFeatures: ['object-fit', 'object-position', 'opacity'],
    quiComponents: ['Image'],
    fallback: 'render-empty',
  },
  {
    id: 'native-wgpu.video@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['background.video'],
    assetKinds: ['video', 'images'],
    qssFeatures: ['object-fit', 'object-position', 'opacity'],
    fallback: 'warn-once',
  },
  {
    id: 'native-wgpu.text@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['dialogue', 'ui.text'],
    assetKinds: ['fonts'],
    qssFeatures: [
      'font-family',
      'font-size',
      'font-style',
      'font-weight',
      'letter-spacing',
      'line-height',
      'text-align',
      'text-decoration',
      'text-overflow',
      'text-transform',
      'white-space',
      'color',
    ],
    quiComponents: ['Text', 'RichText'],
    fallback: 'warn-once',
  },
  {
    id: 'native-wgpu.ui.surface@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.ui.overlays'],
    intentEvents: ['ui/intent', 'choice/select'],
    assetKinds: ['data', 'images', 'fonts', 'qui', 'qss', 'tokens'],
    qssFeatures: [
      'align-items',
      'background-color',
      'background-image',
      'background-position',
      'background-size',
      'border-color',
      'border-radius',
      'border-style',
      'border-width',
      'bottom',
      'box-sizing',
      'column-gap',
      'color',
      'display',
      'font-family',
      'font-size',
      'font-style',
      'font-weight',
      'gap',
      'inset',
      'letter-spacing',
      'height',
      'left',
      'line-height',
      'justify-content',
      'margin',
      'margin-bottom',
      'margin-left',
      'margin-right',
      'margin-top',
      'max-height',
      'max-width',
      'min-height',
      'min-width',
      'text-align',
      'text-decoration',
      'text-overflow',
      'text-transform',
      'object-fit',
      'object-position',
      'opacity',
      'overflow',
      'padding',
      'padding-bottom',
      'padding-left',
      'padding-right',
      'padding-top',
      'pointer-events',
      'position',
      'right',
      'row-gap',
      'top',
      'visibility',
      'white-space',
      'width',
      'z-index',
    ],
    quiComponents: [
      'Box',
      'Backdrop',
      'Button',
      'Column',
      'Divider',
      'Fragment',
      'Grid',
      'Layer',
      'Row',
      'Text',
      'RichText',
      'Image',
      'Panel',
      'SafeArea',
      'Scroll',
      'Spacer',
      'Stack',
    ],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.input.pointer@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: ['view.choices', 'view.ui.overlays'],
    intentEvents: ['choice/select', 'ui/intent'],
    quiComponents: ['Backdrop', 'Box', 'Button', 'Panel'],
    fallback: 'reject-package',
  },
  {
    id: 'native-wgpu.input.text@1',
    target: 'native',
    version: '1.0.0',
    ownerPackage: '@quajs/native-renderer',
    projectionKeys: [],
    intentEvents: ['user/text_input'],
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
      capabilityIds: CAPABILITIES.map(capability => capability.id),
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
