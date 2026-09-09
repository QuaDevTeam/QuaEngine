import { describe, expect, it } from 'vitest'
import { characterLightingSvg, createCharacterLightingId, createCharacterLightingSvgElement } from '../src/plugins/character'

describe('authored character lighting', () => {
  it('allocates no filter for absent or identity materials', () => {
    expect(characterLightingSvg('a', undefined)).toBeUndefined()
    expect(characterLightingSvg('a', { ambient: [1, 1, 1] })).toBeUndefined()
    expect(characterLightingSvg('a', { shade: { color: [1, 1, 1], from: [0, 0], to: [1, 1] } })).toBeUndefined()
  })

  it('bounds malformed input and restores source alpha once after directional shading', () => {
    const id = createCharacterLightingId()
    const node = characterLightingSvg(id, {
      ambient: [Number.NaN, -2, 8],
      shade: { color: [0.8, 0.9, 1], from: [-10, Number.NaN], to: [10, 1] },
    })!
    const svg = createCharacterLightingSvgElement(document, node)
    expect(svg.querySelector('filter')?.getAttribute('id')).toBe(id)
    expect(svg.querySelector('feColorMatrix')?.getAttribute('values')).toBe('1 0 0 0 0  0 0 0 0 0  0 0 1.5 0 0  0 0 0 0 1')
    expect(svg.querySelectorAll('feComposite')).toHaveLength(1)
    expect(svg.querySelector('feComposite')?.getAttribute('in2')).toBe('SourceAlpha')
    expect(svg.querySelector('filter')?.getAttribute('width')).toBe('100%')
    const gradient = decodeURIComponent(svg.querySelector('feImage')!.getAttribute('href')!.split(',').slice(1).join(','))
    expect(gradient).toContain('x1="0" y1="0" x2="1" y2="1"')
    expect(gradient).not.toContain('NaN')
    expect(createCharacterLightingId()).not.toBe(id)
  })

  it('uses only a color matrix for ambient grading, preserving alpha and source data', () => {
    const light = { ambient: [0.9, 0.95, 1] as const }
    const before = JSON.stringify(light)
    const svg = createCharacterLightingSvgElement(document, characterLightingSvg('ambient', light)!)
    expect(svg.querySelector('feImage')).toBeNull()
    expect(svg.querySelector('feColorMatrix')?.getAttribute('values')).toMatch(/0 0 0 1 0$/)
    expect(JSON.stringify(light)).toBe(before)
  })
})
