import { MemoryAssetStorage } from '@quajs/assets'
import { createViteDevAssetRuntime, createWebAssetsAdapter } from '@quajs/assets-web'
import { QuaEngine, Scene, UiOverlayPlugin } from '@quajs/engine'
import { AudioPlugin } from '@quajs/plugin-audio'
import { BacklogPlugin, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog'
import { BackgroundPlugin } from '@quajs/plugin-background'
import { FontsPlugin } from '@quajs/plugin-fonts'
import { SettingsPlugin } from '@quajs/plugin-settings'
import { QuaRenderer } from '@quajs/renderer-vue'
import { createVisualNovelRendererPlugins } from '@quajs/renderer-vue/plugins/preset'
import { createPwaWebRendererPlugin } from '@quajs/renderer-web/plugins/pwa'
import {
  createWebRuntimeModuleLoader,
  createWebRuntimeRendererPluginLoader,
  createWebRuntimeTrustPolicy,
} from '@quajs/security-web'
import { createWebStoreStorage } from '@quajs/store-web'
import { defineComponent, h, ref } from 'vue'
import { quaProject, quaWebRuntime } from 'virtual:qua-project'
import opening from './scenes/opening.qs'

const GAME_TITLE = quaProject.home.title
const STORAGE_PREFIX = quaProject.bundleId
const TRUSTED_RUNTIME_KEYS = [
  // Production runtime QPKs should be signed with a private key whose public key is registered here.
  // Example:
  // { id: 'release-2026-01', key: { kty: 'EC', crv: 'P-256', x: '...', y: '...', ext: true } },
]

export async function createQuaGameApp() {
  const bootMessage = ref('Loading QuaEngine...')
  const assets = await createViteDevAssetRuntime({
    hmr: import.meta.hot,
    web: {
      databaseName: `${STORAGE_PREFIX}.assets`,
    },
  })
  bootMessage.value = 'Preparing story runtime...'
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
    appVersion: quaProject.version,
    project: {
      name: quaProject.name,
      bundleId: quaProject.bundleId,
      version: quaProject.version,
    },
    layout: quaWebRuntime.layout,
    assets: {
      adapter: createWebAssetsAdapter({
        databaseName: `${STORAGE_PREFIX}.engine-assets`,
        storage: new MemoryAssetStorage(),
      }),
      provider: assets.getProvider(),
      locale: 'default',
      enableCache: false,
    },
    store: {
      storage: createWebStoreStorage({
        dbName: `${STORAGE_PREFIX}.saves`,
      }),
    },
    flowControl: {
      skipMode: 'all',
      timings: {
        autoAdvanceDelayMs: 2000,
      },
    },
    runtimeModuleLoader,
    trustPolicy,
  })

  engine
    .use(new BackgroundPlugin())
    .use(new AudioPlugin())
    .use(new BacklogPlugin())
    .use(new SettingsPlugin({
      builtin: {
        player: {
          textSpeedCps: 36,
          autoAdvanceDelayMs: 2000,
          skipMode: 'all',
        },
      },
    }))
    .use(new FontsPlugin())
    .use(new UiOverlayPlugin())

  engine.registerStoryTargetResolver(async (target, context) => {
    if (target.kind !== 'node') {
      return undefined
    }
    if (target.id === 'settings') {
      await context.engine.showUI('settings')
    }
    if (target.id === 'settings' || target.id === 'continue') {
      return {
        target,
        point: {
          ...(context.currentPoint || {}),
          nodeId: target.id,
          stepId: `${target.id}:selected`,
        },
      }
    }
    return undefined
  })

  await engine.init()
  bootMessage.value = 'Starting opening scene...'
  void engine.loadScene(new OpeningScene(engine)).catch((error) => {
    console.error(error)
    bootMessage.value = 'The opening scene failed to start. Check the browser console.'
  })

  return defineComponent({
    name: 'QuaGameRoot',
    setup() {
      const rendererPlugins = createVisualNovelRendererPlugins()
      if (quaWebRuntime.pwa.enabled && quaWebRuntime.pwa.serviceWorkerUrl) {
        rendererPlugins.unshift(createPwaWebRendererPlugin({
          enabled: true,
          scope: quaProject.home.scope,
          serviceWorkerUrl: quaWebRuntime.pwa.serviceWorkerUrl,
        }))
      }
      return () => h('main', { class: 'game-root' }, [
        h('div', { class: 'game-toolbar', 'data-qua-input-ignore': '' }, [
          h('strong', { class: 'game-title' }, GAME_TITLE),
          h('div', { class: 'game-actions' }, [
            h('button', { type: 'button', onClick: () => engine.startAuto() }, 'Auto'),
            h('button', { type: 'button', onClick: () => engine.stopAuto() }, 'Stop'),
            h('button', { type: 'button', onClick: () => engine.showUI('settings') }, 'Settings'),
            h('button', { type: 'button', onClick: () => engine.getPipeline().emit(BacklogRenderToLogicEvents.OPEN_REQUEST, {}) }, 'Backlog'),
          ]),
        ]),
        h(QuaRenderer, {
          pipeline: engine.getPipeline(),
          assets,
          initialView: engine.getViewState(),
          plugins: rendererPlugins,
          runtimePluginLoader,
          saveSlots: engine.getStore(),
        }),
        h('p', { class: 'boot-message', 'data-qua-input-ignore': '' }, bootMessage.value),
      ])
    },
  })
}

class OpeningScene extends Scene {
  readonly name = 'opening'

  constructor(private readonly engine: QuaEngine) {
    super()
  }

  async init(): Promise<void> {
    await this.engine.showUI('hud', {
      open: true,
      title: GAME_TITLE,
    })
  }

  async run(): Promise<void> {
    await this.engine.dialogue(opening, {
      playerName: 'Player',
    })
  }
}
