import type { NativeQssPropertyDefinition, NativeUiComponentDefinition } from './types'

export const QUA_UI_LANGUAGE_ID = 'qua-ui'
export const QUA_STYLE_LANGUAGE_ID = 'qua-style'
export const QUA_UI_FILE_EXTENSIONS = ['.qui'] as const
export const QUA_STYLE_FILE_EXTENSIONS = ['.qss'] as const

export const nativeQuiDirectiveNames = [
  'if',
  'else-if',
  'else',
  'for',
  'key',
  'show',
  'slot',
  'class',
  'style',
  'id',
  'action',
] as const

export const nativeQssPseudoStates = [
  'hover',
  'active',
  'focus',
  'focus-visible',
  'disabled',
  'enabled',
  'checked',
  'selected',
  'open',
] as const

export const nativeUiComponents: readonly NativeUiComponentDefinition[] = [
  component('Fragment', 'base', 'Structural grouping node with no draw command.'),
  component('Box', 'base', 'Generic rectangular layout and paint primitive.', ['default']),
  component('Stack', 'base', 'Structural overlay layout group.', ['default']),
  component('Row', 'base', 'Horizontal structural layout group.', ['default']),
  component('Column', 'base', 'Vertical structural layout group.', ['default']),
  component('Grid', 'base', 'Grid structural layout group.', ['default'], ['cell']),
  component('Layer', 'base', 'Structural z-index group with no draw command.', ['default']),
  component('SafeArea', 'base', 'Structural safe-area clip container.', ['default']),
  component('Spacer', 'base', 'Structural spacing node with no draw command.', [], [], 'none'),
  component('Divider', 'base', 'Visual separator for composite components.', [], [], 'none'),
  component('Backdrop', 'base', 'Semantic overlay backdrop surface.', ['default'], ['surface']),
  component('Panel', 'base', 'Semantic panel container surface.', ['header', 'body', 'footer'], ['header', 'body', 'footer']),
  component('Scroll', 'base', 'Scrollable clipped surface projection.', ['default'], ['viewport', 'content', 'thumb']),
  component('Button', 'base', 'Interactive surface that emits declarative action intents.', ['default'], ['label', 'icon']),
  component('Text', 'base', 'Plain text leaf projection.', [], ['content'], 'text'),
  component('RichText', 'base', 'Rich text leaf projection backed by text capability.', [], ['content'], 'text'),
  component('Image', 'base', 'Image leaf projection backed by package assets.', [], ['media'], 'none'),
] as const

