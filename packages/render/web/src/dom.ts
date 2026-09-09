import type { AssetType } from '@quajs/assets'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import type { RendererActions } from './actions'
import type { WebAssetTargetPackageId, WebAssetUrlState } from './assets'
import type { QuaWebRendererOptions, QuaWebRendererSnapshot } from './controller'
import type { StageContainerSize, StageRenderPlane } from './layout'
import { WebAssetUrlHandle } from './assets'
import { QuaWebRendererController } from './controller'
import { sortRendererLayers } from './layers'
import { observeStageViewportEnvironment, readCssSafeAreaInsets, readDevicePixelRatio, rendererRootStyle, resolveStageLayout, stageContentStyle, stageFrameStyle, stagePlaneStyle, stageSafeAreaStyle, stageSceneStyle, stageViewportStyle } from './layout'
import { projectStageMotion, stageMotionVars } from './projection'
import { createWebSavePreviewCapturePlugin } from './save-preview-capture'

export interface QuaWebDomLayerContext {
  renderer: QuaWebDomRenderer
  controller: QuaWebRendererController
  snapshot: QuaWebRendererSnapshot
  document: Document
  view: Readonly<QuaViewProjection>
  actions: RendererActions
  bindAssetUrl: (element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement, type: AssetType, name: string | undefined, attribute?: 'src' | 'poster', targetPackageId?: WebAssetTargetPackageId) => void
  watchAssetUrl: (
    type: AssetType,
    name: string | undefined,
    onChange: (state: Readonly<WebAssetUrlState>) => void,
    targetPackageId?: WebAssetTargetPackageId,
  ) => () => void
}

export interface QuaWebDomRendererLayer {
  id: string
  order?: number
  plane?: StageRenderPlane
  render: (context: QuaWebDomLayerContext) => Node | null | undefined
  update?: (context: QuaWebDomLayerContext, node: Node) => void
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
  private readonly layerNodes = new Map<string, Node>()
  private scenePlaneNode?: HTMLElement
  private animationFrame?: number
  private animationTimeout?: ReturnType<typeof setTimeout>
  private resizeObserver?: ResizeObserver
  private viewportEnvironmentDisposer?: () => void
  private unsubscribe?: () => void
  private mounted = false

  constructor(private readonly options: QuaWebDomRendererOptions) {
    const capturePlugin = createWebSavePreviewCapturePlugin({
      getStageElement: () => this.root.querySelector<HTMLElement>('.qua-stage'),
    })
    const rendererPlugins = [capturePlugin, ...(options.plugins || [])]
    const domPlugins = rendererPlugins.filter((plugin): plugin is QuaWebDomRendererPlugin => 'layers' in plugin)
    this.controller = new QuaWebRendererController({
      ...options,
      plugins: rendererPlugins,
    })
    this.root = this.getDocument().createElement('div')
    this.root.className = options.unstyled ? 'qua-renderer qua-renderer--unstyled' : 'qua-renderer'
    applyStyles(this.root, rendererRootStyle())
    this.layers = sortRendererLayers(domPlugins.flatMap(plugin => plugin.layers || []))
  }

  async mount(): Promise<void> {
    if (this.mounted) {
      return
    }

    this.mounted = true
    this.options.container.append(this.root)
    this.observeContainer()
    this.unsubscribe = this.controller.subscribe(() => this.safeRender('snapshot'))
    await this.controller.start()
    this.safeRender('mount')
  }

  async unmount(): Promise<void> {
    if (!this.mounted) {
      return
    }

    this.mounted = false
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.cancelAnimationTick()
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.viewportEnvironmentDisposer?.()
    this.viewportEnvironmentDisposer = undefined
    this.scenePlaneNode = undefined
    this.disposeAssetHandles()
    this.layerNodes.clear()
    this.root.replaceChildren()
    this.root.remove()
    await this.controller.destroy()
  }

