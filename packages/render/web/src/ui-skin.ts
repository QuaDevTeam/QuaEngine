import type {
  QuaViewProjection,
  ViewChoiceProjection,
  ViewUiOverlayProjection,
  ViewUiPluginProjection,
  ViewUiSkinDefaultsProjection,
} from '@quajs/render-core'
import type {
  ResolvedSpriteSkinProjection,
  SpriteSkinManifest,
  SpriteSkinStateName,
} from '@quajs/plugin-sprite/contracts'
import { resolveSpriteSkinReference } from '@quajs/plugin-sprite/contracts'
import type { QuaWebDomLayerContext } from './dom'
import { applySpriteSkinStyle, resolveSpriteSkin } from './plugins/sprite'

export type UiSkinControlKind = 'button' | 'panel' | 'input' | 'tab' | 'toggle'

export function getUiSkinProjection(view: Readonly<QuaViewProjection>): Readonly<ViewUiPluginProjection> | undefined {
  return view.plugins.ui as Readonly<ViewUiPluginProjection> | undefined
}

export function getUiSkinDefaults(view: Readonly<QuaViewProjection>): Readonly<ViewUiSkinDefaultsProjection> | undefined {
  return getUiSkinProjection(view)?.defaults
}

export function resolveUiThemeId(themeId: string | undefined): string | undefined {
  if (!themeId) {
    return undefined
  }

  const normalized = themeId.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '')
  if (!normalized) {
    return undefined
  }

  return normalized.startsWith('ui/') ? normalized : `ui/${normalized}`
}

export function resolveUiSkinReference(
  view: Readonly<QuaViewProjection>,
  kind: UiSkinControlKind,
  explicitSkinId?: string,
): string | undefined {
  const ui = getUiSkinProjection(view)
  const themeId = resolveUiThemeId(ui?.themeId)
  const skinId = normalizeSkinReference(explicitSkinId || ui?.defaults?.[kind])
  if (!skinId) {
    return undefined
  }

  if (skinId.includes('/')) {
    return skinId
  }

  return themeId ? `${themeId}/${skinId}` : skinId
}

export function resolveUiChoiceSkinReference(
  view: Readonly<QuaViewProjection>,
  choice: Readonly<ViewChoiceProjection>,
): string | undefined {
  return resolveUiSkinReference(view, 'button', choice.presentation?.skinId)
}

export function resolveUiOverlaySkinReference(
  view: Readonly<QuaViewProjection>,
  overlay: Readonly<ViewUiOverlayProjection> | undefined,
  kind: UiSkinControlKind = 'panel',
): string | undefined {
  return resolveUiSkinReference(view, kind, overlay?.skinId)
}

export function resolveUiControlSkinReference(
  view: Readonly<QuaViewProjection>,
  kind: UiSkinControlKind,
  explicitSkinId?: string,
): string | undefined {
  return resolveUiSkinReference(view, kind, explicitSkinId)
}

export interface UiControlSkinBindingOptions {
  kind: UiSkinControlKind
  skinId?: string
  interactive?: boolean
  disabled?: boolean
  selected?: boolean
}

export interface UiControlSkinBinding {
  state: SpriteSkinStateName
  reference?: string
  projection?: ResolvedSpriteSkinProjection
  assetUrl?: string
  setState: (state: SpriteSkinStateName) => void
  dispose: () => void
}

const uiControlSkinBindings = new WeakMap<HTMLElement, UiControlSkinBindingState>()

