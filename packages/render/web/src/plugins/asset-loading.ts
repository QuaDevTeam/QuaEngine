import type { Pipeline } from '@quajs/pipeline'
import type { AssetLoadingProjection } from '@quajs/plugin-asset-loading/contracts'
import type { QuaViewProjection, RendererPlugin, UiFeatureSurfaceEntry } from '@quajs/render-core'
import { ASSET_LOADING_PLUGIN_ID, ASSET_LOADING_RETRY } from '@quajs/plugin-asset-loading/contracts'
import { LogicToRenderEvents, onLogicToRender } from '@quajs/render-core'
import { resolveStageLayout, stageContentStyle, stageViewportStyle } from '../layout'
import { createQuiWebOverlayHost } from '../qui/overlays'

export interface AssetLoadingWebRendererOptions {
  /** Mount outside the game root, including before any framework app is mounted. */
  container: HTMLElement
  labels?: Partial<Record<AssetLoadingProjection['phase'] | 'error' | 'retry', string>>
  /** Optional shared QUI surface; Web-only projects can retain the semantic DOM. */
  surface?: UiFeatureSurfaceEntry
}

const defaultLabels = {
  'preparing': 'Preparing resources',
  'loading-local': 'Loading local resources',
  'checking-cache': 'Checking local resources',
  'downloading': 'Downloading resources',
  'verifying': 'Verifying resources',
  'caching': 'Saving resources locally',
  'ready': 'Ready',
  'error': 'Resources could not be loaded. Check your connection and available browser storage, then try again.',
  'retry': 'Retry',
}

