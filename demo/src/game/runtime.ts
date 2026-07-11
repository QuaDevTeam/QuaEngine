import { MemoryAssetStorage } from '@quajs/assets'
import { createViteDevAssetRuntime, createWebAssetsAdapter } from '@quajs/assets-web'
import {
  createWebRuntimeModuleLoader,
  createWebRuntimeRendererPluginLoader,
  createWebRuntimeTrustPolicy,
} from '@quajs/security-web'
import { createWebStoreStorage } from '@quajs/store-web'
import { TRUSTED_RUNTIME_KEYS } from './config'
import { createDemoEngineRuntime } from './runtime-shared'

export async function createDemoRuntime() {
  const assets = await createViteDevAssetRuntime({
    hmr: import.meta.hot,
    web: {
      databaseName: 'demo-assets',
    },
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
          databaseName: 'demo-engine-assets',
          storage: new MemoryAssetStorage(),
        }),
        provider: assets.getProvider(),
        locale: 'default',
        enableCache: false,
      },
      store: {
        storage: createWebStoreStorage({
          dbName: 'demo-saves',
        }),
      },
      flowControl: {
        skipMode: 'all',
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
