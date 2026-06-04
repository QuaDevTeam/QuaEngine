import type { AssetType } from '@quajs/assets'
import type { CocosHostNode, CocosHostResource } from '@quajs/cocos-host'
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

  const manifest = await getJSONWithTargetPackageCandidates<SpriteSkinManifest>(
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

  const resource = await resolveAssetWithTargetPackageCandidates(
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

async function getJSONWithTargetPackageCandidates<T>(
  context: CocosRendererHostContext,
  type: AssetType,
  name: string,
  targetPackageIds: readonly string[],
): Promise<T | undefined> {
  if (!context.assets)
    return undefined
  const candidates = [undefined, ...targetPackageIds] as Array<string | undefined>
  for (const targetPackageId of candidates) {
    try {
      return await context.assets.getJSON<T>(type, name, targetPackageId ? { targetPackageId } : undefined)
    }
    catch {}
  }
  return undefined
}

async function resolveAssetWithTargetPackageCandidates(
  context: CocosRendererHostContext,
  type: AssetType,
  name: string,
  targetPackageIds: readonly string[],
): Promise<CocosHostResource | undefined> {
  const candidates = [undefined, ...targetPackageIds] as Array<string | undefined>
  for (const targetPackageId of candidates) {
    try {
      const resource = await context.resolveAsset(type, name, targetPackageId ? { targetPackageId } : undefined)
      if (resource)
        return resource
    }
    catch {}
  }
  return undefined
}

export function runtimePackageCandidatesFromMetadata(metadata: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  if (!metadata)
    return []
  const candidates = new Set<string>()
  addCandidate(candidates, metadata.contentPackageId)
  addCandidate(candidates, metadata.runtimePackageId)
  addCandidate(candidates, metadata.packageId)
  const required = metadata.requiredRuntimePackages
  if (Array.isArray(required)) {
    for (const packageId of required)
      addCandidate(candidates, packageId)
  }
  return [...candidates]
}

function addCandidate(candidates: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.length > 0)
    candidates.add(value)
}
