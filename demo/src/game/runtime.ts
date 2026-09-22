import type { BundleIdentity } from '@quajs/assets'
import type { QuaEngine } from '@quajs/engine'
import { MemoryAssetStorage } from '@quajs/assets'
import { createViteDevAssetRuntime, createWebAssets, createWebAssetsAdapter, createWebAssetStorage } from '@quajs/assets-web'
import { AssetLoadingPlugin } from '@quajs/plugin-asset-loading'
import { getWebAssetMemoryEntries } from '@quajs/renderer-web'
import {
  createWebRuntimeModuleLoader,
  createWebRuntimeRendererPluginLoader,
  createWebRuntimeTrustPolicy,
} from '@quajs/security-web'
import { createWebStoreStorage } from '@quajs/store-web'
import { TRUSTED_RUNTIME_KEYS } from './config'
import { createDemoEngineRuntime } from './runtime-shared'
import { createDemoSettingsStorage } from './settings-storage'

export async function createDemoRuntime(options: { onEngineReady?: (engine: QuaEngine) => void } = {}) {
  const loading = new AssetLoadingPlugin()
  const storage = import.meta.env.PROD
    ? createWebAssetStorage({ databaseName: 'call-me-tomorrow-assets' })
    : new MemoryAssetStorage()
  const web = { databaseName: 'call-me-tomorrow-assets', storage }
  const assets = import.meta.env.DEV
    ? await createViteDevAssetRuntime({
        hmr: import.meta.hot,
        manifestUrl: `${import.meta.env.BASE_URL}@qua-assets/manifest.json`,
        assetBaseUrl: `${import.meta.env.BASE_URL}@qua-assets`,
        web,
      })
    : createWebAssets({
        web,
        endpoint: import.meta.env.BASE_URL,
        cacheSize: 256 * 1024 * 1024,
      })
  await assets.initialize()
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

  const runtime = await createDemoEngineRuntime({
    editorResources: () => getWebAssetMemoryEntries(assets),
    plugins: [loading],
    prepareAssets: async (engine) => {
      options.onEngineReady?.(engine)
      await loading.run('明天，请再一次呼唤我', async (report) => {
        if (import.meta.env.PROD) {
          const bundle = await loadProductionBundle()
          await assets.loadBundle(bundle.bundleFile, { expected: bundle.bundleIdentity, onState: report })
        }
      })
    },
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

  const { engine, editorPreview } = runtime
  if (editorPreview) {
    Object.assign(globalThis, { __QUA_EDITOR_PREVIEW__: editorPreview.request })
    const report = (context: { event: { payload: unknown } }) => {
      const { message } = context.event.payload as { message: string }
      // Reach Chromium's Runtime.exceptionThrown without owning narrative state.
      setTimeout(() => {
        throw new Error(message)
      }, 0)
    }
    engine.getPipeline().on('editor/preview/error', report)
    import.meta.hot?.dispose(() => {
      editorPreview.dispose()
      engine.getPipeline().off('editor/preview/error', report)
      Reflect.deleteProperty(globalThis, '__QUA_EDITOR_PREVIEW__')
    })
  }

  return {
    assets,
    loading,
    ...runtime,
    runtimePluginLoader,
  }
}

async function loadProductionBundle(): Promise<{ bundleFile: string, bundleIdentity: BundleIdentity }> {
  const response = await fetch(`${import.meta.env.BASE_URL}asset-manifest.json`, { cache: 'no-cache', signal: AbortSignal.timeout(30000) })
  if (!response.ok)
    throw new Error(`Asset manifest request failed: ${response.status}`)
  const manifest = await response.json() as { bundleFile?: string, bundleIdentity?: BundleIdentity }
  if (!manifest.bundleFile || !/^[\w.-]+\.(?:qpk|zip)$/.test(manifest.bundleFile)) {
    throw new Error('Build manifest does not declare a static asset bundle.')
  }
  const identity = manifest.bundleIdentity
  if (!identity?.name || !identity.buildNumber || !Number.isSafeInteger(identity.version) || !/^[a-f0-9]{64}$/.test(identity.hash)) {
    throw new Error('Build manifest does not declare a versioned asset identity.')
  }
  return { bundleFile: manifest.bundleFile, bundleIdentity: identity }
}