/** Resource-free UI: no remote images, fonts, or styles are needed to show a failure. */
export function mountAssetLoadingScene(options: AssetLoadingWebRendererOptions & {
  pipeline: Pipeline
  getViewState: () => Readonly<QuaViewProjection>
}): () => void {
  const { container, pipeline } = options
  const document = container.ownerDocument
  const labels = { ...defaultLabels, ...options.labels }
  const root = document.createElement('section')
  root.className = 'qua-asset-loading'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('data-ui-scene-id', 'asset-loading')
  root.setAttribute('data-ui-scene-presentation', 'scene')
  root.setAttribute('data-ui-scene-default-chrome', 'false')
  root.setAttribute('data-qua-input-ignore', '')
  root.tabIndex = -1
  // Geometry and interaction only. Visual styles are explicitly supplied by the app.
  Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'auto' })
  const title = document.createElement('h1')
  title.className = 'qua-asset-loading__title'
  const status = document.createElement('p')
  status.className = 'qua-asset-loading__status'
  status.setAttribute('role', 'status')
  const progress = document.createElement('progress')
  progress.max = 1
  progress.className = 'qua-asset-loading__progress'
  const detail = document.createElement('p')
  detail.className = 'qua-asset-loading__detail'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = labels.retry
  retry.className = 'qua-asset-loading__retry'
  retry.addEventListener('click', () => {
    retry.disabled = true
    void pipeline.emit(ASSET_LOADING_RETRY, {}).catch(() => {
      retry.disabled = false
    })
  })
  root.append(title, status, progress, detail, retry)
  const viewport = document.createElement('div')
  const stage = document.createElement('div')
  const shared = options.surface ? createQuiWebOverlayHost({ container: stage, pipeline, surfaceKeys: [], features: [options.surface] }) : undefined
  if (shared) {
    const semantics = document.createElement('div')
    semantics.hidden = true
    semantics.append(title, status, progress, detail)
    viewport.append(stage)
    root.replaceChildren(semantics, viewport)
    root.style.padding = '0'
    root.style.background = '#000'
  }
  const resize = () => {
    if (!shared || !root.isConnected) return
    const layout = resolveStageLayout(options.getViewState().layout, { width: root.clientWidth, height: root.clientHeight })
    Object.assign(viewport.style, stageViewportStyle(layout))
    Object.assign(stage.style, stageContentStyle(layout))
  }
  const observer = shared ? new ResizeObserver(resize) : undefined
  observer?.observe(root)
  const retryIntent: Parameters<Pipeline['on']>[1] = ({ event }) => {
    if (shared && (options.getViewState().plugins[ASSET_LOADING_PLUGIN_ID] as AssetLoadingProjection | undefined)?.visible
      && (event.payload as { action?: string })?.action === 'asset-loading-retry')
      void pipeline.emit(ASSET_LOADING_RETRY, {})
  }
  pipeline.on('ui/intent', retryIntent)
  const focusTarget = () => shared ? viewport.querySelector<HTMLButtonElement>('button') ?? root : retry.hidden ? root : retry
  let focused: HTMLElement | null = null
  const inert = new Map<HTMLElement, boolean>()
  const hide = () => {
    if (!root.isConnected)
      return
    root.remove()
    for (const [element, value] of inert) element.inert = value
    inert.clear()
    if (focused?.isConnected)
      focused.focus()
    focused = null
  }
  // Capture keyboard/pointer input before renderer/document handlers; native button
  // activation remains available inside the modal, while game input cannot leak through.
  const blockInput = (event: Event) => {
    if (!root.isConnected)
      return
    event.stopImmediatePropagation()
    if (!root.contains(event.target as Node))
      event.preventDefault()
    if (event instanceof KeyboardEvent && event.key === 'Tab') {
      event.preventDefault()
      focusTarget().focus()
    }
  }
  const events = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'wheel'] as const
  for (const name of events) document.defaultView?.addEventListener(name, blockInput, true)
  const update = () => {
    const state = options.getViewState().plugins[ASSET_LOADING_PLUGIN_ID] as AssetLoadingProjection | undefined
    if (!state?.visible) {
      hide()
      return
    }
    const mounting = !root.isConnected
    if (mounting) {
      focused = document.activeElement as HTMLElement | null
      for (const child of Array.from(container.children)) {
        if (child instanceof HTMLElement) {
          inert.set(child, child.inert)
          child.inert = true
        }
      }
      container.append(root)
    }
    root.dataset.state = state.state
    root.dataset.phase = state.phase
    root.setAttribute('aria-label', state.title)
    root.setAttribute('aria-busy', String(state.state === 'loading'))
    title.textContent = state.title
    status.textContent = state.state === 'error' ? labels.error : labels[state.phase]
    progress.hidden = state.state === 'error'
    progress.setAttribute('aria-label', status.textContent)
    if (state.progress === null)
      progress.removeAttribute('value')
    else progress.value = Math.max(0, Math.min(1, state.progress))
    detail.textContent = state.state === 'error'
      ? ''
      : [
          state.bundleCount ? `${(state.bundleIndex || 0) + 1} / ${state.bundleCount}` : '',
          state.total > 0
            ? `${(state.loaded / 1048576).toFixed(1)} / ${(state.total / 1048576).toFixed(1)} MB`
            : state.loaded ? `${(state.loaded / 1048576).toFixed(1)} MB` : '',
        ].filter(Boolean).join(' · ')
    const wasRetryHidden = retry.hidden
    retry.hidden = state.state !== 'error'
    retry.disabled = state.state !== 'error'
    shared?.update(options.getViewState())
    resize()
    if (mounting || (wasRetryHidden && !retry.hidden))
      focusTarget().focus()
  }
  const off = onLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, update)
  update()
  return () => {
    off()
    observer?.disconnect()
    shared?.dispose()
    pipeline.off('ui/intent', retryIntent)
    hide()
    for (const name of events) document.defaultView?.removeEventListener(name, blockInput, true)
  }
}

/** The same Web implementation works in Web/Vue/React/Svelte plugin hosts. */
export function createAssetLoadingWebRendererPlugin(options: AssetLoadingWebRendererOptions): RendererPlugin {
  return {
    name: '@quajs/renderer-web/plugins/asset-loading',
    setup(context) {
      context.addDisposer(mountAssetLoadingScene({
        ...options,
        pipeline: context.getPipeline(),
        getViewState: () => context.getViewState(),
      }))
    },
  }
}
