import type {
  NativeQssPropertyDefinition,
  NativeQssPropertyValueDefinition,
} from './types'

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

const imageFitValues = [
  value('cover', 'Scale the image to cover the paint box while preserving aspect ratio.'),
  value('contain', 'Scale the image to fit inside the paint box while preserving aspect ratio.'),
  value('fill', 'Stretch the image to fill the paint box.'),
  value('none', 'Use the image intrinsic size without scaling.'),
  value('scale-down', 'Use the smaller result of none or contain.'),
] as const

const backgroundPositionValues = [
  value('left', 'Align the background image to the left edge.'),
  value('center', 'Align the background image to the center on the omitted axis.'),
  value('right', 'Align the background image to the right edge.'),
  value('top', 'Align the background image to the top edge.'),
  value('bottom', 'Align the background image to the bottom edge.'),
  value('left top', 'Align the background image to the top-left corner.'),
  value('center top', 'Align the background image to the top center.'),
  value('right top', 'Align the background image to the top-right corner.'),
  value('left bottom', 'Align the background image to the bottom-left corner.'),
  value('center bottom', 'Align the background image to the bottom center.'),
  value('right bottom', 'Align the background image to the bottom-right corner.'),
  value('50% 50%', 'Align the background image by percentage origin.', '$1% $2%'),
] as const

const spacingValues = [
  value('8px', 'Use eight logical pixels of spacing.', '8px'),
  value('12px', 'Use twelve logical pixels of spacing.', '12px'),
  value('16px', 'Use sixteen logical pixels of spacing.', '16px'),
] as const

const alignItemsValues = [
  value('flex-start', 'Align structural children to the cross-axis start edge.'),
  value('center', 'Center structural children on the cross axis.'),
  value('flex-end', 'Align structural children to the cross-axis end edge.'),
] as const

const justifyContentValues = [
  value('flex-start', 'Pack structural children from the main-axis start edge.'),
  value('center', 'Center structural children on the main axis.'),
  value('flex-end', 'Pack structural children toward the main-axis end edge.'),
  value('space-between', 'Distribute remaining main-axis space between children.'),
  value('space-around', 'Distribute remaining main-axis space around children.'),
  value('space-evenly', 'Distribute remaining main-axis space evenly between and around children.'),
] as const

const boxSizingValues = [
  value('border-box', 'Treat QSS width and height as final native surface bounds.'),
  value('content-box', 'Expand QSS width and height by resolved padding and border width before projection.'),
] as const

const pointerEventsValues = [
  value('auto', 'Allow this node to dispatch its resolved native UI intent.'),
  value('none', 'Render this node while omitting its own pointer intent from the resolved projection.'),
] as const

