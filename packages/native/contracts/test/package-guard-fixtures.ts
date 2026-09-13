import type {
  NativeGuardBundleManifest,
  NativeGuardDynamicBundleRecord,
  NativeGuardRuntimePackageManifest,
} from '../src'

export function createRuntimePackage(
  overrides: Partial<NativeGuardRuntimePackageManifest> = {},
): NativeGuardRuntimePackageManifest {
  return {
    id: 'runtime.chapter.native-ui',
    version: '1.0.0',
    scripts: [
      { id: 'chapter.opening', assetName: 'scripts/opening.js' },
    ],
    plugins: [
      { id: 'chapter.renderer.ui', kind: 'renderer', renderer: '@quajs/native-renderer', assetName: 'ui/menu.qui.json' },
    ],
    metadata: {
      nativeRenderer: {
        packageName: '@quajs/native-renderer',
        versionRange: '^0.1.0',
        nativeCode: false,
      },
    },
    ...overrides,
  }
}

export function createBundle(runtimePackage = createRuntimePackage()): NativeGuardDynamicBundleRecord & {
  packageId: string
  bundleName: string
  version: string
  bundleVersion: number
  hash: string
  priority: number
  loadedAt: number
  assetCount: number
} {
  return {
    packageId: runtimePackage.id,
    bundleName: 'runtime.chapter.native-ui',
    version: '1.0.0',
    bundleVersion: 1,
    hash: 'hash',
    priority: 0,
    loadedAt: 1,
    assetCount: 4,
    manifest: createBundleManifest(),
  }
}

function createBundleManifest(): NativeGuardBundleManifest {
  return {
    assets: {
      scripts: {
        'opening.js': {
          name: 'opening.js',
          path: 'scripts/opening.js',
          relativePath: 'scripts/opening.js',
        },
      },
      data: {
        'menu.qui.json': {
          name: 'menu.qui.json',
          path: 'ui/menu.qui.json',
          relativePath: 'ui/menu.qui.json',
        },
      },
      images: {
        'poster.webp': {
          name: 'poster.webp',
          path: 'images/poster.webp',
          relativePath: 'images/poster.webp',
        },
      },
    },
  }
}
