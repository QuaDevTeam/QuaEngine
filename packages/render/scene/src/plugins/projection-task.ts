import type { SceneHostResource } from '@quajs/scene-host'
import type { SceneRendererHostContext, SceneRendererPluginContext } from '../types'

class CancelledProjection extends Error {}

export function subscribeSceneProjection(context: SceneRendererPluginContext, listener: () => void): () => void {
  const identity = () => [
    context.scene.getViewState(),
    context.scene.assets,
    context.scene.getAssetRevision(),
    JSON.stringify(context.scene.getStageLayout()),
  ]
  let previous = identity()
  return context.scene.subscribe(() => {
    const next = identity()
    if (next.every((value, index) => value === previous[index]))
      return
    previous = next
    listener()
  })
}

/** Coalesce refreshes and stop stale async work before it touches native resources. */
export function createSceneProjectionTask<T = void>(
  context: SceneRendererPluginContext,
  phase: string,
  project: (scene: SceneRendererHostContext, value: T) => Promise<void>,
  options: { subscribe?: boolean } = {},
): (value: T) => Promise<void> {
  let revision = 0
  let disposed = false
  let lastView = context.getViewState()
  let lastAssets = context.scene.assets
  let lastAssetRevision = context.scene.getAssetRevision()
  let lastLayout = JSON.stringify(context.scene.getStageLayout())
  let running: Promise<void> | undefined
  let pending: { value: T, revision: number } | undefined
  let lastValue: T
  let initialized = false
  context.addDisposer(() => {
    disposed = true
    revision += 1
    pending = undefined
  })

  if (options.subscribe !== false) {
    context.addDisposer(subscribeSceneProjection(context, () => {
      if (initialized)
        void run(lastValue)
    }))
  }
  return run

  function run(value: T): Promise<void> {
    lastValue = value
    initialized = true
    if (disposed)
      return Promise.resolve()
    const view = context.getViewState()
    const assets = context.scene.assets
    const assetRevision = context.scene.getAssetRevision()
    const layout = JSON.stringify(context.scene.getStageLayout())
    if (view !== lastView || assets !== lastAssets || assetRevision !== lastAssetRevision || layout !== lastLayout) {
      revision += 1
      lastView = view
      lastAssets = assets
      lastAssetRevision = assetRevision
      lastLayout = layout
    }
    pending = { value, revision }
    if (!running)
      startDrain()
    return running!
  }

  function startDrain(): void {
    running = drain().finally(() => {
      running = undefined
      if (pending && !disposed)
        startDrain()
    })
  }

  async function drain(): Promise<void> {
    while (pending) {
      if (disposed)
        break
      const next = pending
      pending = undefined
      const acquired: SceneHostResource[] = []
      const check = () => {
        if (disposed || revision !== next.revision)
          throw new CancelledProjection()
      }
      const base = context.scene
      const view = base.getViewState()
      const scoped: SceneRendererHostContext = {
        ...base,
        getViewState: () => view,
        getLayerNode: (...args) => {
          check()
          return base.getLayerNode(...args)
        },
        getRootNode: () => {
          check()
          return base.getRootNode()
        },
        clearLayer: (...args) => {
          check()
          base.clearLayer(...args)
        },
        releaseLayerResources: (...args) => {
          check()
          base.releaseLayerResources(...args)
        },
        releaseAudioHandles: (...args) => {
          check()
          base.releaseAudioHandles(...args)
        },
        async resolveAsset(...args) {
          check()
          const resource = await base.resolveAsset(...args)
          if (resource)
            acquired.push(resource)
          check()
          return resource
        },
        syncAudioHandle(layerId, key, resource, options) {
          check()
          return base.syncAudioHandle(layerId, key, resource, options, () => !disposed && revision === next.revision)
        },
        releaseAsset(resource) {
          const index = acquired.indexOf(resource)
          if (index >= 0)
            acquired.splice(index, 1)
          base.releaseAsset(resource)
        },
        setLayerResource(...args) {
          // Cleanup remains valid after a refresh; native end callbacks outlive a render pass.
          if (args[2])
            check()
          base.setLayerResource(...args)
          const index = acquired.indexOf(args[2]!)
          if (index >= 0)
            acquired.splice(index, 1)
        },
        host: {
          ...base.host,
          capture: base.host.capture && {
            ...base.host.capture,
            captureBackdrop: base.host.capture.captureBackdrop && (async (...args) => {
              check()
              const backdrop = await base.host.capture!.captureBackdrop!(...args)
              try {
                check()
              }
              catch (error) {
                backdrop.dispose()
                throw error
              }
              return backdrop
            }),
          },
          nodes: new Proxy(base.host.nodes, {
            get(target, key) {
              const method = target[key as keyof typeof target]
              return typeof method === 'function'
                ? (...args: unknown[]) => {
                    check()
                    return Reflect.apply(method, target, args)
                  }
                : method
            },
          }),
          audio: {
            ...base.host.audio,
            async createAudioHandle(...args) {
              check()
              const handle = await base.host.audio.createAudioHandle(...args)
              try {
                check()
              }
              catch (error) {
                try {
                  await handle.stop()
                }
                finally {
                  await handle.dispose()
                }
                throw error
              }
              return handle
            },
          },
        },
      }
      try {
        await project(scoped, next.value)
      }
      catch (error) {
        if (!disposed && revision === next.revision && !(error instanceof CancelledProjection)) {
          await context.reportError(error, {
            message: `Scene ${phase} projection failed.`,
            phase: `renderer-scene:${phase}`,
            pluginName: `@quajs/renderer-scene/${phase}`,
          })
        }
      }
      finally {
        for (const resource of acquired)
          base.releaseAsset(resource)
      }
    }
  }
}
