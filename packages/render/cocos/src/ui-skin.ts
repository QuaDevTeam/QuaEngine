import type { CocosHostNode, CocosHostSpriteStateOptions } from '@quajs/cocos-host'
import type {
  SpriteSkinManifest,
  SpriteSkinStateName,
  UiSkinControlKind,
} from '@quajs/render-core'
import type { CocosRendererHostContext } from './types'
import {
  getUiSkinProjection,
  resolveSpriteSkin,
  resolveSpriteSkinReference,
  resolveUiControlSkinReference,
  resolveUiSkinState,
} from '@quajs/render-core'
import {
  getJSONWithTargetPackages,
  resolveAssetWithTargetPackages,
  runtimePackageCandidatesFromMetadata,
} from './utils'

const UI_SKIN_STATES: readonly SpriteSkinStateName[] = ['default', 'hover', 'pressed', 'disabled', 'selected']

export interface CocosUiControlSkinOptions {
  layerId: string
  resourceKey: string
  kind: UiSkinControlKind
  skinId?: string
  state?: SpriteSkinStateName
  disabled?: boolean
  selected?: boolean
}

export async function applyCocosUiControlSkin(
  context: CocosRendererHostContext,
  node: CocosHostNode,
  options: CocosUiControlSkinOptions,
): Promise<void> {
  const reference = resolveUiControlSkinReference(context.getViewState(), options.kind, options.skinId)
  if (!reference)
    return

  const details = resolveSpriteSkinReference(reference)
  if (!details)
    return

  const manifest = await getJSONWithTargetPackages<SpriteSkinManifest>(
    context,
    'data',
    details.manifestPath,
    runtimePackageCandidatesFromMetadata(getUiSkinProjection(context.getViewState()) as Readonly<Record<string, unknown>> | undefined),
  )
  const state = resolveUiSkinState({
    state: options.state,
    disabled: options.disabled,
    selected: options.selected,
  })
  const projection = resolveSpriteSkin(manifest, reference, state)
  if (!projection)
    return

  const states = await resolveCocosUiSkinStates(context, manifest, reference, options.layerId, options.resourceKey)
  const resource = await resolveAssetWithTargetPackages(
    context,
    'images',
    projection.active.asset,
    runtimePackageCandidatesFromMetadata(projection.manifest?.metadata),
  )
  context.host.nodes.setNodeSprite(node, resource, {
    mode: projection.definition.mode === 'tiled' ? 'tiled' : 'sliced',
    slice: projection.definition.slice,
    fill: projection.definition.fill,
    contentInsets: projection.definition.contentInsets,
    tint: projection.active.tint,
    opacity: projection.active.opacity,
    states,
    metadata: projection.definition.metadata ? { ...projection.definition.metadata } : undefined,
  })
  if (projection.active.tint)
    context.host.nodes.setNodeColor?.(node, projection.active.tint)
  if (resource)
    context.setLayerResource(options.layerId, options.resourceKey, resource)

  const currentMetadata = context.host.nodes.getNodeMetadata?.(node) || {}
  context.host.nodes.setNodeMetadata?.(node, {
    ...currentMetadata,
    skinKind: options.kind,
    skinReference: reference,
    skinFamily: projection.family,
    skinId: projection.skin,
    skinState: state,
    skinFallbackUsed: projection.fallbackUsed,
  })
}

async function resolveCocosUiSkinStates(
  context: CocosRendererHostContext,
  manifest: SpriteSkinManifest | undefined,
  reference: string,
  layerId: string,
  resourceKey: string,
) {
  const states: Record<string, CocosHostSpriteStateOptions> = {}
  for (const state of UI_SKIN_STATES) {
    const projection = resolveSpriteSkin(manifest, reference, state)
    if (!projection)
      continue
    const resource = await resolveAssetWithTargetPackages(
      context,
      'images',
      projection.active.asset,
      runtimePackageCandidatesFromMetadata(projection.manifest?.metadata),
    )
    if (resource) {
      context.setLayerResource(layerId, `${resourceKey}:state:${state}`, resource)
    }
    states[state] = {
      resource,
      resourceId: resource?.id,
      tint: projection.active.tint,
      opacity: projection.active.opacity,
      metadata: projection.definition.metadata ? { ...projection.definition.metadata } : undefined,
    }
  }
  return states
}

export { runtimePackageCandidatesFromMetadata } from './utils'
