import { describe, expect, it } from 'vitest'
import { createMenuActionPresentation, createSaveSlotGrid, isFilledSaveSlot, saveSlotDisplayName, saveSlotMeta } from '../src/ui-presentation'

describe('shared UI presentation', () => {
  it('keeps menu actions ordered while respecting optional features and product labels', () => {
    expect(createMenuActionPresentation().map(action => action.id)).toEqual(['continue', 'save', 'load', 'settings', 'backlog', 'title'])
    expect(createMenuActionPresentation({ showBacklog: false, titleActionLabel: 'Return' }).at(-1)).toEqual({ id: 'title', label: 'Return' })
    expect(createMenuActionPresentation({ showBacklog: false, showTitle: false }).map(action => action.id)).toEqual(['continue', 'save', 'load', 'settings'])
  })

  it('fills grid holes without mutating or discarding slot metadata and package provenance', () => {
    const slot = Object.freeze({ slotId: 'slot-2', timestamp: 0, metadata: Object.freeze({ sceneName: 'chapter-one', requiredRuntimePackages: ['story-a'] }) })
    const grid = createSaveSlotGrid({ slotCount: 3 }, Object.freeze([slot]))
    expect(grid.map(item => item.slotId)).toEqual(['slot-1', 'slot-2', 'slot-3'])
    expect(grid[1]).toBe(slot)
    expect(isFilledSaveSlot(slot)).toBe(true)
    expect(saveSlotMeta(slot)).toBe('1970-01-01 00:00 UTC')
    expect(saveSlotDisplayName(slot, 1)).toBe('Chapter One')
  })

  it('handles invalid counts and gives explicit configured slots precedence', () => {
    expect(createSaveSlotGrid({ slotCount: Infinity })).toHaveLength(12)
    expect(createSaveSlotGrid({ slotCount: 0 })).toEqual([])
    expect(createSaveSlotGrid({ slotCount: -1 })).toEqual([])
    expect(createSaveSlotGrid({ slotCount: 2.9 })).toHaveLength(2)
    const configured = { slotId: 'custom', name: 'Configured' }
    expect(createSaveSlotGrid({ slots: [configured], slotCount: 1 }, [{ slotId: 'custom', name: 'Listed' }])).toEqual([configured])
  })

  it('formats empty, invalid timestamp and internal metadata consistently across hosts', () => {
    expect(saveSlotDisplayName({ slotId: 'slot-1' }, 0)).toBe('Empty Slot 01')
    expect(saveSlotMeta({ slotId: 'slot-1' })).toBe('No save data')
    const slot = { slotId: 'slot-1', name: 'autosave', timestamp: 'invalid', metadata: { sceneName: '@quajs/engine/ui-overlay-host', playtime: 3_660_000 } }
    expect(saveSlotDisplayName(slot, 0)).toBe('Save 01')
    expect(saveSlotMeta(slot)).toBe('1h 1m')
  })
})
