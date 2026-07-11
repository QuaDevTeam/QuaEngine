import type {
  NativeQssResolvedStyle,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceProjection,
} from './types'
import { isSafeNativeAssetType, isSafePackageAssetName } from './assets'
import { findNativeUiComponent } from './registry'

export interface NativeUiSurfaceProjectionRequirements {
  assetKinds: string[]
  intentEvents: string[]
  projectionFields: string[]
  qssFeatures: string[]
  quiComponents: string[]
}

const QSS_FEATURE_BY_STYLE_FIELD: Record<keyof NativeQssResolvedStyle, string> = {
  backgroundColor: 'background-color',
  backgroundImage: 'background-image',
  backgroundPosition: 'background-position',
  backgroundSize: 'background-size',
  borderColor: 'border-color',
  borderRadius: 'border-radius',
  borderStyle: 'border-style',
  borderWidth: 'border-width',
  boxShadow: 'box-shadow',
  color: 'color',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontStyle: 'font-style',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
  lineHeight: 'line-height',
  objectFit: 'object-fit',
  objectPosition: 'object-position',
  opacity: 'opacity',
  padding: 'padding',
  textAlign: 'text-align',
  textDecoration: 'text-decoration',
  textOverflow: 'text-overflow',
  textTransform: 'text-transform',
  textShadow: 'text-shadow',
  whiteSpace: 'white-space',
}

export function collectNativeUiSurfaceProjectionRequirements(
  projection: NativeUiSurfaceProjection,
): NativeUiSurfaceProjectionRequirements {
  const requirements = createRequirementSets()
  collectNativeUiSurfaceNodeRequirements(projection.root, requirements)
  return {
    assetKinds: sortedStrings(requirements.assetKinds),
    intentEvents: sortedStrings(requirements.intentEvents),
    projectionFields: sortedStrings(requirements.projectionFields),
    qssFeatures: sortedStrings(requirements.qssFeatures),
    quiComponents: sortedStrings(requirements.quiComponents),
  }
}

interface NativeUiSurfaceProjectionRequirementSets {
  assetKinds: Set<string>
  intentEvents: Set<string>
  projectionFields: Set<string>
  qssFeatures: Set<string>
  quiComponents: Set<string>
}

function collectNativeUiSurfaceNodeRequirements(
  node: NativeUiSurfaceNodeProjection | undefined,
  requirements: NativeUiSurfaceProjectionRequirementSets,
): void {
  if (!node)
    return

  if (findNativeUiComponent(node.kind))
    requirements.quiComponents.add(node.kind)
  requirements.projectionFields.add('id')
  requirements.projectionFields.add('kind')
  requirements.projectionFields.add('bounds')
  collectStyleRequirements(node.style, requirements)

  if (node.zIndex !== undefined) {
    requirements.projectionFields.add('zIndex')
    requirements.qssFeatures.add('z-index')
  }
  if (node.clipChildren !== undefined) {
    requirements.projectionFields.add('clipChildren')
    requirements.qssFeatures.add('overflow')
  }
  if (node.visible !== undefined)
    requirements.projectionFields.add('visible')
  if (node.opacity !== undefined)
    requirements.projectionFields.add('opacity')
  if (node.scrollOffsetX !== undefined)
    requirements.projectionFields.add('scrollOffsetX')
  if (node.scrollOffsetY !== undefined)
    requirements.projectionFields.add('scrollOffsetY')
  if (node.provenance)
    requirements.projectionFields.add('provenance')

  if (node.image) {
    requirements.projectionFields.add('image')
    collectAssetKind(node.image, requirements)
  }
  if (node.text !== undefined)
    requirements.projectionFields.add('text')
  if (node.intent?.event) {
    requirements.projectionFields.add('intent')
    requirements.intentEvents.add(node.intent.event)
    if (node.intent.choiceId !== undefined)
      requirements.projectionFields.add('choiceId')
  }
  if (node.children?.length)
    requirements.projectionFields.add('children')

  for (const child of node.children || [])
    collectNativeUiSurfaceNodeRequirements(child, requirements)
}

function collectStyleRequirements(
  style: NativeQssResolvedStyle | undefined,
  requirements: NativeUiSurfaceProjectionRequirementSets,
): void {
  if (!style)
    return

  requirements.projectionFields.add('style')

  for (const key of Object.keys(style) as Array<keyof NativeQssResolvedStyle>) {
    const feature = QSS_FEATURE_BY_STYLE_FIELD[key]
    if (feature)
      requirements.qssFeatures.add(feature)
  }

  collectAssetKind(style.backgroundImage, requirements)
  if (style.fontFamily?.length)
    requirements.assetKinds.add('fonts')
}

function collectAssetKind(
  image: { assetName: string, assetType: string } | undefined,
  requirements: NativeUiSurfaceProjectionRequirementSets,
): void {
  if (
    image
    && isSafeNativeAssetType(image.assetType)
    && isSafePackageAssetName(image.assetName)
  ) {
    requirements.assetKinds.add(image.assetType)
  }
}

function createRequirementSets(): NativeUiSurfaceProjectionRequirementSets {
  return {
    assetKinds: new Set(),
    intentEvents: new Set(),
    projectionFields: new Set(),
    qssFeatures: new Set(),
    quiComponents: new Set(),
  }
}

function sortedStrings(values: Set<string>): string[] {
  return Array.from(values).sort()
}
