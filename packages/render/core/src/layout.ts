import type { ViewLayoutProjection } from './index'
import { createViewLayoutProjection } from './index'

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

function nonNegativeNumber(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0
}

