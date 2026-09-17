import { describe, expect, it } from 'vitest'
import { clientPointToStageLogical, createViewLayoutProjection, resolveStageLayout, stageLogicalToClientPoint } from '../src'

describe('platform-neutral stage layout', () => {
  it.each([
    ['landscape', 360, 780, 1920, 1080, 0, 288.75],
    ['landscape', 2560, 1080, 1920, 1080, 320, 0],
    ['portrait', 360, 780, 1080, 2340, 0, 0],
    ['portrait', 1920, 1080, 1080, 2340, (1920 - 1080 * 1080 / 2340) / 2, 0],
  ] as const)('keeps %s authored coordinates in a %s x %s container', (preset, width, height, logicalWidth, logicalHeight, x, y) => {
    const layout = resolveStageLayout(createViewLayoutProjection(preset), { width, height, devicePixelRatio: 3 })
    expect(layout.logicalWidth).toBe(logicalWidth)
    expect(layout.logicalHeight).toBe(logicalHeight)
    expect(layout.viewportX).toBeCloseTo(x)
    expect(layout.viewportY).toBeCloseTo(y)
    const point = { x: logicalWidth * 0.25, y: logicalHeight * 0.75 }
    const client = stageLogicalToClientPoint(layout, point, { left: 30, top: 40 })
    const roundTrip = clientPointToStageLogical(layout, client, { left: 30, top: 40 })
    expect(roundTrip.x).toBeCloseTo(point.x)
    expect(roundTrip.y).toBeCloseTo(point.y)
    expect(roundTrip.insideStage).toBe(true)
  })
})