export function bindUiControlSkin(
  context: QuaWebDomLayerContext,
  element: HTMLElement,
  options: UiControlSkinBindingOptions,
): UiControlSkinBinding {
  const binding = uiControlSkinBindings.get(element) || createUiControlSkinBindingState()
  binding.kind = options.kind
  binding.skinId = options.skinId
  binding.interactive = options.interactive !== false
  binding.disabled = Boolean(options.disabled)
  binding.selected = Boolean(options.selected)
  binding.state = resolveUiSkinBindingState(binding, binding.state)
  uiControlSkinBindings.set(element, binding)

  if (binding.interactive) {
    bindUiControlSkinListeners(binding, element)
  }
  else {
    unbindUiControlSkinListeners(binding)
  }

  const dispose = () => {
    binding.dispose()
    if (uiControlSkinBindings.get(element) === binding) {
      uiControlSkinBindings.delete(element)
    }
  }

  binding.clear = () => clearUiControlSkinStyle(binding, element)
  binding.loadManifest = (ctx, manifestPath, el) => {
      const request = ++binding.manifestRequest
      const assets = ctx.controller.getAssets()
      if (!assets) {
        binding.clear()
        return
      }

      void assets.getJSON<SpriteSkinManifest>('data', manifestPath)
      .then((manifest) => {
        if (binding.manifestRequest !== request) {
          return
        }
        binding.manifest = manifest
        binding.manifestPath = manifestPath
        binding.applyProjection(ctx, el)
      })
      .catch(() => {
        if (binding.manifestRequest !== request) {
          return
        }
        binding.manifest = undefined
        binding.manifestPath = manifestPath
        binding.clear()
      })
  }

  binding.applyProjection = (ctx, el) => {
    const reference = resolveUiControlSkinReference(ctx.view, binding.kind, binding.skinId)
    binding.reference = reference
    if (!reference) {
      binding.clear()
      return
    }

    const projection = resolveSpriteSkin(binding.manifest, reference, resolveUiSkinProjectionState(binding))
    binding.projection = projection
    if (!projection) {
      binding.clear()
      return
    }

    const assetPath = projection.active.asset
    const targetPackageId = hasContentPackageId(projection.manifest?.metadata)
    if (binding.assetPath !== assetPath || binding.assetTargetPackageId !== targetPackageId) {
      binding.assetDisposer?.()
      binding.assetPath = assetPath
      binding.assetTargetPackageId = targetPackageId
      binding.assetUrl = undefined
      binding.assetDisposer = ctx.watchAssetUrl('images', assetPath, (state) => {
        if (binding.assetPath !== assetPath) {
          return
        }
        binding.assetUrl = state.url
        updateUiControlSkinStyle(binding, el, binding.projection)
      }, targetPackageId)
    }

    updateUiControlSkinStyle(binding, el, projection)
  }

  binding.dispose = () => {
    clearUiControlSkinStyle(binding, element)
    unbindUiControlSkinListeners(binding)
    binding.manifest = undefined
    binding.manifestPath = undefined
    binding.manifestRequest += 1
    binding.reference = undefined
    binding.projection = undefined
  }

  binding.sync = () => {
    const reference = resolveUiControlSkinReference(context.view, binding.kind, binding.skinId)
    binding.reference = reference
    if (!reference) {
      binding.clear()
      return
    }

    const details = resolveSpriteSkinReference(reference)
    if (!details) {
      binding.clear()
      return
    }

    if (binding.manifestPath !== details.manifestPath || !binding.manifest) {
      if (binding.manifestPath && binding.manifestPath !== details.manifestPath) {
        binding.clear()
      }
      binding.manifestPath = details.manifestPath
      binding.loadManifest(context, details.manifestPath, element)
      return
    }

    binding.applyProjection(context, element)
  }

  binding.setState = (state) => {
    if (binding.disabled || binding.selected) {
      return
    }
    if (binding.state === state) {
      binding.applyProjection(context, element)
      return
    }
    binding.state = state
    binding.applyProjection(context, element)
  }

  binding.sync()

  return {
    state: binding.state,
    reference: binding.reference,
    projection: binding.projection,
    assetUrl: binding.assetUrl,
    setState: binding.setState,
    dispose,
  }
}

interface UiControlSkinBindingState {
  kind: UiSkinControlKind
  skinId?: string
  interactive: boolean
  disabled: boolean
  selected: boolean
  state: SpriteSkinStateName
  reference?: string
  manifest?: SpriteSkinManifest
  manifestPath?: string
  manifestRequest: number
  projection?: ResolvedSpriteSkinProjection
  assetUrl?: string
  assetPath?: string
  assetTargetPackageId?: string
  assetDisposer?: () => void
  listenersBound: boolean
  listenerDisposers: Array<() => void>
  sync: () => void
  setState: (state: SpriteSkinStateName) => void
  clear: () => void
  loadManifest: (context: QuaWebDomLayerContext, manifestPath: string, element: HTMLElement) => void
  applyProjection: (context: QuaWebDomLayerContext, element: HTMLElement) => void
  dispose: () => void
}

