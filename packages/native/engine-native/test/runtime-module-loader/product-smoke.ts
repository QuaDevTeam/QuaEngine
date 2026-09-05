import { MemoryAssetStorage } from '@quajs/assets'
import {
  clearCharacterRegistry,
  narrateWithEngine,
  registerCharacter,
  showWithEngine,
  speakWithEngine,
} from '@quajs/character'
import { playCharacterFadeWithEngine } from '@quajs/character/animation'
import type { ViewChoiceProjection } from '@quajs/engine'
import type { QuaNativeHostInfo } from '@quajs/native-contracts'
import { emitRenderToLogic, QuaEngine, RenderToLogicEvents } from '@quajs/engine'
import { NATIVE_TARGET_BOOTSTRAP } from '@quajs/native-contracts'
import {
  AnimationPlugin,
  playAnimationWithEngine,
  registerAnimationWithEngine,
} from '@quajs/plugin-animation'
import { playBGMWithEngine } from '@quajs/plugin-audio'
import { setBackgroundWithEngine } from '@quajs/plugin-background'
import {
  backgroundDecoratorMappings,
  createBackgroundDecoratorCompiler,
} from '@quajs/plugin-background/script-compiler'
import {
  createQuaProjectNativeArtifactPlans,
  emitQuaProjectNativeTargetBundleManifest,
  normalizeQuaProjectConfig,
} from '@quajs/quack/project'
import { compileQuaScriptModuleToTsAsync } from '@quajs/script-compiler'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createNativeRendererJsonFrameInput,
  createNativeRuntimeAdapters,
} from './helpers'
import { NativeHostPlugin } from '../../src'
import {
  createRealNativeProductBridge,
  createRealNativeQuickJsBridge,
  runNativeRendererSmokeFrame,
} from './real-quickjs-bridge'

