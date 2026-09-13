import type { CharacterLightingProjection } from '@quajs/render-core'

/** Framework adapters only translate this small, resource-free SVG tree. */
export interface CharacterLightingSvgNode {
  tag: string
  attrs: Record<string, string | number>
  children?: CharacterLightingSvgNode[]
}

let nextFilterId = 0

export function createCharacterLightingId(): string {
  return `qua-character-light-${++nextFilterId}`
}

function bounded(value: unknown, fallback: number, max = 1): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback
}

/** No texture reads, DOM sampling, animation loop or cache of scene decisions. */
export function characterLightingSvg(
  id: string,
  lighting: Readonly<CharacterLightingProjection> | undefined,
): CharacterLightingSvgNode | undefined {
  if (!lighting) return undefined
  const ambient = [0, 1, 2].map(i => bounded(lighting.ambient?.[i], 1, 1.5))
  const shade = lighting.shade
  const color = [0, 1, 2].map(i => bounded(shade?.color?.[i], 1))
  const hasShade = !!shade && color.some(c => c !== 1)
  if (!hasShade && ambient.every(c => c === 1)) return undefined

  const nodes: CharacterLightingSvgNode[] = [{
    tag: 'feColorMatrix',
    attrs: {
      in: 'SourceGraphic', type: 'matrix', result: 'tone',
      // SVG color matrices operate on unpremultiplied channels. Make the
      // intermediate opaque only for multiplication, then restore source alpha
      // exactly once. Multiplying two alpha-masked layers would darken edges.
      values: `${ambient[0]} 0 0 0 0  0 ${ambient[1]} 0 0 0  0 0 ${ambient[2]} 0 0  0 0 0 ${hasShade ? '0 1' : '1 0'}`,
    },
  }]
  if (hasShade) {
    const from = [bounded(shade.from?.[0], 0), bounded(shade.from?.[1], 0)]
    const to = [bounded(shade.to?.[0], 1), bounded(shade.to?.[1], 1)]
    const rgb = color.map(c => Math.round(c * 255)).join(',')
    // Inline procedural SVG, not a downloaded/raster asset or object URL.
    // Only bounded numbers enter this data URI; no user markup/URLs are accepted.
    const gradient = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 1 1" preserveAspectRatio="none"><defs><linearGradient id="g" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}"><stop stop-color="white"/><stop offset="1" stop-color="rgb(${rgb})"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1v1H0z"/></svg>`
    nodes.push(
      { tag: 'feImage', attrs: { href: `data:image/svg+xml,${encodeURIComponent(gradient)}`, x: '0%', y: '0%', width: '100%', height: '100%', preserveAspectRatio: 'none', result: 'shade' } },
      { tag: 'feBlend', attrs: { in: 'tone', in2: 'shade', mode: 'multiply', result: 'graded' } },
      { tag: 'feComposite', attrs: { in: 'graded', in2: 'SourceAlpha', operator: 'in' } },
    )
  }
  return {
    tag: 'svg',
    attrs: { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false', style: 'position:absolute;pointer-events:none;overflow:hidden' },
    children: [{ tag: 'defs', attrs: {}, children: [{
      tag: 'filter',
      attrs: { id, x: '0%', y: '0%', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' },
      children: nodes,
    }] }],
  }
}

export function createCharacterLightingSvgElement(document: Document, node: CharacterLightingSvgNode): SVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', node.tag)
  for (const [key, value] of Object.entries(node.attrs)) element.setAttribute(key, String(value))
  for (const child of node.children || []) element.append(createCharacterLightingSvgElement(document, child))
  return element
}