function createUiControlSkinBindingState(): UiControlSkinBindingState {
  return {
    kind: 'panel',
    interactive: true,
    disabled: false,
    selected: false,
    state: 'default',
    manifestRequest: 0,
    listenersBound: false,
    listenerDisposers: [],
    sync: () => {},
    setState: () => {},
    clear: () => {},
    loadManifest: () => {},
    applyProjection: () => {},
    dispose: () => {},
  }
}

function resolveUiSkinBindingState(binding: UiControlSkinBindingState, currentState: SpriteSkinStateName): SpriteSkinStateName {
  if (binding.disabled) {
    return 'disabled'
  }
  if (binding.selected) {
    return 'selected'
  }
  if (currentState === 'disabled' || currentState === 'selected') {
    return 'default'
  }
  return currentState || 'default'
}

function resolveUiSkinProjectionState(binding: UiControlSkinBindingState): SpriteSkinStateName {
  return resolveUiSkinBindingState(binding, binding.state)
}

function bindUiControlSkinListeners(binding: UiControlSkinBindingState, element: HTMLElement): void {
  if (binding.listenersBound) {
    return
  }

  const addListener = <K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ) => {
    element.addEventListener(type, listener as EventListener)
    binding.listenerDisposers.push(() => element.removeEventListener(type, listener as EventListener))
  }

  addListener('mouseenter', () => binding.setState('hover'))
  addListener('mouseleave', () => binding.setState('default'))
  addListener('mousedown', (event) => {
    if (event.button === 0) {
      binding.setState('pressed')
    }
  })
  addListener('mouseup', () => binding.setState('hover'))
  addListener('focus', () => binding.setState('hover'))
  addListener('blur', () => binding.setState('default'))
  binding.listenersBound = true
}

function unbindUiControlSkinListeners(binding: UiControlSkinBindingState): void {
  while (binding.listenerDisposers.length > 0) {
    binding.listenerDisposers.pop()?.()
  }
  binding.listenersBound = false
}

function updateUiControlSkinStyle(
  binding: UiControlSkinBindingState,
  element: HTMLElement,
  projection?: ResolvedSpriteSkinProjection,
): void {
  if (!projection) {
    applySpriteSkinStyle(element, undefined)
    delete element.dataset.skinKind
    delete element.dataset.skinReference
    delete element.dataset.skinState
    delete element.dataset.skinFallbackUsed
    return
  }

  const state = resolveUiSkinProjectionState(binding)
  if (!binding.assetUrl) {
    applySpriteSkinStyle(element, undefined)
    element.dataset.skinKind = binding.kind
    element.dataset.skinReference = binding.reference || ''
    element.dataset.skinState = state
    element.dataset.skinFallbackUsed = projection.fallbackUsed ? 'true' : 'false'
    return
  }

  element.dataset.skinKind = binding.kind
  element.dataset.skinReference = binding.reference || ''
  element.dataset.skinState = state
  element.dataset.skinFallbackUsed = projection.fallbackUsed ? 'true' : 'false'

  applySpriteSkinStyle(element, {
    ...projection,
    state,
  }, {
    assetUrl: binding.assetUrl,
    state,
  })
}

function clearUiControlSkinStyle(binding: UiControlSkinBindingState, element: HTMLElement): void {
  binding.manifestRequest += 1
  binding.assetDisposer?.()
  binding.assetDisposer = undefined
  binding.assetPath = undefined
  binding.assetTargetPackageId = undefined
  binding.projection = undefined
  binding.assetUrl = undefined
  binding.reference = undefined
  applySpriteSkinStyle(element, undefined)
  delete element.dataset.skinKind
  delete element.dataset.skinReference
  delete element.dataset.skinState
  delete element.dataset.skinFallbackUsed
}

function hasContentPackageId(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}

function normalizeSkinReference(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '')
  return normalized.length > 0 ? normalized : undefined
}
