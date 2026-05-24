import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import type { QuaWebRendererOptions, QuaWebRendererSnapshot } from '@quajs/renderer-web'
import type { QuaWebDomRendererHost, QuaWebDomRendererHostOptions } from '@quajs/renderer-web/framework-host'
import type { Action } from 'svelte/action'
import { createQuaWebDomRendererHost } from '@quajs/renderer-web/framework-host'
import { readable } from 'svelte/store'

export interface QuaSvelteRendererOptions {
  pipeline: Pipeline
  assets?: QuaAssets
  initialView?: QuaViewProjection
  plugins?: readonly RendererPlugin[]
  runtimePluginLoader?: QuaWebRendererOptions['runtimePluginLoader']
  autoReady?: boolean
  rendererId?: string
  unstyled?: boolean
  onHost?: (host: QuaWebDomRendererHost | undefined) => void
}

export type QuaRendererAction = Action<Element, QuaSvelteRendererOptions>

export const quaRenderer: QuaRendererAction = (node, options) => {
  const host = createQuaWebDomRendererHost(createHostOptions(node, options))
  let currentOnHost = options.onHost
  currentOnHost?.(host)
  void host.mount().catch(error => reportHostError(host, error, 'svelte-renderer:mount'))

  return {
    update(nextOptions) {
      const previousOnHost = currentOnHost
      currentOnHost = nextOptions.onHost
      if (previousOnHost !== currentOnHost) {
        previousOnHost?.(undefined)
        currentOnHost?.(host)
      }
      void host.update(createHostOptions(node, nextOptions))
        .catch(error => reportHostError(host, error, 'svelte-renderer:update'))
    },
    destroy() {
      currentOnHost?.(undefined)
      void host.destroy().catch(error => reportHostError(host, error, 'svelte-renderer:destroy'))
    },
  }
}

export function createQuaRendererHost(
  node: Element,
  options: QuaSvelteRendererOptions,
): QuaWebDomRendererHost {
  return createQuaWebDomRendererHost(createHostOptions(node, options))
}

export function createQuaRendererStore(host: QuaWebDomRendererHost) {
  return readable<QuaWebRendererSnapshot | undefined>(host.getSnapshot(), set => host.subscribe(set))
}

export function createQuaRendererSnapshotStore(host: QuaWebDomRendererHost) {
  return createQuaRendererStore(host)
}

export {
  defineSvelteRendererPlugin,
  sortRendererLayers,
} from './plugins/core'
export type {
  QuaSvelteDomLayerContext,
  QuaSvelteRendererLayer,
  QuaSvelteRendererPlugin,
} from './plugins/core'
export {
  createInputRendererPlugin,
  inputRendererPlugin,
} from './plugins/input'
export type { InputSvelteRendererPluginOptions } from './plugins/input'
export {
  createVisualNovelRendererPlugins,
} from './plugins/preset'
export type { VisualNovelSvelteRendererPresetOptions } from './plugins/preset'

function createHostOptions(
  container: Element,
  options: QuaSvelteRendererOptions,
): QuaWebDomRendererHostOptions {
  return {
    container,
    pipeline: options.pipeline,
    assets: options.assets,
    initialView: options.initialView,
    plugins: options.plugins,
    runtimePluginLoader: options.runtimePluginLoader,
    autoReady: options.autoReady,
    rendererId: options.rendererId,
    unstyled: options.unstyled,
  }
}

function reportHostError(
  host: QuaWebDomRendererHost | undefined,
  error: unknown,
  phase: string,
): void {
  const controller = host?.getController()
  if (controller) {
    void controller.reportError(error, {
      message: 'Svelte renderer failed.',
      phase,
    })
    return
  }
  console.warn('[quajs:renderer-svelte] Renderer host failed.', error)
}
