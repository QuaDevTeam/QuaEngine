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
} from './types'
import { createNativeUiSurfaceCompatibility } from '@quajs/native-contracts'
import { literalStringValue } from './assets'
import { parseNativeQssBackgroundImage } from './qss-resolved-style'

export interface CreateNativeUiSurfaceCompatibilityFromDocumentsOptions
  extends Omit<CreateNativeUiSurfaceCompatibilityOptions, 'assetKinds' | 'qssFeatures' | 'quiComponents'> {
  assetKinds?: readonly string[]
  qss?: NativeQssDocument | readonly NativeQssDocument[]
  qssFeatures?: readonly string[]
  quiComponents?: readonly string[]
}

export function createNativeUiSurfaceCompatibilityFromDocuments(
  qui: NativeQuiDocument,
  options: CreateNativeUiSurfaceCompatibilityFromDocumentsOptions = {},
): RuntimePackageNativeRendererCompatibility {
  const { assetKinds, qss, qssFeatures, quiComponents, ...compatibilityOptions } = options
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

function collectNativeUiSurfaceCompatibilityInputs(
  qui: NativeQuiDocument,
  qssDocuments: readonly NativeQssDocument[],
): {
  assetKinds: string[]
  qssFeatures: string[]
  quiComponents: string[]
} {
  const assetKinds = new Set<string>()
  const qssFeatures = new Set<string>()
  const quiComponents = new Set<string>()

  for (const node of qui.tree)
    collectQuiNodeCompatibilityInputs(node, assetKinds, quiComponents)
  for (const document of qssDocuments)
    collectQssCompatibilityInputs(document, assetKinds, qssFeatures)

  return {
    assetKinds: sortedStrings(assetKinds),
    qssFeatures: sortedStrings(qssFeatures),
    quiComponents: sortedStrings(quiComponents),
  }
}

function collectQuiNodeCompatibilityInputs(
  node: NativeQuiAstNode,
  assetKinds: Set<string>,
  quiComponents: Set<string>,
): void {
  if (node.kind === 'component') {
    quiComponents.add(node.name)
    collectQuiAssetKinds(node.props, assetKinds)
  }
  for (const child of node.children)
    collectQuiNodeCompatibilityInputs(child, assetKinds, quiComponents)
}

function collectQuiAssetKinds(props: readonly NativeQuiProp[], assetKinds: Set<string>): void {
  const hasAssetReference = props.some(prop =>
    (prop.name === 'src' || prop.name === 'image')
    && literalStringValue(prop.value))
  if (!hasAssetReference)
    return

  const assetTypeProp = props.find(prop => prop.name === 'asset-type')
  assetKinds.add(literalStringValue(assetTypeProp?.value) || 'images')
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
