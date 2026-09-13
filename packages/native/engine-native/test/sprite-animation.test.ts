import { describe, expect, it } from 'vitest'
import { createNativeRendererJsonFrameInput } from '../src'

describe('native sprite timeline sampling', () => {
  const character = { id: 'mira:one', name: 'Mira', sprite: 'mira/base.png', expression: 'smile', metadata: { contentPackageId: 'runtime.faces' } }
  const track = (target: string, property: string, value: unknown) => ({ target: `spriteLayer:mira:one:${target}`, property, keyframes: [{ at: 0, value }] })
  it('samples unresolved sprite layers and preserves scoped asset identity', () => {
    const frame = createNativeRendererJsonFrameInput({ characters: [character], animations: [{ id: 'layer-motion', state: 'paused', startedAt: 1000, pausedAt: 1500, duration: 1000, resolvedTracks: [
      track('1', 'opacity', 0.3), track('expression', 'opacity', 0.2), track('expression:1', 'opacity', 0.1),
      { target: 'spriteLayer:mira:one:base', property: 'offsetX', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 100, easing: 'ease-in' }] },
    ] }] }, { now: 9999 })
    expect(frame.view.characters).toMatchObject([{ sprite: 'mira/base.png', expression: 'smile', provenance: { contentPackageId: 'runtime.faces' }, spriteLayerAnimationValues: [
      { target: 'spriteLayer:mira:one:1', value: 0.3 }, { target: 'spriteLayer:mira:one:expression', value: 0.2 },
      { target: 'spriteLayer:mira:one:expression:1', value: 0.1 }, { target: 'spriteLayer:mira:one:base', value: 25 },
    ] }])
    expect(character.metadata).toEqual({ contentPackageId: 'runtime.faces' })
  })
  it('leaves live timing to Rust and excludes resource mutation tracks', () => {
    const view = { characters: [character, { id: 'mira', name: 'Other', sprite: 'other.png' }], animations: [{ id: 'layer-motion', startedAt: 0, duration: 1000, resolvedTracks: [track('base', 'asset', 'other.png'), track('base', 'mask', '../mask.png'), track('base', 'scale', -1)] }] }
    const frozen = createNativeRendererJsonFrameInput(view, { now: 500 })
    expect((frozen.view.characters as Record<string, unknown>[])[0]).toMatchObject({ spriteLayerAnimationValues: [{ property: 'scale', value: -1 }] })
    expect((frozen.view.characters as Record<string, unknown>[])[1].spriteLayerAnimationValues).toBeUndefined()
    const live = createNativeRendererJsonFrameInput(view, { projectAnimations: false })
    expect((live.view.characters as Record<string, unknown>[])[0].spriteLayerAnimationValues).toBeUndefined()
  })
})
