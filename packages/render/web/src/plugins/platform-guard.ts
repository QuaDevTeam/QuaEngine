import type { RendererPlugin } from '@quajs/render-core'
import type { QuaWebRendererPluginContext } from '../controller'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { defineWebRendererPlugin } from './core'

export type WebPlatformDeviceClass = 'desktop' | 'pad' | 'phone'

export interface WebPlatformGuardRuntimeConfig {
  enabled?: boolean
  devices?: Partial<Record<WebPlatformDeviceClass, boolean>>
  blockUi?: {
    title?: string
    message?: string
  }
}

export interface WebDeviceEnvironment {
  maxTouchPoints?: number
  screenHeight?: number
  screenWidth?: number
  userAgent?: string
  userAgentData?: {
    mobile?: boolean
  }
  viewportHeight?: number
  viewportWidth?: number
  coarsePointer?: boolean
}

export interface WebPlatformSupportResult {
  allowed: boolean
  allowedDevices: Record<WebPlatformDeviceClass, boolean>
  detectedDevice: WebPlatformDeviceClass
  reason?: 'device-disabled' | 'web-disabled'
  title: string
  message: string
}

export interface PlatformGuardWebRendererPluginOptions {
  runtime: WebPlatformGuardRuntimeConfig
  environment?: WebDeviceEnvironment
}

export function classifyWebDevice(environment: WebDeviceEnvironment = readWebDeviceEnvironment()): WebPlatformDeviceClass {
  const userAgent = environment.userAgent || ''
  const mobileHint = environment.userAgentData?.mobile === true
  const maxTouchPoints = environment.maxTouchPoints || 0
  const coarsePointer = environment.coarsePointer === true
  const width = environment.viewportWidth || environment.screenWidth || 0
  const height = environment.viewportHeight || environment.screenHeight || 0
  const shortSide = width && height ? Math.min(width, height) : 0
  const longSide = width && height ? Math.max(width, height) : 0
  const tabletUa = /\b(iPad|Tablet|PlayBook|Silk)\b/i.test(userAgent)
    || /\bAndroid\b/i.test(userAgent) && !/\bMobile\b/i.test(userAgent)
    || /\bMacintosh\b/i.test(userAgent) && maxTouchPoints > 1
  const phoneUa = mobileHint || /\b(iPhone|iPod|Android.*Mobile|Windows Phone)\b/i.test(userAgent)

  if (tabletUa) {
    return 'pad'
  }
  if (phoneUa) {
    return 'phone'
  }
  if ((coarsePointer || maxTouchPoints > 0) && shortSide > 0) {
    return shortSide >= 700 || longSide >= 1000 ? 'pad' : 'phone'
  }
  return 'desktop'
}

export function evaluateWebPlatformSupport(
  runtime: WebPlatformGuardRuntimeConfig,
  environment: WebDeviceEnvironment = readWebDeviceEnvironment(),
): WebPlatformSupportResult {
  const detectedDevice = classifyWebDevice(environment)
  const allowedDevices = {
    desktop: runtime.devices?.desktop ?? true,
    pad: runtime.devices?.pad ?? true,
    phone: runtime.devices?.phone ?? true,
  }
  const webEnabled = runtime.enabled !== false
  const deviceAllowed = allowedDevices[detectedDevice]
  const title = runtime.blockUi?.title || 'Unsupported device'
  const message = runtime.blockUi?.message || 'This game is not available on this device.'

  return {
    allowed: webEnabled && deviceAllowed,
    allowedDevices,
    detectedDevice,
    reason: webEnabled ? deviceAllowed ? undefined : 'device-disabled' : 'web-disabled',
    title,
    message,
  }
}

export function mountUnsupportedPlatformUi(
  container: Element,
  result: WebPlatformSupportResult,
): HTMLElement {
  const document = container.ownerDocument
  const root = renderUnsupportedPlatformNode(document, result)
  container.replaceChildren(root)
  return root
}

export function createPlatformGuardWebRendererPlugin(options: PlatformGuardWebRendererPluginOptions): QuaWebDomRendererPlugin | RendererPlugin {
  let result = evaluateWebPlatformSupport(options.runtime, options.environment)
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/plugins/platform-guard',
    layers: [{
      id: 'platform-guard',
      order: 10000,
      plane: 'screen',
      render(context: QuaWebDomLayerContext) {
        result = evaluateWebPlatformSupport(options.runtime, options.environment)
        return result.allowed ? undefined : renderUnsupportedPlatformNode(context.document, result)
      },
    }],
    setup(context) {
      const webContext = context as QuaWebRendererPluginContext
      if (typeof webContext.registerAdvanceInterceptor === 'function') {
        context.addDisposer(webContext.registerAdvanceInterceptor(() => !result.allowed))
      }
    },
  })
}

function renderUnsupportedPlatformNode(document: Document, result: WebPlatformSupportResult): HTMLElement {
  const root = document.createElement('section')
  root.className = 'qua-platform-guard'
  root.setAttribute('role', 'alert')
  root.setAttribute('data-qua-input-ignore', '')
  Object.assign(root.style, {
    alignItems: 'center',
    background: '#111',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    inset: '0',
    justifyContent: 'center',
    minHeight: '100%',
    padding: '32px',
    pointerEvents: 'auto',
    position: 'absolute',
    textAlign: 'center',
    zIndex: '10000',
  })

  const title = document.createElement('h1')
  title.textContent = result.title
  Object.assign(title.style, {
    fontSize: 'clamp(24px, 6vw, 44px)',
    fontWeight: '700',
    lineHeight: '1.15',
    margin: '0 0 12px',
  })

  const message = document.createElement('p')
  message.textContent = result.message
  Object.assign(message.style, {
    color: '#d8d8d8',
    fontSize: 'clamp(16px, 3vw, 20px)',
    lineHeight: '1.5',
    margin: '0',
    maxWidth: '560px',
  })

  root.append(title, message)
  return root
}

function readWebDeviceEnvironment(): WebDeviceEnvironment {
  const navigatorValue = typeof navigator !== 'undefined' ? navigator : undefined
  const screenValue = typeof screen !== 'undefined' ? screen : undefined
  const windowValue = typeof window !== 'undefined' ? window : undefined
  return {
    maxTouchPoints: navigatorValue?.maxTouchPoints,
    screenHeight: screenValue?.height,
    screenWidth: screenValue?.width,
    userAgent: navigatorValue?.userAgent,
    userAgentData: (navigatorValue as Navigator & { userAgentData?: { mobile?: boolean } } | undefined)?.userAgentData,
    viewportHeight: windowValue?.innerHeight,
    viewportWidth: windowValue?.innerWidth,
    coarsePointer: windowValue?.matchMedia?.('(pointer: coarse)').matches,
  }
}
