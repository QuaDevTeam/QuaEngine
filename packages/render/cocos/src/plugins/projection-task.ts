import type { CocosHostResource } from '@quajs/cocos-host'
import type { CocosRendererHostContext, CocosRendererPluginContext } from '../types'

class CancelledProjection extends Error {}

export function subscribeCocosProjection(context: CocosRendererPluginContext, listener: () => void): () => void {
  const identity = () => [
    context.cocos.getViewState(),
    context.cocos.assets,
    context.cocos.getAssetRevision(),
    JSON.stringify(context.cocos.getStageLayout()),
  ]
  let previous = identity()
  return context.cocos.subscribe(() => {
    const next = identity()
    if (next.every((value, index) => value === previous[index]))
      return
    previous = next
    listener()
  })
}

/** Coalesce refreshes and stop stale async work before it touches native resources. */
export function createCocosProjectionTask<T = void>(
  context: CocosRendererPluginContext,
  phase: string,
  project: (cocos: CocosRendererHostContext, value: T) => Promise<void>,
  options: { subscribe?: boolean } = {},
): (value: T) => Promise<void> {
  let revision = 0
  let disposed = false
  let lastView = context.getViewState()
  let lastAssets = context.cocos.assets
  let lastAssetRevision = context.cocos.getAssetRevision()
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
    context.addDisposer(subscribeCocosProjection(context, () => {
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
    const assets = context.cocos.assets
    const assetRevision = context.cocos.getAssetRevision()
    if (view !== lastView || assets !== lastAssets || assetRevision !== lastAssetRevision) {
      revision += 1
      lastView = view
      lastAssets = assets
      lastAssetRevision = assetRevision
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
      const acquired: CocosHostResource[] = []
      const check = () => {
        if (disposed || revision !== next.revision)
          throw new CancelledProjection()
      }
      const base = context.cocos
      const view = base.getViewState()
      const scoped: CocosRendererHostContext = {
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
            message: `Cocos ${phase} projection failed.`,
            phase: `renderer-cocos:${phase}`,
            pluginName: `@quajs/renderer-cocos/${phase}`,
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