  render(snapshot = this.controller.getSnapshot()): void {
    if (!this.mounted) {
      return
    }

    this.disposeAssetHandles()
    this.layerNodes.clear()
    this.scenePlaneNode = undefined
    this.root.textContent = ''
    const document = this.getDocument()
    const layout = resolveStageLayout(snapshot.view.layout, this.readContainerSize())
    const frame = document.createElement('div')
    frame.className = 'qua-stage-frame'
    applyStyles(frame, stageFrameStyle())

    const viewport = document.createElement('div')
    viewport.className = 'qua-stage-viewport'
    applyStyles(viewport, stageViewportStyle(layout))

    const stage = document.createElement('section')
    stage.className = 'qua-stage'
    applyStyles(stage, stageContentStyle(layout))

    const scenePlane = document.createElement('div')
    scenePlane.className = 'qua-stage-scene'
    scenePlane.setAttribute('data-qua-capture-role', 'scene')
    applyStyles(scenePlane, {
      ...stageSceneStyle(),
      ...stageMotionVars(projectStageMotion(snapshot.view, Date.now())),
    })
    this.scenePlaneNode = scenePlane

    const sceneContentPlane = document.createElement('div')
    sceneContentPlane.className = 'qua-stage-scene-content'
    sceneContentPlane.setAttribute('data-qua-capture-role', 'scene')
    applyStyles(sceneContentPlane, stagePlaneStyle())

    const subjectPlane = document.createElement('div')
    subjectPlane.className = 'qua-stage-subject'
    subjectPlane.setAttribute('data-qua-capture-role', 'scene')
    applyStyles(subjectPlane, stagePlaneStyle())

    const stagePlane = document.createElement('div')
    stagePlane.className = 'qua-stage-plane'
    stagePlane.setAttribute('data-qua-capture-role', 'scene')
    applyStyles(stagePlane, stagePlaneStyle())

    const safePlane = document.createElement('div')
    safePlane.className = 'qua-stage-safe'
    safePlane.setAttribute('data-qua-capture-role', 'safe-ui')
    applyStyles(safePlane, stageSafeAreaStyle(layout))

    const overlayPlane = document.createElement('div')
    overlayPlane.className = 'qua-stage-overlay'
    overlayPlane.setAttribute('data-qua-capture-role', 'overlay-ui')
    applyStyles(overlayPlane, {
      ...stagePlaneStyle(),
    })
    overlayPlane.style.pointerEvents = 'none'

    const screenPlane = document.createElement('div')
    screenPlane.className = 'qua-screen-plane'
    screenPlane.setAttribute('data-qua-capture-role', 'screen-ui')
    applyStyles(screenPlane, {
      ...stagePlaneStyle(),
    })
    screenPlane.style.pointerEvents = 'none'

    const context: QuaWebDomLayerContext = {
      renderer: this,
      controller: this.controller,
      snapshot,
      document,
      view: snapshot.view,
      actions: snapshot.actions,
      bindAssetUrl: (element, type, name, attribute = 'src', targetPackageId) => this.bindAssetUrl(element, type, name, attribute, targetPackageId),
      watchAssetUrl: (type, name, onChange, targetPackageId) => this.watchAssetUrl(type, name, onChange, targetPackageId),
    }

    for (const layer of this.layers) {
      try {
        const node = layer.render(context)
        if (node) {
          this.layerNodes.set(layer.id, node)
          const targetPlane = this.resolveLayerPlane(layer, {
            scene: sceneContentPlane,
            subject: subjectPlane,
            stage: stagePlane,
            safe: safePlane,
            overlay: overlayPlane,
            screen: screenPlane,
          })
          if ((targetPlane === overlayPlane || targetPlane === screenPlane) && node instanceof HTMLElement && !node.style.pointerEvents) {
            node.style.pointerEvents = 'auto'
          }
          targetPlane.append(node)
        }
      }
      catch (error) {
        void this.controller.reportError(error, {
          message: `DOM renderer layer "${layer.id}" failed during render.`,
          phase: 'dom-layer:render',
          metadata: { layerId: layer.id },
        })
      }
    }

    scenePlane.append(sceneContentPlane, subjectPlane)
    stage.append(scenePlane, stagePlane, safePlane, overlayPlane)
    viewport.append(stage)
    frame.append(viewport, screenPlane)
    this.root.append(frame)
    this.scheduleAnimationTick(snapshot)
  }

  private observeContainer(): void {
    const ResizeObserverCtor = this.getWindow().ResizeObserver
    if (ResizeObserverCtor) {
      this.resizeObserver = new ResizeObserverCtor(() => this.safeRender('resize'))
      this.resizeObserver.observe(this.options.container)
    }
    this.viewportEnvironmentDisposer = observeStageViewportEnvironment(this.options.container, () => this.safeRender('viewport'))
  }

  private readContainerSize(): StageContainerSize {
    const rect = this.root.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return {
        width: rect.width,
        height: rect.height,
        devicePixelRatio: readDevicePixelRatio(this.options.container),
        safeAreaInsets: readCssSafeAreaInsets(this.options.container),
      }
    }