describe('@quajs/engine-native runtime product smoke', () => {
  afterEach(() => {
    clearCharacterRegistry()
    QuaEngine.resetInstance()
  })

  it('starts real native bridges from the target manifest emitted by Quack packaging', async () => {
    const probe = await createRealNativeQuickJsBridge()
    const emitted = await emitNativeTargetBundleManifestFromHostInfo(probe.startupHostInfo)
    const targetBundleManifest = emitted.manifest
    await probe.close()

    try {
      const bridge = await createRealNativeQuickJsBridge({ targetBundleManifestPath: emitted.manifestPath })
      try {
        expect(bridge.startupHostInfo.runtime).toEqual(targetBundleManifest.nativeRuntime)
        expect(bridge.startupHostInfo.renderer.capabilityManifestHash).toBe(
          targetBundleManifest.nativeRenderer?.capabilityManifestHash,
        )
        expect(bridge.requests[0]).toEqual(expect.objectContaining({
          method: 'getHostInfo',
        }))
      }
      finally {
        await bridge.close()
      }

      const productBridge = await createRealNativeProductBridge({
        targetBundleManifestPath: emitted.manifestPath,
      })
      try {
        expect(productBridge.startupHostInfo.runtime).toEqual(targetBundleManifest.nativeRuntime)
        expect(productBridge.startupHostInfo.renderer.capabilityManifestHash).toBe(
          targetBundleManifest.nativeRenderer?.capabilityManifestHash,
        )
      }
      finally {
        await productBridge.close()
      }

      await expect(createRealNativeQuickJsBridge({
        targetBundleManifest: {
          ...targetBundleManifest,
          nativeRuntime: {
            ...targetBundleManifest.nativeRuntime!,
            quickjsVersion: 'stale-quickjs',
          },
        },
      })).rejects.toThrow(/nativeRuntime\.quickjsVersion "stale-quickjs" does not match host runtime value/)

      await expect(createRealNativeQuickJsBridge({
        targetBundleManifest: {
          ...targetBundleManifest,
          nativeRenderer: {
            ...targetBundleManifest.nativeRenderer!,
            capabilityIds: targetBundleManifest.nativeRenderer!.capabilityIds.filter(
              capabilityId => capabilityId !== 'native-wgpu.input.text@1',
            ),
          },
        },
      })).rejects.toThrow(/nativeRenderer\.capabilityIds omits host renderer capability "native-wgpu\.input\.text@1"/)
    }
    finally {
      await rm(emitted.root, { recursive: true, force: true })
    }
  }, 180_000)

  it('drives the real native product bridge from a TS-owned projection frame', async () => {
    const bridge = await createRealNativeProductBridge()
    try {
      const frame = createNativeRendererJsonFrameInput({
        dialogue: {
          text: 'Product bridge frame from TS',
          mode: 'narration',
          contentPackageId: 'runtime.product.bridge',
        },
        ui: {
          visible: true,
          overlays: [],
        },
      }, {
        container: { width: 1600, height: 1000 },
        layout: { preset: 'landscape' },
      })

      const rendered = await bridge.bridge.renderProjectionFrame(frame)
      const lifecycle = await bridge.bridge.tickLifecycle()
      const drained = await bridge.bridge.drainRendererIntents()
      const shutdown = await bridge.bridge.shutdown()

      expect(bridge.startupHostInfo.runtime.nativeRuntimeVersion).toBeTruthy()
      expect(rendered).toEqual(expect.objectContaining({
        frameNumber: 1,
        renderedFrameCount: 1,
        commandCount: expect.any(Number),
        missingResourceCount: 0,
        textureLifecycleInitialSync: true,
        rendererIntents: [],
      }))
      expect(rendered.commandCount).toBeGreaterThan(0)
      expect(lifecycle).toEqual(expect.objectContaining({
        renderedFrameCount: 1,
        initialSync: false,
        rendererIntents: [],
      }))
      expect(drained).toEqual([])
      expect(shutdown).toEqual(expect.objectContaining({
        renderedFrameCount: 1,
        rendererIntents: [],
      }))
      expect(bridge.requests).toEqual(expect.arrayContaining([
        { method: 'getHostInfo' },
        expect.objectContaining({ method: 'renderProjectionFrame' }),
        { method: 'tickLifecycle' },
        { method: 'drainRendererIntents' },
        { method: 'shutdown' },
      ]))
    }
    finally {
      await bridge.close()
    }
  }, 180_000)

  it('runs real character and animation helpers into a deterministic Rust render graph', async () => {
    registerCharacter({
      id: 'mira',
      displayName: 'Mira',
      aliases: ['Mira'],
      sprites: {
        focus: 'mira/focus.png',
      },
      metadata: {
        role: 'protagonist',
      },
    })
    const bridge = await createRealNativeQuickJsBridge()
    const host = {
      ...bridge.host,
      verifySignature: vi.fn(async () => true),
    }
    const storyCode = `
      import { showWithEngine } from '@quajs/character';
      import { playCharacterFadeWithEngine } from '@quajs/character/animation';
      import {
        playAnimationWithEngine,
        registerAnimationWithEngine
      } from '@quajs/plugin-animation';

      export default function nativeCharacterAnimation() {
        return [{
          uuid: 'runtime.native.character-animation.step.1',
          async run(ctx) {
            await showWithEngine(ctx.engine, 'mira', {
              sprite: 'focus',
              position: { x: 800, y: 640, scale: 1 }
            });
            await registerAnimationWithEngine(ctx.engine, {
              id: 'mira-cross-stage',
              duration: 1000,
              fill: 'both',
              commit: 'none',
              tracks: [{
                target: 'character:mira',
                property: 'position.x',
                keyframes: [
                  { at: 0, value: 800 },
                  { at: 1000, value: 1200, easing: 'linear' }
                ]
              }]
            });
            await playAnimationWithEngine(ctx.engine, 'mira-cross-stage', {
              id: 'mira-cross-stage-playback'
            });
            await playCharacterFadeWithEngine(ctx.engine, 'mira', 0, 1, 1000, {
              id: 'mira-fade-playback',
              fill: 'both',
              commit: 'none',
              easing: 'linear'
            });
          }
        }];
      }
    `
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.native.character-animation',
      version: '1.0.0',
      scripts: [{
        id: 'runtime.native.character-animation',
        version: '1.0.0',
        assetName: 'character-animation.js',
      }],
      metadata: {
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          versionRange: '>=0.1.0',
          capabilityIds: ['native-wgpu.image@1'],
          assetKinds: ['characters'],
          nativeCode: false,
        },
      },
      integrity: { hash: 'native-character-animation-hash', algorithm: 'sha256' },
      signature: { value: 'signed-character-animation', algorithm: 'ed25519' },
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/character-animation.js', utf8(storyCode)],
    ]))

    try {
      const adapters = createNativeRuntimeAdapters(host, {
        requireSignature: true,
        quickJsHelperModules: {
          '@quajs/character': { showWithEngine },
          '@quajs/character/animation': { playCharacterFadeWithEngine },
          '@quajs/plugin-animation': {
            playAnimationWithEngine,
            registerAnimationWithEngine,
          },
        },
      })
      const animation = new AnimationPlugin()
      const nativeHostPlugin = new NativeHostPlugin({
        host,
        quickJsPipelineSubscriptionBridge: adapters.quickJsPipelineSubscriptionBridge,
      })
      const engine = new QuaEngine({
        assets: {
          endpoint: 'https://cdn.example.com',
          adapter: createMemoryAdapter({
            'https://cdn.example.com/native-character-animation.qpk': qpk,
          }, 'native-character-animation-hash'),
        },
        runtimeModuleLoader: adapters.runtimeModuleLoader,
        trustPolicy: adapters.trustPolicy,
      })
      engine.use(animation)
      engine.use(nativeHostPlugin)

      await engine.init()
      await engine.loadRuntimePackage('native-character-animation.qpk')
      await engine.runScriptModule('runtime.native.character-animation')

      expect(engine.getViewState().characters).toEqual([
        expect.objectContaining({
          id: 'mira',
          name: 'Mira',
          sprite: 'mira/focus.png',
          metadata: expect.objectContaining({
            role: 'protagonist',
            contentPackageId: 'runtime.native.character-animation',
          }),
        }),
      ])
      expect(engine.getViewState().animations.map(item => item.id).sort()).toEqual([
        'mira-cross-stage-playback',
        'mira-fade-playback',
      ])

      const deterministicStartedAt = 10_000
      for (const activeAnimation of engine.getViewState().animations) {
        await engine.setAnimationProjection({
          ...activeAnimation,
          startedAt: deterministicStartedAt,
        })
      }
      const frame = createNativeRendererJsonFrameInput(engine.getViewState(), {
        container: { width: 1600, height: 1000, devicePixelRatio: 1 },
        now: deterministicStartedAt + 500,
      })
      expect(frame.view.characters).toEqual([
        expect.objectContaining({
          id: 'mira',
          name: 'Mira',
          sprite: 'mira/focus.png',
          opacity: 0.5,
          position: expect.objectContaining({ x: 1_000, y: 640, scale: 1 }),
          provenance: {
            contentPackageId: 'runtime.native.character-animation',
          },
        }),
      ])

      const rendererSummary = await runNativeRendererSmokeFrame(frame)
      expect(rendererSummary).toEqual(expect.objectContaining({
        revision: 1,
        missingResourceCount: 0,
        commandGraphSignature: 'fnv1a64:b7865ef4c9229a17',
      }))
      expect(rendererSummary.commandIds).toEqual(['character:mira'])
      expect(rendererSummary.commandKindCounts).toEqual({ image: 1 })

      await engine.unloadRuntimePackage('runtime.native.character-animation', { force: true })
      expect(engine.getViewState().characters).toEqual([])
      expect(engine.getViewState().animations).toEqual([])
    }
    finally {
      await bridge.close()
    }
  }, 180_000)

  it('loads a runtime QPK through real native QuickJS and renders the engine projection in Rust', async () => {
    const bridge = await createRealNativeQuickJsBridge()
    const verifySignature = vi.fn(async () => true)
    const host = {
      ...bridge.host,
      verifySignature,
    }
    const storyCode = `
      import { resolveQuaText } from '@quajs/engine';
      import { playBGMWithEngine } from '@quajs/plugin-audio';
      import { choiceText, sharedLabel } from './shared.js';

      export default async function nativeStory(scope = {}) {
        const runtimeLabel = await Promise.resolve(sharedLabel);
        return [{
          uuid: 'runtime.native.story.step.1',
          metadata: {
            point: { nodeId: 'native-start' }
          },
          async run(ctx) {
            const playerName = await resolveQuaText(ctx, [scope.playerName || 'Player']);
            await ctx.pipeline.emit('plugin/native_product_smoke', {
              playerName,
              via: runtimeLabel
            });
            const listener = context => {
              if (context.event.payload.value === 42) {
                ctx.pipeline.off('plugin/native_listener_probe', listener);
              }
            };
            ctx.pipeline.on('plugin/native_listener_probe', listener);
            await ctx.engine.showDialogue({
              text: 'Native listener armed',
              mode: 'narration'
            });
            await ctx.engine.waitFor('plugin/native_listener_probe');
            await playBGMWithEngine(ctx.engine, 'audio/bgm/native-theme.ogg', {
              id: 'native-product-bgm',
              contentPackageId: 'runtime.native.story',
              durationMs: 2400,
              fadeInMs: 120,
              seekMs: 300,
              metadata: {
                requiredRuntimePackages: ['runtime.native.story']
              }
            });
            await ctx.engine.showDialogue({
              text: 'Native line for ' + playerName + ' via ' + runtimeLabel,
              mode: 'narration'
            });
            await ctx.engine.showChoices([
              { id: 'stay', text: choiceText },
              { id: 'leave', text: 'Leave', enabled: false }
            ]);
          }
        }];
      }
    `
    const sharedCode = `
      export const sharedLabel = 'real-rquickjs';
      export const choiceText = 'Stay with native QuickJS';
    `
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.native.story',
      version: '1.0.0',
      priority: 7,
      scripts: [{
        id: 'runtime.native.story',
        version: '1.0.0',
        assetName: 'story.js',
        metadata: {
          nativeQuickJs: {
            imports: ['shared.js'],
          },
        },
      }],
      metadata: {
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          versionRange: '>=0.1.0',
          capabilityIds: ['native-wgpu.input.pointer@1'],
          optionalCapabilityIds: ['native-wgpu.audio@1'],
          intentEvents: ['choice/select'],
          nativeCode: false,
        },
      },
      integrity: { hash: 'native-story-hash', algorithm: 'sha256' },
      signature: { value: 'signed', algorithm: 'ed25519' },
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/story.js', utf8(storyCode)],
      ['assets/scripts/shared.js', utf8(sharedCode)],
    ]))
    try {
      const adapters = createNativeRuntimeAdapters(host, {
        requireSignature: true,
        quickJsHelperModules: {
          '@quajs/plugin-audio': { playBGMWithEngine },
        },
      })
      const nativeHostPlugin = new NativeHostPlugin({
        host,
        quickJsPipelineSubscriptionBridge: adapters.quickJsPipelineSubscriptionBridge,
      })
      const engine = new QuaEngine({
        assets: {
          endpoint: 'https://cdn.example.com',
          adapter: createMemoryAdapter({
            'https://cdn.example.com/native-story.qpk': qpk,
          }, 'native-story-hash'),
        },
        runtimeModuleLoader: adapters.runtimeModuleLoader,
        trustPolicy: adapters.trustPolicy,
      })
      const customPipelineEvents: unknown[] = []
      engine.use(nativeHostPlugin)

      await engine.init()
      engine.getPipeline().on('plugin/native_product_smoke', context => {
        customPipelineEvents.push(context.event.payload)
      })
      const state = await engine.loadRuntimePackage('native-story.qpk')
      const running = engine.runScriptModule('runtime.native.story', { playerName: 'Mira' })
      const runningState = trackRunningScript(running)
      await waitForDialogueProjection(engine, 'Native listener armed', runningState)
      await engine.getPipeline().emit('plugin/native_listener_probe', { value: 42 })
      await running

      expect(state).toEqual(expect.objectContaining({
        id: 'runtime.native.story',
        state: 'active',
        priority: 7,
      }))
      expect(verifySignature).toHaveBeenCalledWith(expect.objectContaining({
        algorithm: 'ed25519',
        keyId: undefined,
      }))

      const evaluationRequest = bridge.requests.find(request => request.method === 'evaluateQuickJsModule')
      expect(evaluationRequest).toEqual(expect.objectContaining({
        method: 'evaluateQuickJsModule',
        params: expect.objectContaining({
          module: expect.objectContaining({
            assetName: 'story.js',
            bundleName: 'runtime.native.story',
            code: storyCode,
            packageId: 'runtime.native.story',
          }),
          moduleGraph: [{
            assetName: 'shared.js',
            bundleName: 'runtime.native.story',
            packageId: 'runtime.native.story',
            kind: 'script',
            code: sharedCode,
            bytes: Array.from(utf8(sharedCode)),
          }],
        }),
      }))
      const factoryRequest = bridge.requests.find(request => request.method === 'callQuickJsGameStepFactory')
      const factoryParams = factoryRequest?.method === 'callQuickJsGameStepFactory'
        ? factoryRequest.params
        : undefined
      expect(factoryRequest).toEqual(expect.objectContaining({
        method: 'callQuickJsGameStepFactory',
        params: expect.objectContaining({
          exportName: 'default',
          scopeJson: '{"playerName":"Mira"}',
        }),
      }))
      expect(factoryParams?.moduleNamespaceId).toMatch(/^quickjs:rquickjs:/)
      expect(bridge.requests.some(request => request.method === 'callQuickJsGameStepRun')).toBe(true)
      expect(bridge.requests.some(request =>
        request.method === 'resumeQuickJsGameStepRun'
        && request.params.payloadJson === undefined,
      )).toBe(true)
      expect(customPipelineEvents).toEqual([{
        playerName: 'Mira',
        via: 'real-rquickjs',
      }])
      const listenerDispatches = bridge.requests.filter(request => request.method === 'dispatchQuickJsPipelineListener')
      expect(listenerDispatches).toHaveLength(1)
      const listenerParams = listenerDispatches[0]?.method === 'dispatchQuickJsPipelineListener'
        ? listenerDispatches[0].params
        : undefined
      expect(listenerParams).toEqual(expect.objectContaining({
        subscriptionId: expect.stringMatching(/^quickjs:rquickjs:/),
      }))
      expect(JSON.parse(listenerParams?.contextJson ?? '{}')).toEqual(expect.objectContaining({
        event: expect.objectContaining({
          payload: { value: 42 },
          type: 'plugin/native_listener_probe',
        }),
      }))
      await engine.getPipeline().emit('plugin/native_listener_probe', { value: 99 })
      await nextMacrotask()
      expect(bridge.requests.filter(request => request.method === 'dispatchQuickJsPipelineListener')).toHaveLength(1)

      expect(engine.getViewState().dialogue).toEqual(expect.objectContaining({
        visible: true,
        text: 'Native line for Mira via real-rquickjs',
        mode: 'narration',
      }))
      expect(engine.getViewState().choices).toEqual([
        expect.objectContaining({ id: 'stay', text: 'Stay with native QuickJS', enabled: true }),
        expect.objectContaining({ id: 'leave', text: 'Leave', enabled: false }),
      ])
      expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
        stepId: 'runtime.native.story.step.1',
        contentPackageId: 'runtime.native.story',
        scriptModuleId: 'runtime.native.story',
        scriptModuleVersion: '1.0.0',
      }))

      const namespaceSummary = await host.getQuickJsPackageNamespaceSummary!('runtime.native.story')
      expect(namespaceSummary).toEqual(expect.objectContaining({
        namespaceCount: 1,
        packageCount: 1,
      }))
      expect(namespaceSummary?.totalBytes).toBeGreaterThan(0)

      const frame = createNativeRendererJsonFrameInput(engine.getViewState(), {
        container: { width: 1600, height: 1000, devicePixelRatio: 1 },
      })

      expect(frame.layout).toEqual(engine.getViewState().layout)
      expect(frame.view.dialogue).toEqual(expect.objectContaining({
        visible: true,
        text: 'Native line for Mira via real-rquickjs',
        mode: 'narration',
        provenance: {
          contentPackageId: 'runtime.native.story',
        },
      }))
      expect(frame.view.choices).toEqual({
        visible: true,
        choices: [{
          id: 'stay',
          text: 'Stay with native QuickJS',
          enabled: true,
          provenance: {
            contentPackageId: 'runtime.native.story',
          },
        }, {
          id: 'leave',
          text: 'Leave',
          enabled: false,
          provenance: {
            contentPackageId: 'runtime.native.story',
          },
        }],
        provenance: {
          contentPackageId: 'runtime.native.story',
        },
      })
      expect(frame.view.ui).toEqual({
        visible: true,
        overlays: [],
      })
      expect(engine.getViewState().plugins?.audio).toEqual(expect.objectContaining({
        bgm: expect.objectContaining({
          id: 'native-product-bgm',
          assetKey: 'audio/bgm/native-theme.ogg',
          contentPackageId: 'runtime.native.story',
          state: 'playing',
        }),
        requiredRuntimePackages: ['runtime.native.story'],
      }))
      expect(frame.view.audio).toEqual({
        tracks: [
          expect.objectContaining({
            id: 'native-product-bgm',
            kind: 'bgm',
            assetName: 'audio/bgm/native-theme.ogg',
            assetType: 'audio',
            loadMode: 'buffered',
            playbackState: 'playing',
            looped: true,
            durationMs: 2400,
            fadeInMs: 120,
            seekMs: 300,
            provenance: {
              contentPackageId: 'runtime.native.story',
              requiredRuntimePackages: ['runtime.native.story'],
            },
          }),
        ],
      })
      expect(JSON.parse(JSON.stringify(frame))).toEqual(expect.objectContaining({
        view: expect.any(Object),
      }))

      const rendererSummary = await runNativeRendererSmokeFrame(frame)
      expect(rendererSummary.revision).toBe(1)
      expect(rendererSummary.commandCount).toBeGreaterThan(0)
      expect(rendererSummary.missingResourceCount).toBe(0)
      expect(rendererSummary.backend).toEqual(expect.objectContaining({
        validationErrorCount: 0,
      }))

      await engine.unloadRuntimePackage('runtime.native.story', { force: true })
      expect(nativeHostPlugin.getReleasedQuickJsPackageNamespaces()).toEqual([expect.objectContaining({
        packageId: 'runtime.native.story',
        assetName: 'story.js',
      })])
      await expect(host.getQuickJsPackageNamespaceSummary!('runtime.native.story')).resolves.toEqual(expect.objectContaining({
        namespaceCount: 0,
      }))
    }
    finally {
      await bridge.close()
    }
  }, 180_000)

  it('runs compiled QuaScript from a runtime QPK through real native QuickJS and Rust rendering', async () => {
    const bridge = await createRealNativeQuickJsBridge()
    const verifySignature = vi.fn(async () => true)
    const host = {
      ...bridge.host,
      verifySignature,
    }
    const qsSource = `
<script lang="ts">
import { formatRuntimeLabel } from './qs-shared.js'
</script>

<script setup lang="ts">
const displayName = scope.playerName || 'Player'
const runtimeLabel = formatRuntimeLabel(scope.runtimeLabel || 'native QuickJS')
</script>

@SetBackground('bg/native-route.png', {
  fit: 'cover',
  metadata: {
    contentPackageId: 'runtime.native.qs.story',
    requiredRuntimePackages: ['runtime.native.qs.story']
  }
})
The native route greets \${displayName}.
Mira: Compiled QuaScript is running inside \${runtimeLabel} with \${$t('runtime.native.qs.translation', { fallback: 'translated text' })}.
- Stay with compiled QS if scope.allowStay
- Leave if false
`
    const storyCode = await compileQuaScriptToRuntimeJs(qsSource, {
      moduleId: 'runtime.native.qs.story',
      stableSeed: 'native-qs-product-smoke',
      version: '1.0.0',
    })
    const qsSharedCode = `
      export function formatRuntimeLabel(value) {
        return value + ' via qs-shared';
      }
    `
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.native.qs.story',
      version: '1.0.0',
      priority: 8,
      scripts: [{
        id: 'runtime.native.qs.story',
        version: '1.0.0',
        assetName: 'compiled-story.js',
        metadata: {
          nativeQuickJs: {
            imports: ['qs-shared.js'],
          },
        },
      }],
      metadata: {
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          versionRange: '>=0.1.0',
          capabilityIds: ['native-wgpu.input.pointer@1'],
          intentEvents: ['choice/select'],
          nativeCode: false,
        },
      },
      integrity: { hash: 'native-qs-story-hash', algorithm: 'sha256' },
      signature: { value: 'signed-qs', algorithm: 'ed25519' },
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/compiled-story.js', utf8(storyCode)],
      ['assets/scripts/qs-shared.js', utf8(qsSharedCode)],
    ]))
    try {
      const adapters = createNativeRuntimeAdapters(host, {
        requireSignature: true,
        quickJsHelperModules: {
          '@quajs/character': { narrateWithEngine, speakWithEngine },
          '@quajs/plugin-background': { setBackgroundWithEngine },
        },
      })
      const nativeHostPlugin = new NativeHostPlugin({
        host,
        quickJsPipelineSubscriptionBridge: adapters.quickJsPipelineSubscriptionBridge,
      })
      const engine = new QuaEngine({
        assets: {
          endpoint: 'https://cdn.example.com',
          adapter: createMemoryAdapter({
            'https://cdn.example.com/native-qs-story.qpk': qpk,
          }, 'native-qs-story-hash'),
        },
        runtimeModuleLoader: adapters.runtimeModuleLoader,
        trustPolicy: adapters.trustPolicy,
      })
      engine.use(nativeHostPlugin)

      await engine.init()
      engine.registerStoryTargetResolver((target) => {
        if (target.kind !== 'node' || target.id !== 'stay-with-compiled-qs') {
          return undefined
        }
        return {
          target,
          requiredRuntimePackages: ['runtime.native.qs.story'],
          point: {
            nodeId: target.id,
            stepId: 'runtime.native.qs.story.after-choice',
            contentPackageId: 'runtime.native.qs.story',
            requiredRuntimePackages: ['runtime.native.qs.story'],
            scriptModuleId: 'runtime.native.qs.story',
            scriptModuleVersion: '1.0.0',
          },
        }
      })
      const state = await engine.loadRuntimePackage('native-qs-story.qpk')
      const running = engine.runScriptModule('runtime.native.qs.story', {
        allowStay: true,
        playerName: 'Mira',
        runtimeLabel: 'real rquickjs',
      })
      const runningState = trackRunningScript(running)
      await advancePastDialogue(engine, 'The native route greets Mira.', runningState)
      await advancePastDialogue(engine, 'Compiled QuaScript is running inside real rquickjs via qs-shared with translated text.', runningState)
      const choices = await waitForChoiceProjection(engine, 'stay-with-compiled-qs', runningState)

      expect(state).toEqual(expect.objectContaining({
        id: 'runtime.native.qs.story',
        state: 'active',
        priority: 8,
      }))
      expect(verifySignature).toHaveBeenCalledWith(expect.objectContaining({
        algorithm: 'ed25519',
        keyId: undefined,
      }))
      expect(choices).toEqual([
        expect.objectContaining({
          id: 'stay-with-compiled-qs',
          text: 'Stay with compiled QS',
          enabled: true,
          metadata: expect.objectContaining({
            contentPackageId: 'runtime.native.qs.story',
          }),
        }),
        expect.objectContaining({
          id: 'leave',
          text: 'Leave',
          enabled: false,
          metadata: expect.objectContaining({
            contentPackageId: 'runtime.native.qs.story',
          }),
        }),
      ])
      expect(engine.getViewState().dialogue).toEqual(expect.objectContaining({
        visible: true,
        characterName: 'Mira',
        text: 'Compiled QuaScript is running inside real rquickjs via qs-shared with translated text.',
      }))

      const evaluationRequest = bridge.requests.find(request => request.method === 'evaluateQuickJsModule')
      expect(evaluationRequest).toEqual(expect.objectContaining({
        method: 'evaluateQuickJsModule',
        params: expect.objectContaining({
          module: expect.objectContaining({
            assetName: 'compiled-story.js',
            bundleName: 'runtime.native.qs.story',
            code: storyCode,
            packageId: 'runtime.native.qs.story',
          }),
          moduleGraph: [{
            assetName: 'qs-shared.js',
            bundleName: 'runtime.native.qs.story',
            packageId: 'runtime.native.qs.story',
            kind: 'script',
            code: qsSharedCode,
            bytes: Array.from(utf8(qsSharedCode)),
          }],
        }),
      }))
      expect(bridge.requests.some(request => request.method === 'callQuickJsGameStepRun')).toBe(true)
      expect(bridge.requests.some(request => request.method === 'resumeQuickJsGameStepRun')).toBe(true)
      expect(bridge.requests.some(request =>
        request.method === 'resumeQuickJsGameStepRun'
        && request.params.payloadJson === '"translated text"',
      )).toBe(true)
      expect(engine.getViewState().background).toEqual(expect.objectContaining({
        mode: 'image',
        assetName: 'bg/native-route.png',
        fit: 'cover',
        metadata: expect.objectContaining({
          contentPackageId: 'runtime.native.qs.story',
          requiredRuntimePackages: ['runtime.native.qs.story'],
        }),
      }))

      const frame = createNativeRendererJsonFrameInput(engine.getViewState(), {
        container: { width: 1600, height: 1000, devicePixelRatio: 1 },
      })
      expect(frame.view.background).toEqual(expect.objectContaining({
        mode: 'image',
        assetName: 'bg/native-route.png',
        fit: 'cover',
        provenance: {
          contentPackageId: 'runtime.native.qs.story',
          requiredRuntimePackages: ['runtime.native.qs.story'],
        },
      }))
      expect(frame.view.dialogue).toEqual(expect.objectContaining({
        text: 'Compiled QuaScript is running inside real rquickjs via qs-shared with translated text.',
        provenance: {
          contentPackageId: 'runtime.native.qs.story',
        },
      }))
      expect(frame.view.choices).toEqual({
        visible: true,
        choices: [
          expect.objectContaining({
            id: 'stay-with-compiled-qs',
            provenance: {
              contentPackageId: 'runtime.native.qs.story',
            },
          }),
          expect.objectContaining({
            id: 'leave',
            enabled: false,
            provenance: {
              contentPackageId: 'runtime.native.qs.story',
            },
          }),
        ],
        provenance: {
          contentPackageId: 'runtime.native.qs.story',
        },
      })

      const rendererSummary = await runNativeRendererSmokeFrame(frame)
      expect(rendererSummary.revision).toBe(1)
      expect(rendererSummary.commandCount).toBeGreaterThan(0)
      expect(rendererSummary.missingResourceCount).toBe(0)

      await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, {
        choiceId: 'stay-with-compiled-qs',
      })
      await running
      expect(engine.getViewState().choices).toEqual([])
      expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
        nodeId: 'stay-with-compiled-qs',
        stepId: 'runtime.native.qs.story.after-choice',
        contentPackageId: 'runtime.native.qs.story',
        scriptModuleId: 'runtime.native.qs.story',
        scriptModuleVersion: '1.0.0',
      }))

      await engine.unloadRuntimePackage('runtime.native.qs.story', { force: true })
      expect(nativeHostPlugin.getReleasedQuickJsPackageNamespaces()).toEqual([expect.objectContaining({
        packageId: 'runtime.native.qs.story',
        assetName: 'compiled-story.js',
      })])
      await expect(host.getQuickJsPackageNamespaceSummary!('runtime.native.qs.story')).resolves.toEqual(expect.objectContaining({
        namespaceCount: 0,
      }))
    }
    finally {
      await bridge.close()
    }
  }, 180_000)
})

