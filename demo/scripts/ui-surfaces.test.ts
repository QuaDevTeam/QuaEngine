import type { NativeUiSurfaceNodeProjection as Node } from '@quajs/native-ui-compiler'
import { createBacklogUiSurfaceFeature } from '@quajs/plugin-backlog/surface'
import { describe, expect, it } from 'vitest'
import { withDemoFeatureSkin } from '../src/game/ui/feature-skin'

describe('shared demo skin', () => {
  it('preserves readable native button paint in hover and focus states', () => {
    const result = withDemoFeatureSkin(createBacklogUiSurfaceFeature()).createOverlays({
      view: {},
      projection: { visible: true, entries: [] },
      logicalWidth: 1920,
      logicalHeight: 1080,
      safeArea: { x: 0, y: 0, width: 1920, height: 1080 },
    }) as { surface: { root: Node } }
    const nodes: Node[] = []
    const visit = (node: Node) => {
      nodes.push(node)
      node.children?.forEach(visit)
    }
    visit(result.surface.root)
    const earliest = nodes.find(node => node.id === 'backlog-earliest')!
    expect(earliest.intent?.metadata?.edge).toBe('start')
    for (const state of Object.values(earliest.stateStyles!)) {
      expect(state.style?.color).toBe(earliest.style?.color)
      expect(state.style?.fontSize).toBe(earliest.style?.fontSize)
      expect(state.style?.fontFamily).toEqual(earliest.style?.fontFamily)
      expect(state.bounds).toEqual(earliest.bounds)
    }
  })
})
