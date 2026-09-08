import { MemoryAssetStorage } from '@quajs/assets'
import { createViteDevAssetRuntime, createWebAssetRuntime, createWebAssetsAdapter } from '@quajs/assets-web'
import {
  createWebRuntimeModuleLoader,
  createWebRuntimeRendererPluginLoader,
  createWebRuntimeTrustPolicy,
} from '@quajs/security-web'
import { createWebStoreStorage } from '@quajs/store-web'
import { createDemoSettingsStorage } from './settings-storage'
import { TRUSTED_RUNTIME_KEYS } from './config'
import { createDemoEngineRuntime } from './runtime-shared'

export async function createDemoRuntime() {
  const storage = new MemoryAssetStorage()
  const web = { databaseName: 'call-me-tomorrow-assets', storage }
  const assets = import.meta.env.DEV ? await createViteDevAssetRuntime({
    hmr: import.meta.hot,
    manifestUrl: `${import.meta.env.BASE_URL}@qua-assets/manifest.json`,
    assetBaseUrl: `${import.meta.env.BASE_URL}@qua-assets`,
    web,
  }) : await createWebAssetRuntime({
    web,
    endpoint: import.meta.env.BASE_URL,
    initialBundles: await loadProductionBundleName(),
  })
  const trustPolicy = createWebRuntimeTrustPolicy({
    keys: TRUSTED_RUNTIME_KEYS,
    requireSignature: import.meta.env.PROD,
    allowUnsignedInDevelopment: true,
  })
  const runtimeModuleLoader = createWebRuntimeModuleLoader({
    allowBlobFallback: false,
    assets,
    moduleUrlMode: 'same-origin-with-blob-fallback',
  })
  const runtimePluginLoader = createWebRuntimeRendererPluginLoader({
    allowBlobFallback: false,
    assets,
    moduleUrlMode: 'same-origin-with-blob-fallback',
  })

  const { audio, engine, gallery, storyGraph } = await createDemoEngineRuntime({
    engine: {
      layout: 'landscape',
      assets: {
        adapter: createWebAssetsAdapter({
          databaseName: 'call-me-tomorrow-engine-assets',
          storage,
        }),
        provider: assets.getProvider(),
        locale: 'default',
        enableCache: false,
      },
      store: {
        storage: createWebStoreStorage({
          dbName: 'call-me-tomorrow-saves',
        }),
      },
      flowControl: {
        skipMode: 'read',
        timings: {
          autoAdvanceDelayMs: 2000,
        },
      },
      dialogue: {
        typewriter: {
          enabled: true,
          charactersPerSecond: 36,
          revealOnAdvance: true,
        },
      },
      runtimeModuleLoader,
      trustPolicy,
    },
    settingsStorage: createDemoSettingsStorage(window.localStorage),
    systemLocale: typeof navigator !== 'undefined' ? navigator.language : undefined,
  })

  return {
    assets,
    audio,
    engine,
    gallery,
    runtimePluginLoader,
    storyGraph,
  }
}

async function loadProductionBundleName(): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}asset-manifest.json`)
  if (!response.ok) throw new Error(`Asset manifest request failed: ${response.status}`)
  const manifest: { bundleFile?: string } = await response.json()
  if (!manifest.bundleFile || !/^[a-zA-Z0-9._-]+\.(qpk|zip)$/.test(manifest.bundleFile)) {
    throw new Error('Build manifest does not declare a static asset bundle.')
  }
  return manifest.bundleFile
}