async function compileQuaScriptToRuntimeJs(
  source: string,
  runtimeModule: { moduleId: string, stableSeed: string, version: string },
): Promise<string> {
  const compiledTs = await compileQuaScriptModuleToTsAsync(source, {
    autoCollectDecorators: false,
    decoratorCompilers: [createBackgroundDecoratorCompiler()],
    decoratorMappings: backgroundDecoratorMappings,
    hotReload: false,
    runtimeModule,
  })
  return ts.transpileModule(compiledTs, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText
}

async function waitForChoiceProjection(
  engine: QuaEngine,
  choiceId: string,
  running: RunningScriptState = { completed: false },
): Promise<ViewChoiceProjection[]> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    assertRunning(running, `Native compiled QuaScript completed before projecting choice "${choiceId}".`)
    const choices = engine.getViewState().choices || []
    if (choices.some(choice => choice.id === choiceId)) {
      await nextMacrotask()
      return choices
    }
    await delay(10)
  }
  throw new Error(`Timed out waiting for native compiled QuaScript choice "${choiceId}".`)
}

async function advancePastDialogue(
  engine: QuaEngine,
  text: string,
  running: RunningScriptState,
): Promise<void> {
  await waitForDialogueProjection(engine, text, running)
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_ADVANCE, {
      source: 'native-product-smoke',
    })
    await delay(20)
    assertRunning(running, `Native compiled QuaScript completed while advancing past dialogue "${text}".`)
    const view = engine.getViewState()
    if (view.dialogue.text !== text || view.choices.length > 0) {
      return
    }
  }
  throw new Error(`Timed out advancing past native compiled QuaScript dialogue "${text}".`)
}

