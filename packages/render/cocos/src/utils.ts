import type { AssetType, LoadAssetOptions } from '@quajs/assets'
import type { CocosHostNode, CocosHostTransform } from '@quajs/cocos-host'
import type {
  CharacterPosition,
  RichTextContent,
  ViewChoiceProjection,
} from '@quajs/render-core'
import type { CocosRendererHostContext } from './types'
import { isRichTextDocument } from '@quajs/render-core'

export type CocosAssetTargetPackageId = string | readonly string[]

export function runtimePackageCandidatesFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): readonly string[] | undefined {
  if (!metadata)
    return undefined

  const candidates = new Set<string>()
  const requiredRuntimePackages = Array.isArray(metadata.requiredRuntimePackages)
    ? metadata.requiredRuntimePackages.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
  for (const packageId of [...requiredRuntimePackages].reverse()) {
    candidates.add(packageId)
  }
  addRuntimePackageCandidate(candidates, metadata.contentPackageId)
  addRuntimePackageCandidate(candidates, metadata.runtimePackageId)
  addRuntimePackageCandidate(candidates, metadata.packageId)
  return candidates.size > 0 ? [...candidates] : undefined
}

export function runtimePackageCandidatesFromAssetRef(
  asset: Readonly<Record<string, unknown>> | undefined,
): readonly string[] | undefined {
  if (!asset)
    return undefined
  return runtimePackageCandidatesFromMetadata({
    ...(isRecord(asset.metadata) ? asset.metadata : {}),
    ...(typeof asset.runtimePackageId === 'string' ? { contentPackageId: asset.runtimePackageId } : {}),
    ...(typeof asset.contentPackageId === 'string' ? { contentPackageId: asset.contentPackageId } : {}),
  })
}

export async function getJSONWithTargetPackages<T>(
  context: CocosRendererHostContext,
  type: AssetType,
  name: string,
  targetPackageId?: CocosAssetTargetPackageId,
  options: Omit<LoadAssetOptions, 'targetPackageId'> = {},
): Promise<T | undefined> {
  if (!context.assets)
    return undefined

  const candidates = normalizeTargetPackageIds(targetPackageId)
  if (candidates.length === 0) {
    return await context.assets.getJSON<T>(type, name, options)
  }

  let lastNotFound: unknown
  for (const candidate of candidates) {
    try {
      return await context.assets.getJSON<T>(type, name, { ...options, targetPackageId: candidate })
    }
    catch (error) {
      if (!isAssetNotFoundError(error))
        throw error
      lastNotFound = error
    }
  }

  if (lastNotFound)
    throw lastNotFound
  return undefined
}

export async function resolveAssetWithTargetPackages(
  context: CocosRendererHostContext,
  type: AssetType,
  name: string | undefined,
  targetPackageId?: CocosAssetTargetPackageId,
): Promise<Awaited<ReturnType<CocosRendererHostContext['resolveAsset']>>> {
  if (!name)
    return undefined

  const candidates = normalizeTargetPackageIds(targetPackageId)
  if (candidates.length === 0) {
    return await context.resolveAsset(type, name)
  }

  let lastNotFound: unknown
  for (const candidate of candidates) {
    try {
      const resource = await context.resolveAsset(type, name, { targetPackageId: candidate })
      if (resource)
        return resource
    }
    catch (error) {
      if (!isAssetNotFoundError(error))
        throw error
      lastNotFound = error
    }
  }

  if (lastNotFound)
    throw lastNotFound
  return undefined
}

export function normalizeBackgroundAssetType(type: string | undefined): AssetType {
  if (type === 'video')
    return 'video'
  if (type === 'characters')
    return 'characters'
  return 'images'
}

export function choiceText(choice: Readonly<ViewChoiceProjection>): string {
  return richTextToPlainText(choice.text)
}

export function richTextToPlainText(content: RichTextContent): string {
  if (!isRichTextDocument(content))
    return content
  return content.blocks
    .map(block => block.spans.map(span => span.text).join(''))
    .join('\n')
}

export function positionTransform(position: CharacterPosition | undefined): CocosHostTransform {
  return {
    x: position?.x,
    y: position?.y,
    scaleX: position?.scale,
    scaleY: position?.scale,
    rotation: position?.rotation,
    anchorX: position?.anchor === 'left' ? 0 : position?.anchor === 'right' ? 1 : 0.5,
    anchorY: 0,
  }
}

export function nodeKey(node: CocosHostNode): string {
  return node.id
}

function normalizeTargetPackageIds(targetPackageId: CocosAssetTargetPackageId | undefined): string[] {
  if (typeof targetPackageId === 'string') {
    return targetPackageId.length > 0 ? [targetPackageId] : []
  }
  if (!targetPackageId) {
    return []
  }
  return [...new Set(targetPackageId.filter(packageId => packageId.length > 0))]
}

function addRuntimePackageCandidate(candidates: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.length > 0) {
    candidates.add(value)
  }
}

function isAssetNotFoundError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'ASSET_NOT_FOUND',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
