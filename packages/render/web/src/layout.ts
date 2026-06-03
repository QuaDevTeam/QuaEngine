import type { ViewLayoutProjection } from '@quajs/render-core'
import { createViewLayoutProjection } from '@quajs/render-core'

export interface StageContainerSize {
  width: number
  height: number
  devicePixelRatio?: number
  safeAreaInsets?: Partial<StageSafeAreaInsets>
}

export interface StageSafeArea {
  x: number
  y: number
  width: number
  height: number
}

export interface StageSafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface StageClientPoint {
  clientX: number
  clientY: number
}

export interface StageLogicalPoint {
  x: number
  y: number
}

export interface StageClientRectOrigin {
  left: number
  top: number
}

export interface StageHitTestPoint extends StageLogicalPoint {
  insideViewport: boolean
  insideStage: boolean
}

export type StageRenderPlane = 'scene' | 'subject' | 'stage' | 'safe' | 'screen'

export interface ResolvedStageLayout {
  layout: ViewLayoutProjection
  containerWidth: number
  containerHeight: number
  viewportWidth: number
  viewportHeight: number
  viewportX: number
  viewportY: number
  logicalWidth: number
  logicalHeight: number
  scale: number
  physicalScale: number
  aspectRatio: number
  devicePixelRatio: number
  physicalViewportWidth: number
  physicalViewportHeight: number
  aspectSafeArea: StageSafeArea
  deviceSafeArea: StageSafeArea
  cssSafeAreaInsets: StageSafeAreaInsets
  logicalSafeAreaInsets: StageSafeAreaInsets
  safeArea: StageSafeArea
}

export function resolveStageLayout(
  layoutInput: Readonly<ViewLayoutProjection> | undefined,
  container: Partial<StageContainerSize> = {},
): ResolvedStageLayout {
  const layout = createViewLayoutProjection(layoutInput ? { ...layoutInput } : undefined)
  const fallbackContainer = {
    width: layout.width,
    height: layout.height,
  }
  const containerWidth = positiveNumber(container.width, fallbackContainer.width)
  const containerHeight = positiveNumber(container.height, fallbackContainer.height)
  const devicePixelRatio = positiveNumber(container.devicePixelRatio, 1)
  const cssSafeAreaInsets = normalizeSafeAreaInsets(container.safeAreaInsets)
  const containerAspectRatio = containerWidth / containerHeight
  const aspectRatio = clamp(containerAspectRatio, layout.minAspectRatio, layout.maxAspectRatio)
  const viewport = fitAspectRatio(containerWidth, containerHeight, aspectRatio)
  const scale = viewport.height / layout.height
  const logicalWidth = viewport.width / scale
  const logicalHeight = layout.height
  const safeWidth = Math.min(logicalWidth, layout.height * layout.minAspectRatio)
  const aspectSafeArea: StageSafeArea = {
    x: (logicalWidth - safeWidth) / 2,
    y: 0,
    width: safeWidth,
    height: logicalHeight,
  }
  const viewportX = (containerWidth - viewport.width) / 2
  const viewportY = (containerHeight - viewport.height) / 2
  const logicalSafeAreaInsets = resolveLogicalSafeAreaInsets({
    containerWidth,
    containerHeight,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    viewportX,
    viewportY,
    scale,
    cssSafeAreaInsets,
  })
  const deviceSafeArea: StageSafeArea = {
    x: logicalSafeAreaInsets.left,
    y: logicalSafeAreaInsets.top,
    width: Math.max(0, logicalWidth - logicalSafeAreaInsets.left - logicalSafeAreaInsets.right),
    height: Math.max(0, logicalHeight - logicalSafeAreaInsets.top - logicalSafeAreaInsets.bottom),
  }
  const safeArea = intersectSafeArea(aspectSafeArea, deviceSafeArea)

  return {
    layout,
    containerWidth,
    containerHeight,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    viewportX,
    viewportY,
    logicalWidth,
    logicalHeight,
    scale,
    physicalScale: scale * devicePixelRatio,
    aspectRatio,
    devicePixelRatio,
    physicalViewportWidth: viewport.width * devicePixelRatio,
    physicalViewportHeight: viewport.height * devicePixelRatio,
    aspectSafeArea,
    deviceSafeArea,
    cssSafeAreaInsets,
    logicalSafeAreaInsets,
    safeArea,
  }
}

