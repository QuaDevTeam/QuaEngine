import type { NativeUiComponentDefinition } from './types'
import { nativeQuiDirectiveNames } from './registry-directives'

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
