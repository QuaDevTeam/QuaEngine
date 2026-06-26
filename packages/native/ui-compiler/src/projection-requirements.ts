import type {
  NativeQssResolvedStyle,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceProjection,
} from './types'

export interface NativeUiSurfaceProjectionRequirements {
  assetKinds: string[]
  intentEvents: string[]
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
  color: 'color',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontStyle: 'font-style',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
  lineHeight: 'line-height',
  objectFit: 'object-fit',
  opacity: 'opacity',
  padding: 'padding',
  textAlign: 'text-align',
  textDecoration: 'text-decoration',
  textOverflow: 'text-overflow',
  textTransform: 'text-transform',
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
    qssFeatures: sortedStrings(requirements.qssFeatures),
    quiComponents: sortedStrings(requirements.quiComponents),
  }
}

interface NativeUiSurfaceProjectionRequirementSets {
  assetKinds: Set<string>
  intentEvents: Set<string>
  qssFeatures: Set<string>
  quiComponents: Set<string>
}

function collectNativeUiSurfaceNodeRequirements(
  node: NativeUiSurfaceNodeProjection | undefined,
  requirements: NativeUiSurfaceProjectionRequirementSets,
): void {
  if (!node)
    return

  requirements.quiComponents.add(node.kind)
  collectStyleRequirements(node.style, requirements)

  if (node.zIndex !== undefined)
    requirements.qssFeatures.add('z-index')
  if (node.clipChildren !== undefined)
    requirements.qssFeatures.add('overflow')

  if (node.image)
    requirements.assetKinds.add(node.image.assetType)
  if (node.intent?.event)
    requirements.intentEvents.add(node.intent.event)

  for (const child of node.children || [])
    collectNativeUiSurfaceNodeRequirements(child, requirements)
}

function collectStyleRequirements(
  style: NativeQssResolvedStyle | undefined,
  requirements: NativeUiSurfaceProjectionRequirementSets,
): void {
  if (!style)
    return

  for (const key of Object.keys(style) as Array<keyof NativeQssResolvedStyle>) {
    const feature = QSS_FEATURE_BY_STYLE_FIELD[key]
    if (feature)
      requirements.qssFeatures.add(feature)
  }

  if (style.backgroundImage)
    requirements.assetKinds.add(style.backgroundImage.assetType)
  if (style.fontFamily?.length)
    requirements.assetKinds.add('fonts')
}

function createRequirementSets(): NativeUiSurfaceProjectionRequirementSets {
  return {
    assetKinds: new Set(),
    intentEvents: new Set(),
    qssFeatures: new Set(),
    quiComponents: new Set(),
  }
}

function sortedStrings(values: Set<string>): string[] {
  return Array.from(values).sort()
}