    const containerRect = this.options.container.getBoundingClientRect()
    return {
      width: containerRect.width,
      height: containerRect.height,
      devicePixelRatio: readDevicePixelRatio(this.options.container),
      safeAreaInsets: readCssSafeAreaInsets(this.options.container),
    }
  }

  private bindAssetUrl(
    element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement,
    type: AssetType,
    name: string | undefined,
    attribute: 'src' | 'poster',
    targetPackageId?: WebAssetTargetPackageId,
  ): void {
    this.watchAssetUrl(type, name, (state) => {
      if (state.url) {
        element.setAttribute(attribute, state.url)
      }
      else {
        element.removeAttribute(attribute)
      }
    }, targetPackageId)
  }

  private watchAssetUrl(
    type: AssetType,
    name: string | undefined,
    onChange: (state: Readonly<WebAssetUrlState>) => void,
    targetPackageId?: WebAssetTargetPackageId,
  ): () => void {
    const handle = new WebAssetUrlHandle({
      getAssets: () => this.controller.getAssets(),
      getType: () => type,
      getName: () => name,
      getTargetPackageId: () => targetPackageId,
      getRevision: () => this.controller.getSnapshot().assetRevision,
      onChange,
    })
    this.assetHandles.push(handle)
    void handle.load()
    return () => {
      handle.dispose({ defer: true })
      const index = this.assetHandles.indexOf(handle)
      if (index >= 0) {
        this.assetHandles.splice(index, 1)
      }
    }
  }

  private disposeAssetHandles(): void {
    while (this.assetHandles.length > 0) {
      this.assetHandles.pop()?.dispose({ defer: true })
    }
  }

  private getDocument(): Document {
    return this.options.container.ownerDocument || document
  }

  private getWindow(): Window & typeof globalThis {
    return this.getDocument().defaultView || window
  }

  private updateAnimatedLayers(snapshot = this.controller.getSnapshot()): void {
    if (this.scenePlaneNode) {
      applyStyles(this.scenePlaneNode, stageMotionVars(projectStageMotion(snapshot.view, Date.now())))
    }
    const context = this.createLayerContext(snapshot)
    for (const layer of this.layers) {
      const node = this.layerNodes.get(layer.id)
      if (node && layer.update) {
        try {
          layer.update(context, node)
        }
        catch (error) {
          void this.controller.reportError(error, {
            message: `DOM renderer layer "${layer.id}" failed during update.`,
            phase: 'dom-layer:update',
            metadata: { layerId: layer.id },
          })
        }
      }
    }
  }

  private resolveLayerPlane(layer: QuaWebDomRendererLayer, planes: {
    scene: HTMLElement
    subject: HTMLElement
    stage: HTMLElement
    safe: HTMLElement
    overlay: HTMLElement
    screen: HTMLElement
  }): HTMLElement {
    switch (layer.plane || 'scene') {
      case 'screen':
        return planes.screen
      case 'overlay':
        return planes.overlay
      case 'safe':
        return planes.safe
      case 'stage':
        return planes.stage
      case 'subject':
        return planes.subject
      case 'scene':
      default:
        return planes.scene
    }
  }

  private scheduleAnimationTick(snapshot = this.controller.getSnapshot()): void {
    this.cancelAnimationTick()
    if (!this.mounted || !snapshot.view.animations.some(animation => animation.state === 'running')) {
      return
    }

    const win = this.getWindow()
    const tick = () => {
      this.animationFrame = undefined
      this.animationTimeout = undefined
      if (!this.mounted) {
        return
      }
      const nextSnapshot = this.controller.getSnapshot()
      this.safeUpdateAnimatedLayers(nextSnapshot)
      this.scheduleAnimationTick(nextSnapshot)
    }

    if (typeof win.requestAnimationFrame === 'function') {
      this.animationFrame = win.requestAnimationFrame(tick)
    }
    else {
      this.animationTimeout = setTimeout(tick, 16)
    }
  }

  private cancelAnimationTick(): void {
    const win = this.getWindow()
    if (this.animationFrame !== undefined && typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(this.animationFrame)
    }
    if (this.animationTimeout !== undefined) {
      clearTimeout(this.animationTimeout)
    }
    this.animationFrame = undefined
    this.animationTimeout = undefined
  }

  private createLayerContext(snapshot: QuaWebRendererSnapshot): QuaWebDomLayerContext {
    return {
      renderer: this,
      controller: this.controller,
      snapshot,
      document: this.getDocument(),
      view: snapshot.view,
      actions: snapshot.actions,
      bindAssetUrl: (element, type, name, attribute = 'src', targetPackageId) => this.bindAssetUrl(element, type, name, attribute, targetPackageId),
      watchAssetUrl: (type, name, onChange, targetPackageId) => this.watchAssetUrl(type, name, onChange, targetPackageId),
    }
  }

  private safeRender(phase: string, snapshot = this.controller.getSnapshot()): void {
    try {
      this.render(snapshot)
    }
    catch (error) {
      void this.controller.reportError(error, {
        message: 'DOM renderer failed during render.',
        phase: `dom-renderer:${phase}`,
      })
    }
  }

  private safeUpdateAnimatedLayers(snapshot = this.controller.getSnapshot()): void {
    try {
      this.updateAnimatedLayers(snapshot)
    }
    catch (error) {
      void this.controller.reportError(error, {
        message: 'DOM renderer failed during animation update.',
        phase: 'dom-renderer:animation',
      })
    }
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
