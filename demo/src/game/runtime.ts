import { MemoryAssetStorage } from '@quajs/assets'
import { createViteDevAssetRuntime, createWebAssetsAdapter } from '@quajs/assets-web'
import { QuaEngine, UiOverlayPlugin } from '@quajs/engine'
import { AnimationPlugin } from '@quajs/plugin-animation'
import { AudioPlugin } from '@quajs/plugin-audio'
import { BacklogPlugin } from '@quajs/plugin-backlog'
import { BackgroundPlugin } from '@quajs/plugin-background'
import { FontsPlugin } from '@quajs/plugin-fonts'
import { GalleryPlugin } from '@quajs/plugin-gallery'
import { SettingsPlugin } from '@quajs/plugin-settings'
import {
  createWebRuntimeModuleLoader,
  createWebRuntimeRendererPluginLoader,
  createWebRuntimeTrustPolicy,
} from '@quajs/security-web'
import { StoryGraphPlugin } from '@quajs/story-graph'
import { createWebStoreStorage } from '@quajs/store-web'
import { DEMO_SUPPORTED_LOCALES, TRUSTED_RUNTIME_KEYS } from './config'
import { registerDemoGallery } from './content/gallery'
import { registerDemoStoryGraph } from './content/story-tree'

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

  const engine = new QuaEngine({
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
  })

  const audio = new AudioPlugin()
  const storyGraph = new StoryGraphPlugin()
  const gallery = new GalleryPlugin({ profileId: 'demo' })

  engine
    .use(new BackgroundPlugin())
    .use(new AnimationPlugin())
    .use(audio)
    .use(new BacklogPlugin())
    .use(storyGraph)
    .use(gallery)
    .use(new SettingsPlugin({
      builtin: {
        developer: {
          defaultLocale: 'zh-cn',
          supportedLocales: DEMO_SUPPORTED_LOCALES,
          systemLocale: typeof navigator !== 'undefined' ? navigator.language : undefined,
        },
        player: {
          textSpeedCps: 36,
          autoAdvanceDelayMs: 2000,
          skipMode: 'all',
        },
      },
    }))
    .use(new FontsPlugin())
    .use(new UiOverlayPlugin())

  await engine.init()
  await registerDemoGallery(gallery)
  await registerDemoStoryGraph(storyGraph)

  return {
    assets,
    audio,
    engine,
    gallery,
    runtimePluginLoader,
    storyGraph,
  }
}
