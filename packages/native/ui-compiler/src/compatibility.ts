import type {
  CreateNativeUiSurfaceCompatibilityOptions,
  RuntimePackageNativeRendererCompatibility,
} from '@quajs/native-contracts'
import type {
  NativeQssDeclaration,
  NativeQssDocument,
  NativeQuiAstNode,
  NativeQuiDocument,
  NativeQuiProp,
  NativeUiSurfaceProjection,
} from './types'
import { createNativeUiSurfaceCompatibility } from '@quajs/native-contracts'
import { isSafeNativeAssetType, isSafePackageAssetName, literalStringValue } from './assets'
import { collectNativeUiSurfaceProjectionRequirements } from './projection-requirements'
import { parseNativeQssBackgroundImage } from './qss-resolved-style'
import { findNativeQssProperty, findNativeUiComponent } from './registry'
import { canProjectNativeUiIntent } from './surface-intents'

export interface CreateNativeUiSurfaceCompatibilityFromDocumentsOptions
  extends Omit<CreateNativeUiSurfaceCompatibilityOptions, 'assetKinds' | 'intentEvents' | 'qssFeatures' | 'quiComponents'> {
  assetKinds?: readonly string[]
  intentEvents?: readonly string[]
  qss?: NativeQssDocument | readonly NativeQssDocument[]
  qssFeatures?: readonly string[]
  quiComponents?: readonly string[]
}

export function createNativeUiSurfaceCompatibilityFromDocuments(
  qui: NativeQuiDocument,
  options: CreateNativeUiSurfaceCompatibilityFromDocumentsOptions = {},
): RuntimePackageNativeRendererCompatibility {
  const { assetKinds, intentEvents, qss, qssFeatures, quiComponents, ...compatibilityOptions } = options
  const qssDocuments = Array.isArray(qss)
    ? qss
    : qss ? [qss] : []
  const collected = collectNativeUiSurfaceCompatibilityInputs(qui, qssDocuments)

  return createNativeUiSurfaceCompatibility({
    ...compatibilityOptions,
    assetKinds: uniqueStrings([
      ...collected.assetKinds,
      ...(assetKinds || []),
    ]),
    intentEvents: uniqueStrings([
      ...collected.intentEvents,
      ...(intentEvents || []),
    ]),
    qssFeatures: uniqueStrings([
      ...collected.qssFeatures,
      ...(qssFeatures || []),
    ]),
    quiComponents: uniqueStrings([
      ...collected.quiComponents,
      ...(quiComponents || []),
    ]),
  })
}

export interface CreateNativeUiSurfaceCompatibilityFromProjectionOptions
  extends Omit<CreateNativeUiSurfaceCompatibilityOptions, 'assetKinds' | 'intentEvents' | 'qssFeatures' | 'quiComponents'> {
  assetKinds?: readonly string[]
  intentEvents?: readonly string[]
  qssFeatures?: readonly string[]
  quiComponents?: readonly string[]
}

export function createNativeUiSurfaceCompatibilityFromProjection(
  projection: NativeUiSurfaceProjection,
  options: CreateNativeUiSurfaceCompatibilityFromProjectionOptions = {},
): RuntimePackageNativeRendererCompatibility {
  const { assetKinds, intentEvents, qssFeatures, quiComponents, ...compatibilityOptions } = options
  const requirements = collectNativeUiSurfaceProjectionRequirements(projection)

  return createNativeUiSurfaceCompatibility({
    ...compatibilityOptions,
    assetKinds: uniqueStrings([
      ...requirements.assetKinds,
      ...(assetKinds || []),
    ]),
    intentEvents: uniqueStrings([
      ...requirements.intentEvents,
      ...(intentEvents || []),
    ]),
    qssFeatures: uniqueStrings([
      ...requirements.qssFeatures,
      ...(qssFeatures || []),
    ]),
    quiComponents: uniqueStrings([
      ...requirements.quiComponents,
      ...(quiComponents || []),
    ]),
  })
}

function collectNativeUiSurfaceCompatibilityInputs(
  qui: NativeQuiDocument,
  qssDocuments: readonly NativeQssDocument[],
): {
  assetKinds: string[]
  intentEvents: string[]
  qssFeatures: string[]
  quiComponents: string[]
} {
  const assetKinds = new Set<string>()
  const intentEvents = new Set<string>()
  const qssFeatures = new Set<string>()
  const quiComponents = new Set<string>()

  for (const node of qui.tree)
    collectQuiNodeCompatibilityInputs(node, assetKinds, intentEvents, quiComponents)
  for (const document of qssDocuments)
    collectQssCompatibilityInputs(document, assetKinds, qssFeatures)

  return {
    assetKinds: sortedStrings(assetKinds),
    intentEvents: sortedStrings(intentEvents),
    qssFeatures: sortedStrings(qssFeatures),
    quiComponents: sortedStrings(quiComponents),
  }
}

function collectQuiNodeCompatibilityInputs(
  node: NativeQuiAstNode,
  assetKinds: Set<string>,
  intentEvents: Set<string>,
  quiComponents: Set<string>,
): void {
  if (node.kind === 'component') {
    if (findNativeUiComponent(node.name))
      quiComponents.add(node.name)
    if (canProjectNativeUiIntent(node.name)) {
      for (const action of node.actions)
        intentEvents.add(action.event)
    }
    collectQuiAssetKinds(node.props, assetKinds)
  }
  for (const child of node.children)
    collectQuiNodeCompatibilityInputs(child, assetKinds, intentEvents, quiComponents)
}

function collectQuiAssetKinds(props: readonly NativeQuiProp[], assetKinds: Set<string>): void {
  const assetName = props
    .filter(prop => prop.name === 'src' || prop.name === 'image')
    .map(prop => literalStringValue(prop.value))
    .find((value): value is string => !!value && isSafePackageAssetName(value))
  if (!assetName)
    return

  const assetTypeProp = props.find(prop => prop.name === 'asset-type')
  const assetType = literalStringValue(assetTypeProp?.value) || 'images'
  if (isSafeNativeAssetType(assetType))
    assetKinds.add(assetType)
}

function collectQssCompatibilityInputs(
  document: NativeQssDocument,
  assetKinds: Set<string>,
  qssFeatures: Set<string>,
): void {
  for (const rule of document.rules) {
    for (const declaration of rule.declarations)
      collectQssDeclarationCompatibilityInputs(declaration, assetKinds, qssFeatures)
  }
}

function collectQssDeclarationCompatibilityInputs(
  declaration: NativeQssDeclaration,
  assetKinds: Set<string>,
  qssFeatures: Set<string>,
): void {
  const property = findNativeQssProperty(declaration.name)
  if (property?.nativeWgpu)
    qssFeatures.add(declaration.name)
  if (declaration.name !== 'background-image')
    return

  const backgroundImage = parseNativeQssBackgroundImage(declaration.value)
  if (backgroundImage)
    assetKinds.add(backgroundImage.assetType)
}

function sortedStrings(values: ReadonlySet<string>): string[] {
  return Array.from(values)
    .filter(Boolean)
    .sort()
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values))
}