export const nativeQssProperties: readonly NativeQssPropertyDefinition[] = [
  property('align-items', 'p1', true, 'Static Row / Column cross-axis child alignment consumed by native UI projection compilation.', alignItemsValues),
  property('background-color', 'p0', true, 'Fill color for panels, buttons, and box surfaces.'),
  property('border-color', 'p0', true, 'Border color for rectangular surfaces.'),
  property('border-radius', 'p0', true, 'Corner radius in logical stage pixels.'),
  property('border-width', 'p0', true, 'Border width in logical stage pixels.'),
  property('color', 'p0', true, 'Text foreground color.'),
  property('font-family', 'p0', true, 'Font family name resolved by native font assets.'),
  property('font-size', 'p0', true, 'Font size in logical stage pixels.'),
  property('font-weight', 'p0', true, 'Font weight numeric or keyword value.', [
    value('normal', 'Use the normal font weight.'),
    value('bold', 'Use the bold font weight.'),
    value('400', 'Use numeric normal font weight.'),
    value('600', 'Use numeric semibold font weight.'),
    value('700', 'Use numeric bold font weight.'),
  ]),
  property('line-height', 'p0', true, 'Text line height as a number or logical length.'),
  property('text-align', 'p0', true, 'Text alignment for text leaves.', [
    value('left', 'Align text to the left.'),
    value('center', 'Center text horizontally.'),
    value('right', 'Align text to the right.'),
    value('justify', 'Justify text lines.'),
  ]),
  property('object-fit', 'p0', true, 'Image fitting mode for image-like leaves.', imageFitValues),
  property('object-position', 'p1', true, 'Image origin for image-like leaves.', backgroundPositionValues),
  property('display', 'p1', true, 'Native visibility fallback subset; only display: none is currently supported.', [
    value('none', 'Hide the node and its children when no QUI show prop overrides it.'),
  ]),
  property('position', 'p1', true, 'Static native structural layout positioning subset.', [
    value('relative', 'Participate in Row / Column / Grid structural flow.'),
    value('absolute', 'Use resolved bounds relative to the structural parent without advancing flow.'),
  ]),
  property('inset', 'p1', true, 'Static logical inset shorthand used to derive native surface bounds when parent bounds are known.'),
  property('left', 'p1', true, 'Resolved logical x coordinate for static native surface bounds.'),
  property('right', 'p1', true, 'Static right logical inset used to derive x when parent bounds and width are known.'),
  property('top', 'p1', true, 'Resolved logical y coordinate for static native surface bounds.'),
  property('bottom', 'p1', true, 'Static bottom logical inset used to derive y when parent bounds and height are known.'),
  property('width', 'p1', true, 'Resolved non-negative logical width for static native surface bounds.'),
  property('height', 'p1', true, 'Resolved non-negative logical height for static native surface bounds.'),
  property('justify-content', 'p1', true, 'Static Row / Column main-axis child distribution consumed by native UI projection compilation.', justifyContentValues),
  property('min-width', 'p1', true, 'Minimum logical width used to clamp static native surface bounds.'),
  property('max-width', 'p1', true, 'Maximum logical width used to clamp static native surface bounds.'),
  property('min-height', 'p1', true, 'Minimum logical height used to clamp static native surface bounds.'),
  property('max-height', 'p1', true, 'Maximum logical height used to clamp static native surface bounds.'),
  property('box-sizing', 'p1', true, 'Deterministic QSS fallback bounds sizing consumed by native UI projection compilation.', boxSizingValues),
  property('padding', 'p1', true, 'Padding shorthand emitted as native edge inset style IR.'),
  property('padding-left', 'p1', true, 'Left padding emitted as native edge inset style IR.'),
  property('padding-right', 'p1', true, 'Right padding emitted as native edge inset style IR.'),
  property('padding-top', 'p1', true, 'Top padding emitted as native edge inset style IR.'),
  property('padding-bottom', 'p1', true, 'Bottom padding emitted as native edge inset style IR.'),
  property('margin', 'p1', true, 'Static Row / Column / Grid child outer spacing consumed by native UI projection compilation.', spacingValues),
  property('margin-left', 'p1', true, 'Static left outer spacing consumed by native UI projection compilation.', spacingValues),
  property('margin-right', 'p1', true, 'Static right outer spacing consumed by native UI projection compilation.', spacingValues),
  property('margin-top', 'p1', true, 'Static top outer spacing consumed by native UI projection compilation.', spacingValues),
  property('margin-bottom', 'p1', true, 'Static bottom outer spacing consumed by native UI projection compilation.', spacingValues),
  property('gap', 'p1', true, 'Static Row / Column / Grid child spacing consumed by native UI projection compilation.', spacingValues),
  property('row-gap', 'p1', true, 'Static vertical child spacing consumed by native UI projection compilation.', spacingValues),
  property('column-gap', 'p1', true, 'Static horizontal child spacing consumed by native UI projection compilation.', spacingValues),
  property('overflow', 'p1', true, 'Child clipping mode emitted as resolved native UI projection metadata.', [
    value('visible', 'Allow child nodes to paint outside this node bounds.'),
    value('hidden', 'Clip child nodes to this node bounds.'),
  ]),
  property('pointer-events', 'p1', true, 'Node-local pointer hit-test participation compiled into native UI intent projection.', pointerEventsValues),
  property('z-index', 'p1', true, 'Node z ordering emitted as resolved native UI projection metadata.'),
  property('opacity', 'p0', true, 'Surface opacity for native UI surface style IR.', [
    value('0', 'Make the surface fully transparent.'),
    value('0.5', 'Make the surface half transparent.'),
    value('1', 'Make the surface fully opaque.'),
  ]),
  property('background-image', 'p1', true, 'Package asset background image for panel-like native surfaces via asset("...").', [
    value('asset("...")', 'Reference a package-relative native asset.', 'asset("$1")'),
    value('asset("...", "images")', 'Reference a package-relative native image asset.', 'asset("$1", "images")'),
  ]),
  property('background-size', 'p1', true, 'Background image fitting mode for native surface image backgrounds.', imageFitValues),
  property('background-position', 'p1', true, 'Background image origin for native surface image backgrounds.', backgroundPositionValues),
  property('background-repeat', 'p2', false, 'Background image repeat mode planned for native style IR.'),
  property('border-style', 'p1', true, 'Limited native border style subset for rectangular surfaces.', [
    value('solid', 'Render the border using border-width and border-color.'),
    value('none', 'Suppress the border regardless of border-width and border-color.'),
  ]),
  property('visibility', 'p1', true, 'Node visibility emitted as resolved native UI projection metadata.', [
    value('visible', 'Render the node when no QUI show prop overrides it.'),
    value('hidden', 'Skip the node and its children when no QUI show prop overrides it.'),
  ]),
  property('box-shadow', 'p1', true, 'One outer panel/button shadow projected through native style IR.', [
    value('0 18px 48px rgba(0,0,0,0.32)', 'Render one offset outer shadow.'),
    value('none', 'Disable the shadow.'),
  ]),
  property('clip-path', 'p2', false, 'Qua subset clipping planned for native style IR.'),
  property('font-style', 'p1', true, 'Text style for native text and button label draw params.', [
    value('normal', 'Use an upright font face.'),
    value('italic', 'Use an italic font face when available.'),
  ]),
  property('letter-spacing', 'p1', true, 'Text letter spacing for native text and button label draw params.', [
    value('normal', 'Use the default letter spacing.'),
    value('0', 'Use default spacing as an explicit logical value.'),
    value('1px', 'Add one logical pixel between letters.'),
  ]),
  property('white-space', 'p1', true, 'Whitespace and wrapping policy for native text and button label draw params.', [
    value('normal', 'Collapse whitespace and allow wrapping.'),
    value('nowrap', 'Collapse whitespace and disable wrapping.'),
    value('pre', 'Preserve whitespace and disable wrapping.'),
    value('pre-line', 'Preserve line breaks while collapsing other whitespace.'),
    value('pre-wrap', 'Preserve whitespace and allow wrapping.'),
  ]),
  property('text-overflow', 'p1', true, 'Text overflow clipping policy for native text and button label draw params.', [
    value('clip', 'Clip overflowing text at the text box edge.'),
    value('ellipsis', 'Use an ellipsis marker when overflowing text is clipped.'),
  ]),
  property('text-transform', 'p1', true, 'Text casing policy for native text and button label draw params.', [
    value('none', 'Render text without casing transformation.'),
    value('uppercase', 'Transform text to uppercase before text backend layout.'),
    value('lowercase', 'Transform text to lowercase before text backend layout.'),
    value('capitalize', 'Capitalize words before text backend layout.'),
  ]),
  property('text-wrap', 'p2', false, 'Text wrapping metadata planned for native text layout.'),
  property('text-decoration', 'p1', true, 'Text decoration for native text and button label draw params.', [
    value('none', 'Render text without decoration.'),
    value('underline', 'Render text with an underline.'),
    value('line-through', 'Render text with a strike-through line.'),
  ]),
  property('text-shadow', 'p1', true, 'One offset text shadow projected through native style IR.', [
    value('0 2px 10px rgba(0,0,0,0.72)', 'Render one offset text shadow.'),
    value('none', 'Disable the text shadow.'),
  ]),
  property('transform', 'p2', false, '2D transform metadata planned for native style IR.'),
  property('transform-origin', 'p2', false, 'Transform origin metadata planned for native style IR.'),
  property('translate', 'p2', false, 'Transform longhand planned for native style IR.'),
  property('scale', 'p2', false, 'Transform longhand planned for native style IR.'),
  property('rotate', 'p2', false, 'Transform longhand planned for native style IR.'),
] as const

function property(
  name: string,
  phase: NativeQssPropertyDefinition['phase'],
  nativeWgpu: boolean,
  description: string,
  values?: readonly NativeQssPropertyValueDefinition[],
): NativeQssPropertyDefinition {
  return {
    name,
    phase,
    nativeWgpu,
    description,
    values,
  }
}

function value(
  label: string,
  description: string,
  insertText?: string,
): NativeQssPropertyValueDefinition {
  return {
    label,
    description,
    insertText,
  }
}