export function clientPointToStageLogical(
  layout: ResolvedStageLayout,
  point: StageClientPoint,
  containerRect: StageClientRectOrigin = { left: 0, top: 0 },
): StageHitTestPoint {
  const containerX = point.clientX - containerRect.left
  const containerY = point.clientY - containerRect.top
  const viewportX = containerX - layout.viewportX
  const viewportY = containerY - layout.viewportY
  const x = viewportX / layout.scale
  const y = viewportY / layout.scale

  return {
    x,
    y,
    insideViewport: viewportX >= 0
      && viewportY >= 0
      && viewportX <= layout.viewportWidth
      && viewportY <= layout.viewportHeight,
    insideStage: x >= 0
      && y >= 0
      && x <= layout.logicalWidth
      && y <= layout.logicalHeight,
  }
}

export function stageLogicalToClientPoint(
  layout: ResolvedStageLayout,
  point: StageLogicalPoint,
  containerRect: StageClientRectOrigin = { left: 0, top: 0 },
): StageClientPoint {
  return {
    clientX: containerRect.left + layout.viewportX + point.x * layout.scale,
    clientY: containerRect.top + layout.viewportY + point.y * layout.scale,
  }
}

export function observeStageViewportEnvironment(
  element: Element | undefined,
  callback: () => void,
): () => void {
  const win = element?.ownerDocument?.defaultView || (typeof window === 'undefined' ? undefined : window)
  if (!win || typeof win.addEventListener !== 'function') {
    return () => {}
  }

  const disposers: Array<() => void> = []
  const addListener = (target: EventTarget | undefined, type: string) => {
    if (!target || typeof target.addEventListener !== 'function') {
      return
    }

    target.addEventListener(type, callback)
    disposers.push(() => target.removeEventListener(type, callback))
  }

  addListener(win, 'resize')
  addListener(win, 'orientationchange')
  addListener(win, 'pageshow')
  addListener(win, 'focus')
  addListener(win.visualViewport || undefined, 'resize')
  addListener(win.visualViewport || undefined, 'scroll')
  addListener(element?.ownerDocument, 'visibilitychange')

  return () => {
    while (disposers.length > 0) {
      disposers.pop()?.()
    }
  }
}

export function rendererRootStyle(): Record<string, string> {
  return {
    'position': 'relative',
    'width': '100%',
    'min-height': '100dvh',
    'overflow': 'hidden',
    'isolation': 'isolate',
    '--qua-css-safe-area-top': 'env(safe-area-inset-top, 0px)',
    '--qua-css-safe-area-right': 'env(safe-area-inset-right, 0px)',
    '--qua-css-safe-area-bottom': 'env(safe-area-inset-bottom, 0px)',
    '--qua-css-safe-area-left': 'env(safe-area-inset-left, 0px)',
  }
}

export function stageFrameStyle(): Record<string, string> {
  return {
    'position': 'absolute',
    'inset': '0',
    'overflow': 'clip',
    'overscroll-behavior': 'none',
  }
}

export function stageViewportStyle(layout: ResolvedStageLayout): Record<string, string> {
  return {
    'position': 'absolute',
    'overflow': 'clip',
    'overscroll-behavior': 'none',
    'width': `${layout.viewportWidth}px`,
    'height': `${layout.viewportHeight}px`,
    'left': `${layout.viewportX}px`,
    'top': `${layout.viewportY}px`,
  }
}

