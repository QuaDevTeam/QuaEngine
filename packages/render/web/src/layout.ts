import type { ViewLayoutProjection } from '@quajs/render-core'
import { createViewLayoutProjection } from '@quajs/render-core'

export interface StageContainerSize {
  width: number
  height: number
}

export interface StageSafeArea {
  x: number
  y: number
  width: number
  height: number
}

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
  aspectRatio: number
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
  const aspectRatio = clamp(containerWidth / containerHeight, layout.minAspectRatio, layout.maxAspectRatio)
  const viewport = fitAspectRatio(containerWidth, containerHeight, aspectRatio)
  const scale = viewport.height / layout.height
  const logicalWidth = viewport.width / scale
  const logicalHeight = layout.height
  const safeWidth = Math.min(logicalWidth, layout.height * layout.minAspectRatio)
  const safeArea: StageSafeArea = {
    x: (logicalWidth - safeWidth) / 2,
    y: 0,
    width: safeWidth,
    height: logicalHeight,
  }

  return {
    layout,
    containerWidth,
    containerHeight,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    viewportX: (containerWidth - viewport.width) / 2,
    viewportY: (containerHeight - viewport.height) / 2,
    logicalWidth,
    logicalHeight,
    scale,
    aspectRatio,
    safeArea,
  }
}

export function stageViewportStyle(layout: ResolvedStageLayout): Record<string, string> {
  return {
    position: 'absolute',
    overflow: 'hidden',
    width: `${layout.viewportWidth}px`,
    height: `${layout.viewportHeight}px`,
    left: `${layout.viewportX}px`,
    top: `${layout.viewportY}px`,
  }
}

export function stageContentStyle(layout: ResolvedStageLayout): Record<string, string | number> {
  return {
    'position': 'relative',
    'overflow': 'hidden',
    'width': `${layout.logicalWidth}px`,
    'height': `${layout.logicalHeight}px`,
    'transform': `scale(${layout.scale})`,
    'transform-origin': 'top left',
    '--qua-layout-width': layout.logicalWidth,
    '--qua-layout-height': layout.logicalHeight,
    '--qua-layout-scale': layout.scale,
    '--qua-layout-aspect-ratio': layout.aspectRatio,
    '--qua-layout-safe-x': layout.safeArea.x,
    '--qua-layout-safe-y': layout.safeArea.y,
    '--qua-layout-safe-width': layout.safeArea.width,
    '--qua-layout-safe-height': layout.safeArea.height,
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
  return Math.min(max, Math.max(min, value))
}
