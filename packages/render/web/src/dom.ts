import type { AssetType } from '@quajs/assets'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import type { RendererActions } from './actions'
import type { WebAssetUrlState } from './assets'
import type { QuaWebRendererOptions, QuaWebRendererSnapshot } from './controller'
import type { StageContainerSize } from './layout'
import { WebAssetUrlHandle } from './assets'
import { QuaWebRendererController } from './controller'
import { sortRendererLayers } from './layers'
import { resolveStageLayout, stageContentStyle, stageViewportStyle } from './layout'

export interface QuaWebDomLayerContext {
  renderer: QuaWebDomRenderer
  controller: QuaWebRendererController
  snapshot: QuaWebRendererSnapshot
  document: Document
  view: Readonly<QuaViewProjection>
  actions: RendererActions
  bindAssetUrl: (element: HTMLImageElement | HTMLVideoElement, type: AssetType, name: string | undefined, attribute?: 'src' | 'poster') => void
  watchAssetUrl: (
    type: AssetType,
    name: string | undefined,
    onChange: (state: Readonly<WebAssetUrlState>) => void,
  ) => void
}

export interface QuaWebDomRendererLayer {
  id: string
  order?: number
  render: (context: QuaWebDomLayerContext) => Node | null | undefined
}

export interface QuaWebDomRendererPlugin extends RendererPlugin {
  layers?: readonly QuaWebDomRendererLayer[]
}

export interface QuaWebDomRendererOptions extends Omit<QuaWebRendererOptions, 'plugins'> {
  container: Element
  plugins?: readonly (QuaWebDomRendererPlugin | RendererPlugin)[]
  unstyled?: boolean
}

export class QuaWebDomRenderer {
  readonly controller: QuaWebRendererController

  private readonly root: HTMLElement
  private readonly layers: readonly QuaWebDomRendererLayer[]
  private readonly assetHandles: WebAssetUrlHandle[] = []
  private resizeObserver?: ResizeObserver
  private unsubscribe?: () => void
  private mounted = false

  constructor(private readonly options: QuaWebDomRendererOptions) {
    this.controller = new QuaWebRendererController({
      ...options,
      plugins: options.plugins,
    })
    this.root = this.getDocument().createElement('div')
    this.root.className = options.unstyled ? 'qua-renderer qua-renderer--unstyled' : 'qua-renderer'
    this.layers = sortRendererLayers((options.plugins || []).flatMap(plugin => 'layers' in plugin ? plugin.layers || [] : []))
  }

  async mount(): Promise<void> {
    if (this.mounted) {
      return
    }

    this.mounted = true
    this.options.container.append(this.root)
    this.observeContainer()
    this.unsubscribe = this.controller.subscribe(() => this.render())
    await this.controller.start()
    this.render()
  }

  async unmount(): Promise<void> {
    if (!this.mounted) {
      return
    }

    this.mounted = false
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.disposeAssetHandles()
    this.root.remove()
    await this.controller.destroy()
  }

  render(snapshot = this.controller.getSnapshot()): void {
    if (!this.mounted) {
      return
    }

    this.disposeAssetHandles()
    this.root.textContent = ''
    const document = this.getDocument()
    const layout = resolveStageLayout(snapshot.view.layout, this.readContainerSize())
    const viewport = document.createElement('div')
    viewport.className = 'qua-stage-viewport'
    applyStyles(viewport, stageViewportStyle(layout))

    const stage = document.createElement('section')
    stage.className = 'qua-stage'
    applyStyles(stage, stageContentStyle(layout))
    stage.addEventListener('click', () => {
      void snapshot.actions.advance('stage-click')
    })

    const context: QuaWebDomLayerContext = {
      renderer: this,
      controller: this.controller,
      snapshot,
      document,
      view: snapshot.view,
      actions: snapshot.actions,
      bindAssetUrl: (element, type, name, attribute = 'src') => this.bindAssetUrl(element, type, name, attribute),
      watchAssetUrl: (type, name, onChange) => this.watchAssetUrl(type, name, onChange),
    }

    for (const layer of this.layers) {
      const node = layer.render(context)
      if (node) {
        stage.append(node)
      }
    }

    viewport.append(stage)
    this.root.append(viewport)
  }

  private observeContainer(): void {
    const ResizeObserverCtor = this.getWindow().ResizeObserver
    if (!ResizeObserverCtor) {
      return
    }

    this.resizeObserver = new ResizeObserverCtor(() => this.render())
    this.resizeObserver.observe(this.options.container)
  }

  private readContainerSize(): StageContainerSize {
    const rect = this.root.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return {
        width: rect.width,
        height: rect.height,
      }
    }

    const containerRect = this.options.container.getBoundingClientRect()
    return {
      width: containerRect.width,
      height: containerRect.height,
    }
  }

  private bindAssetUrl(
    element: HTMLImageElement | HTMLVideoElement,
    type: AssetType,
    name: string | undefined,
    attribute: 'src' | 'poster',
  ): void {
    this.watchAssetUrl(type, name, (state) => {
      if (state.url) {
        element.setAttribute(attribute, state.url)
      }
      else {
        element.removeAttribute(attribute)
      }
    })
  }

  private watchAssetUrl(
    type: AssetType,
    name: string | undefined,
    onChange: (state: Readonly<WebAssetUrlState>) => void,
  ): void {
    const handle = new WebAssetUrlHandle({
      getAssets: () => this.controller.getAssets(),
      getType: () => type,
      getName: () => name,
      onChange,
    })
    this.assetHandles.push(handle)
    void handle.load()
  }

  private disposeAssetHandles(): void {
    while (this.assetHandles.length > 0) {
      this.assetHandles.pop()?.dispose()
    }
  }

  private getDocument(): Document {
    return this.options.container.ownerDocument || document
  }

  private getWindow(): Window & typeof globalThis {
    return this.getDocument().defaultView || window
  }
}

export function createQuaWebDomRenderer(options: QuaWebDomRendererOptions): QuaWebDomRenderer {
  return new QuaWebDomRenderer(options)
}

function applyStyles(element: HTMLElement, styles: Record<string, string | number>): void {
  for (const [name, value] of Object.entries(styles)) {
    element.style.setProperty(name, typeof value === 'number' ? String(value) : value)
  }
}