async function waitForDialogueProjection(
  engine: QuaEngine,
  text: string,
  running: RunningScriptState,
): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    assertRunning(running, `Native compiled QuaScript completed before projecting dialogue "${text}".`)
    if (engine.getViewState().dialogue.text === text) {
      await nextMacrotask()
      return
    }
    await delay(10)
  }
  throw new Error(`Timed out waiting for native compiled QuaScript dialogue "${text}".`)
}

interface RunningScriptState {
  completed: boolean
  failed?: unknown
}

function trackRunningScript(running: Promise<unknown>): RunningScriptState {
  const state: RunningScriptState = { completed: false }
  void running.then(
    () => {
      state.completed = true
    },
    (error) => {
      state.completed = true
      state.failed = error
    },
  )
  return state
}

function assertRunning(running: RunningScriptState, message: string): void {
  if (running.failed) {
    throw running.failed
  }
  if (running.completed) {
    throw new Error(message)
  }
}

function nextMacrotask(): Promise<void> {
  return delay(0)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createMemoryAdapter(files: Record<string, Uint8Array> = {}, hash = '') {
  const fileMap = new Map(Object.entries(files))
  return {
    name: 'engine-native-product-smoke-memory',
    storage: new MemoryAssetStorage(),
    fetcher: {
      async fetchBytes(url: string) {
        const data = fileMap.get(url) || fileMap.get(url.replace(/^\/+/, ''))
        if (!data) {
          throw new Error(`No native product smoke asset file registered: ${url}`)
        }
        return { data: new Uint8Array(data), size: data.byteLength }
      },
    },
    crypto: {
      async sha256() {
        return hash
      },
    },
  }
}

function createRuntimeBundleManifest(runtimePackage: Record<string, any>) {
  const integrity = {
    ...(runtimePackage.integrity || {}),
    algorithm: runtimePackage.integrity?.algorithm || 'sha256',
    hash: runtimePackage.integrity?.hash || `merkle:${runtimePackage.id}:${runtimePackage.version}`,
  }
  const runtimePackageWithIntegrity = {
    ...runtimePackage,
    integrity,
  }

  return {
    name: runtimePackageWithIntegrity.id,
    version: runtimePackageWithIntegrity.version,
    bundler: '@quajs/quack',
    created: new Date(0).toISOString(),
    createdAt: 0,
    format: 'qpk',
    bundleVersion: 1,
    buildNumber: 'engine-native-product-smoke',
    compression: { algorithm: 'none' },
    encryption: { enabled: false, algorithm: 'none' },
    locales: ['default'],
    defaultLocale: 'default',
    assets: {
      scripts: Object.fromEntries(
        collectScriptAssetNames(runtimePackage).map(assetName => [assetName, createScriptAssetInfo(assetName)]),
      ),
    },
    totalFiles: 0,
    totalSize: 0,
    merkleRoot: integrity.hash,
    compatibility: runtimePackageWithIntegrity.compatibility,
    runtimePackage: runtimePackageWithIntegrity,
  }
}

function collectScriptAssetNames(runtimePackage: Record<string, any>): string[] {
  const assetNames = new Set<string>()
  for (const script of runtimePackage.scripts || []) {
    if (typeof script.assetName === 'string') {
      assetNames.add(script.assetName)
    }
    const imports = script.metadata?.nativeQuickJs?.imports
    if (Array.isArray(imports)) {
      for (const entry of imports) {
        const assetName = typeof entry === 'string'
          ? entry
          : entry?.assetName || entry?.module || entry?.path || entry?.relativePath
        if (typeof assetName === 'string') {
          assetNames.add(assetName)
        }
      }
    }
  }
  return [...assetNames]
}

function createScriptAssetInfo(name: string) {
  return {
    name,
    path: `scripts/${name}`,
    relativePath: `scripts/${name}`,
    size: 0,
    hash: '',
    type: 'scripts' as const,
    locales: ['default'],
    mimeType: 'text/javascript',
  }
}

function createQpkBundle(manifest: Record<string, unknown>, files: Map<string, Uint8Array>): Uint8Array {
  const entries = Array.from(files.entries()).map(([path, data]) => {
    const pathBytes = utf8(path)
    const entry = new Uint8Array(4 + pathBytes.byteLength + 4 + data.byteLength)
    const view = new DataView(entry.buffer)
    view.setUint32(0, pathBytes.byteLength, true)
    entry.set(pathBytes, 4)
    view.setUint32(4 + pathBytes.byteLength, data.byteLength, true)
    entry.set(data, 4 + pathBytes.byteLength + 4)
    return entry
  })
  const dataSection = concatBytes(entries)
  const manifestBytes = utf8(JSON.stringify(manifest))
  const headerSize = 32
  const bytes = new Uint8Array(headerSize + dataSection.byteLength + manifestBytes.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x51504B00, false)
  view.setUint32(4, 1, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, headerSize, true)
  setUint64LE(view, 16, headerSize + dataSection.byteLength)
  setUint64LE(view, 24, manifestBytes.byteLength)
  bytes.set(dataSection, headerSize)
  bytes.set(manifestBytes, headerSize + dataSection.byteLength)
  return bytes
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function setUint64LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true)
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true)
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

