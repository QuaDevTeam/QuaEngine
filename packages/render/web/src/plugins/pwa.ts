import type { RendererPlugin } from '@quajs/render-core'

export interface PwaWebRendererPluginOptions {
  enabled?: boolean
  serviceWorkerUrl?: string
  scope?: string
}

export interface PwaNavigatorLike {
  serviceWorker?: {
    register: (scriptURL: string, options?: RegistrationOptions) => Promise<unknown>
  }
}

export function createPwaWebRendererPlugin(options: PwaWebRendererPluginOptions = {}): RendererPlugin {
  return {
    name: '@quajs/renderer-web/plugins/pwa',
    async setup(context) {
      if (options.enabled === false || !options.serviceWorkerUrl) {
        return
      }
      const navigatorValue = typeof navigator !== 'undefined' ? navigator as PwaNavigatorLike : undefined
      if (!navigatorValue?.serviceWorker?.register) {
        return
      }
      try {
        await navigatorValue.serviceWorker.register(options.serviceWorkerUrl, {
          ...(options.scope ? { scope: options.scope } : {}),
        })
      }
      catch (error) {
        await context.reportError(error, {
          message: 'PWA service worker registration failed.',
          phase: 'renderer-web:pwa',
          pluginName: '@quajs/renderer-web/plugins/pwa',
          severity: 'warning',
        })
      }
    },
  }
}

export const pwaWebRendererPlugin = createPwaWebRendererPlugin()