export function stageContentStyle(layout: ResolvedStageLayout): Record<string, string | number> {
  return {
    'position': 'relative',
    'overflow': 'clip',
    'width': `${layout.logicalWidth}px`,
    'height': `${layout.logicalHeight}px`,
    'transform': `scale(${layout.scale})`,
    'transform-origin': 'top left',
    '--qua-layout-width': layout.logicalWidth,
    '--qua-layout-height': layout.logicalHeight,
    '--qua-layout-scale': layout.scale,
    '--qua-layout-physical-scale': layout.physicalScale,
    '--qua-layout-device-pixel-ratio': layout.devicePixelRatio,
    '--qua-layout-physical-viewport-width': layout.physicalViewportWidth,
    '--qua-layout-physical-viewport-height': layout.physicalViewportHeight,
    '--qua-layout-aspect-ratio': layout.aspectRatio,
    '--qua-layout-reference-aspect-ratio': layout.layout.aspectRatio,
    '--qua-layout-min-aspect-ratio': layout.layout.minAspectRatio,
    '--qua-layout-max-aspect-ratio': layout.layout.maxAspectRatio,
    '--qua-layout-aspect-safe-x': layout.aspectSafeArea.x,
    '--qua-layout-aspect-safe-y': layout.aspectSafeArea.y,
    '--qua-layout-aspect-safe-width': layout.aspectSafeArea.width,
    '--qua-layout-aspect-safe-height': layout.aspectSafeArea.height,
    '--qua-layout-device-safe-x': layout.deviceSafeArea.x,
    '--qua-layout-device-safe-y': layout.deviceSafeArea.y,
    '--qua-layout-device-safe-width': layout.deviceSafeArea.width,
    '--qua-layout-device-safe-height': layout.deviceSafeArea.height,
    '--qua-layout-safe-inset-top': layout.logicalSafeAreaInsets.top,
    '--qua-layout-safe-inset-right': layout.logicalSafeAreaInsets.right,
    '--qua-layout-safe-inset-bottom': layout.logicalSafeAreaInsets.bottom,
    '--qua-layout-safe-inset-left': layout.logicalSafeAreaInsets.left,
    '--qua-layout-css-safe-inset-top': `${layout.cssSafeAreaInsets.top}px`,
    '--qua-layout-css-safe-inset-right': `${layout.cssSafeAreaInsets.right}px`,
    '--qua-layout-css-safe-inset-bottom': `${layout.cssSafeAreaInsets.bottom}px`,
    '--qua-layout-css-safe-inset-left': `${layout.cssSafeAreaInsets.left}px`,
    '--qua-layout-safe-x': layout.safeArea.x,
    '--qua-layout-safe-y': layout.safeArea.y,
    '--qua-layout-safe-width': layout.safeArea.width,
    '--qua-layout-safe-height': layout.safeArea.height,
    '--qua-layout-safe-center-x': layout.safeArea.x + layout.safeArea.width / 2,
    '--qua-layout-safe-center-y': layout.safeArea.y + layout.safeArea.height / 2,
    '--qua-layout-safe-x-px': `${layout.safeArea.x}px`,
    '--qua-layout-safe-y-px': `${layout.safeArea.y}px`,
    '--qua-layout-safe-width-px': `${layout.safeArea.width}px`,
    '--qua-layout-safe-height-px': `${layout.safeArea.height}px`,
    '--qua-layout-safe-center-x-px': `${layout.safeArea.x + layout.safeArea.width / 2}px`,
    '--qua-layout-safe-center-y-px': `${layout.safeArea.y + layout.safeArea.height / 2}px`,
  }
}

export function stageSceneStyle(): Record<string, string | number> {
  return {
    'position': 'absolute',
    'inset': '0',
    'overflow': 'clip',
    'transform': 'translate(calc(var(--qua-stage-x, 0) * 1px), calc(var(--qua-stage-y, 0) * 1px)) scale(var(--qua-stage-scale, 1)) rotate(calc(var(--qua-stage-rotation, 0) * 1deg)) translate(calc(var(--qua-camera-x, 0) * -1px), calc(var(--qua-camera-y, 0) * -1px)) scale(var(--qua-camera-scale, 1)) rotate(calc(var(--qua-camera-rotation, 0) * -1deg))',
    'transform-origin': 'top left',
    'opacity': 'var(--qua-stage-opacity, 1)',
  }
}

export function stagePlaneStyle(): Record<string, string | number> {
  return {
    position: 'absolute',
    inset: '0',
    overflow: 'clip',
  }
}

export function stageSafeAreaStyle(layout: ResolvedStageLayout): Record<string, string | number> {
  return {
    'position': 'absolute',
    'overflow': 'visible',
    'left': `${layout.safeArea.x}px`,
    'top': `${layout.safeArea.y}px`,
    'width': `${layout.safeArea.width}px`,
    'height': `${layout.safeArea.height}px`,
    '--qua-safe-area-x': layout.safeArea.x,
    '--qua-safe-area-y': layout.safeArea.y,
    '--qua-safe-area-width': layout.safeArea.width,
    '--qua-safe-area-height': layout.safeArea.height,
  }
}

export function readDevicePixelRatio(element?: Element): number {
  const win = element?.ownerDocument?.defaultView || (typeof window === 'undefined' ? undefined : window)
  return positiveNumber(win?.devicePixelRatio, 1)
}