export const nativeQssProperties: readonly NativeQssPropertyDefinition[] = [
  property('background-color', 'p0', true, 'Fill color for panels, buttons, and box surfaces.'),
  property('border-color', 'p0', true, 'Border color for rectangular surfaces.'),
  property('border-radius', 'p0', true, 'Corner radius in logical stage pixels.'),
  property('border-width', 'p0', true, 'Border width in logical stage pixels.'),
  property('color', 'p0', true, 'Text foreground color.'),
  property('font-family', 'p0', true, 'Font family name resolved by native font assets.'),
  property('font-size', 'p0', true, 'Font size in logical stage pixels.'),
  property('font-weight', 'p0', true, 'Font weight numeric or keyword value.'),
  property('line-height', 'p0', true, 'Text line height as a number or logical length.'),
  property('text-align', 'p0', true, 'Text alignment for text leaves.'),
  property('object-fit', 'p0', true, 'Image fitting mode for image-like leaves.'),
  property('display', 'p1', false, 'Layout display mode planned for native layout IR.'),
  property('position', 'p1', false, 'Relative or absolute positioning planned for native layout IR.'),
  property('inset', 'p1', false, 'Logical inset shorthand planned for native layout IR.'),
  property('left', 'p1', false, 'Left inset planned for native layout IR.'),
  property('right', 'p1', false, 'Right inset planned for native layout IR.'),
  property('top', 'p1', false, 'Top inset planned for native layout IR.'),
  property('bottom', 'p1', false, 'Bottom inset planned for native layout IR.'),
  property('width', 'p1', false, 'Logical width planned for native layout IR.'),
  property('height', 'p1', false, 'Logical height planned for native layout IR.'),
  property('min-width', 'p1', false, 'Minimum logical width planned for native layout IR.'),
  property('max-width', 'p1', false, 'Maximum logical width planned for native layout IR.'),
  property('min-height', 'p1', false, 'Minimum logical height planned for native layout IR.'),
  property('max-height', 'p1', false, 'Maximum logical height planned for native layout IR.'),
  property('box-sizing', 'p1', false, 'Deterministic box sizing planned for native layout IR.'),
  property('padding', 'p1', false, 'Padding shorthand planned for native layout IR.'),
  property('padding-left', 'p1', false, 'Left padding planned for native layout IR.'),
  property('padding-right', 'p1', false, 'Right padding planned for native layout IR.'),
  property('padding-top', 'p1', false, 'Top padding planned for native layout IR.'),
  property('padding-bottom', 'p1', false, 'Bottom padding planned for native layout IR.'),
  property('margin', 'p1', false, 'Margin shorthand planned for native layout IR.'),
  property('margin-left', 'p1', false, 'Left margin planned for native layout IR.'),
  property('margin-right', 'p1', false, 'Right margin planned for native layout IR.'),
  property('margin-top', 'p1', false, 'Top margin planned for native layout IR.'),
  property('margin-bottom', 'p1', false, 'Bottom margin planned for native layout IR.'),
  property('gap', 'p1', false, 'Layout gap planned for native layout IR.'),
  property('row-gap', 'p1', false, 'Row gap planned for native layout IR.'),
  property('column-gap', 'p1', false, 'Column gap planned for native layout IR.'),
  property('overflow', 'p1', false, 'Overflow mode planned for native layout IR.'),
  property('z-index', 'p1', true, 'Node z ordering emitted as resolved native UI projection metadata.'),
  property('opacity', 'p0', true, 'Surface opacity for native UI surface style IR.'),
  property('background-image', 'p2', false, 'Package asset background image planned for native style IR.'),
  property('background-size', 'p2', false, 'Background image sizing planned for native style IR.'),
  property('background-position', 'p2', false, 'Background image position planned for native style IR.'),
  property('background-repeat', 'p2', false, 'Background image repeat mode planned for native style IR.'),
  property('border-style', 'p2', false, 'Limited border style planned for native style IR.'),
  property('visibility', 'p2', false, 'Visibility projection planned for native style IR.'),
  property('box-shadow', 'p2', false, 'Limited shadow projection planned for native style IR.'),
  property('clip-path', 'p2', false, 'Qua subset clipping planned for native style IR.'),
  property('font-style', 'p2', false, 'Text style planned for native text layout.'),
  property('letter-spacing', 'p2', false, 'Text letter spacing planned for native text layout.'),
  property('white-space', 'p2', false, 'Whitespace handling planned for native text layout.'),
  property('text-overflow', 'p2', false, 'Text overflow metadata planned for native text layout.'),
  property('text-wrap', 'p2', false, 'Text wrapping metadata planned for native text layout.'),
  property('text-decoration', 'p2', false, 'Text decoration planned for native text layout.'),
  property('text-shadow', 'p2', false, 'Limited text shadow planned for native text layout.'),
  property('transform', 'p2', false, '2D transform metadata planned for native style IR.'),
  property('transform-origin', 'p2', false, 'Transform origin metadata planned for native style IR.'),
  property('translate', 'p2', false, 'Transform longhand planned for native style IR.'),
  property('scale', 'p2', false, 'Transform longhand planned for native style IR.'),
  property('rotate', 'p2', false, 'Transform longhand planned for native style IR.'),
] as const

export function findNativeUiComponent(name: string): NativeUiComponentDefinition | undefined {
  return nativeUiComponents.find(component => component.name === name)
}

export function findNativeQssProperty(name: string): NativeQssPropertyDefinition | undefined {
  return nativeQssProperties.find(property => property.name === name)
}

export function nativeWgpuQssFeatureNames(): string[] {
  return nativeQssProperties
    .filter(property => property.nativeWgpu)
    .map(property => property.name)
}

export function nativeWgpuQuiComponentNames(): string[] {
  return nativeUiComponents
    .filter(component => component.kind === 'base')
    .map(component => component.name)
}

function component(
  name: string,
  kind: NativeUiComponentDefinition['kind'],
  description: string,
  slots: readonly string[] = [],
  styleParts: readonly string[] = [],
  content: NativeUiComponentDefinition['content'] = 'children',
): NativeUiComponentDefinition {
  return {
    name,
    kind,
    content,
    description,
    slots,
    styleParts,
    props: nativeQuiDirectiveNames,
  }
}

function property(
  name: string,
  phase: NativeQssPropertyDefinition['phase'],
  nativeWgpu: boolean,
  description: string,
): NativeQssPropertyDefinition {
  return {
    name,
    phase,
    nativeWgpu,
    description,
  }
}