async function emitNativeTargetBundleManifestFromHostInfo(hostInfo: QuaNativeHostInfo) {
  const root = await mkdtemp(join(tmpdir(), 'quajs-native-product-manifest-'))
  const project = normalizeQuaProjectConfig({
    schemaVersion: 1,
    name: 'Native Product Smoke',
    bundleId: hostInfo.app.bundleId,
    version: hostInfo.app.version,
    icons: { source: 'AppIcon.icns' },
    targets: {
      native: {
        enabled: true,
        platforms: [hostInfo.app.platform],
        profiles: [hostInfo.app.profile],
        layout: 'landscape',
        outputDir: root,
        app: {
          bundleId: hostInfo.app.bundleId,
          version: hostInfo.app.version,
          buildNumber: hostInfo.app.buildNumber,
          icon: 'AppIcon.icns',
        },
        build: { cargoFeatures: ['quickjs-rquickjs'] },
      },
    },
  })
  const [plan] = createQuaProjectNativeArtifactPlans(project)
  if (!plan) {
    throw new Error('Native product smoke project did not produce a native artifact plan.')
  }

  const emitted = await emitQuaProjectNativeTargetBundleManifest(plan, {
    nativeRenderer: {
      packageName: hostInfo.renderer.packageName,
      version: hostInfo.renderer.version,
      backend: hostInfo.renderer.backend,
      ...(hostInfo.renderer.backendVersion ? { backendVersion: hostInfo.renderer.backendVersion } : {}),
      capabilityIds: hostInfo.renderer.capabilities.map(capability => capability.id),
      capabilityManifestHash: hostInfo.renderer.capabilityManifestHash,
    },
    nativeRuntime: { ...hostInfo.runtime },
    dependencies: [
      '@quajs/engine',
      '@quajs/pipeline',
      ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
    ],
    rendererEntries: [{
      specifier: '@quajs/native-renderer/builtin',
      target: 'native',
    }],
  })

  return { root, ...emitted }
}