export function readCssSafeAreaInsets(element?: Element): StageSafeAreaInsets {
  const doc = element?.ownerDocument || (typeof document === 'undefined' ? undefined : document)
  const win = doc?.defaultView || (typeof window === 'undefined' ? undefined : window)
  const parent = doc?.documentElement || doc?.body
  if (!doc || !win || !parent || typeof win.getComputedStyle !== 'function') {
    return zeroSafeAreaInsets()
  }

  const probe = doc.createElement('div')
  probe.style.position = 'fixed'
  probe.style.left = '0'
  probe.style.top = '0'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.contain = 'strict'
  probe.style.paddingTop = 'env(safe-area-inset-top, 0px)'
  probe.style.paddingRight = 'env(safe-area-inset-right, 0px)'
  probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)'
  probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)'
  parent.append(probe)
  const style = win.getComputedStyle(probe)
  const insets = {
    top: parseCssPixelValue(style.paddingTop),
    right: parseCssPixelValue(style.paddingRight),
    bottom: parseCssPixelValue(style.paddingBottom),
    left: parseCssPixelValue(style.paddingLeft),
  }
  probe.remove()
  return element ? resolveElementSafeAreaInsets(element, insets, win, doc) : insets
}

function fitAspectRatio(width: number, height: number, aspectRatio: number): { width: number, height: number } {
  const heightFromWidth = width / aspectRatio
  if (heightFromWidth <= height) {
    return {
      width,
      height: heightFromWidth,
    }
  }

  return {
    width: height * aspectRatio,
    height,
  }
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizeSafeAreaInsets(insets: Partial<StageSafeAreaInsets> | undefined): StageSafeAreaInsets {
  return {
    top: nonNegativeNumber(insets?.top),
    right: nonNegativeNumber(insets?.right),
    bottom: nonNegativeNumber(insets?.bottom),
    left: nonNegativeNumber(insets?.left),
  }
}

function resolveLogicalSafeAreaInsets(options: {
  containerWidth: number
  containerHeight: number
  viewportWidth: number
  viewportHeight: number
  viewportX: number
  viewportY: number
  scale: number
  cssSafeAreaInsets: StageSafeAreaInsets
}): StageSafeAreaInsets {
  const rightBarWidth = options.containerWidth - options.viewportX - options.viewportWidth
  const bottomBarHeight = options.containerHeight - options.viewportY - options.viewportHeight
  return {
    top: Math.max(0, options.cssSafeAreaInsets.top - options.viewportY) / options.scale,
    right: Math.max(0, options.cssSafeAreaInsets.right - rightBarWidth) / options.scale,
    bottom: Math.max(0, options.cssSafeAreaInsets.bottom - bottomBarHeight) / options.scale,
    left: Math.max(0, options.cssSafeAreaInsets.left - options.viewportX) / options.scale,
  }
}

function intersectSafeArea(left: StageSafeArea, right: StageSafeArea): StageSafeArea {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const maxX = Math.min(left.x + left.width, right.x + right.width)
  const maxY = Math.min(left.y + left.height, right.y + right.height)
  return {
    x,
    y,
    width: Math.max(0, maxX - x),
    height: Math.max(0, maxY - y),
  }
}

function zeroSafeAreaInsets(): StageSafeAreaInsets {
  return { top: 0, right: 0, bottom: 0, left: 0 }
}

function nonNegativeNumber(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0
}

function parseCssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function resolveElementSafeAreaInsets(
  element: Element,
  viewportInsets: StageSafeAreaInsets,
  win: Window,
  doc: Document,
): StageSafeAreaInsets {
  if (typeof element.getBoundingClientRect !== 'function') {
    return viewportInsets
  }

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 && rect.height <= 0) {
    return viewportInsets
  }

  const visualViewport = win.visualViewport
  const viewportLeft = finiteNumber(visualViewport?.offsetLeft, 0)
  const viewportTop = finiteNumber(visualViewport?.offsetTop, 0)
  const viewportWidth = positiveNumber(
    visualViewport?.width,
    positiveNumber(win.innerWidth, positiveNumber(doc.documentElement?.clientWidth, rect.right + viewportInsets.right)),
  )
  const viewportHeight = positiveNumber(
    visualViewport?.height,
    positiveNumber(win.innerHeight, positiveNumber(doc.documentElement?.clientHeight, rect.bottom + viewportInsets.bottom)),
  )
  const safeRight = viewportLeft + viewportWidth - viewportInsets.right
  const safeBottom = viewportTop + viewportHeight - viewportInsets.bottom

  return {
    top: Math.max(0, viewportTop + viewportInsets.top - rect.top),
    right: Math.max(0, rect.right - safeRight),
    bottom: Math.max(0, rect.bottom - safeBottom),
    left: Math.max(0, viewportLeft + viewportInsets.left - rect.left),
  }
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined ? value : fallback
}
