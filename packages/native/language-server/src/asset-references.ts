import type {
  NativeQssDocument,
  NativeQuiAstNode,
  NativeQuiProp,
  NativeUiRange,
} from '@quajs/native-ui-compiler'
import {
  isSafeNativeAssetType,
  isSafePackageAssetName,
  literalStringValue,
} from '@quajs/native-ui-compiler'
import {
  offsetAtPosition,
  rangeFromRelativeOffsets,
  stringLiteralContentRange,
} from './source-ranges'

export type NativeUiProjectAssetReferenceSource = 'qss-asset' | 'qui-prop'

export interface NativeUiProjectAssetReference {
  assetName: string
  assetType: string
  pathRange: NativeUiRange
  range: NativeUiRange
  source: NativeUiProjectAssetReferenceSource
}

const DEFAULT_ASSET_TYPE = 'images'

export function collectNativeUiProjectAssetReferences(
  source: string,
  quiNodes: readonly NativeQuiAstNode[],
  qss?: NativeQssDocument,
): NativeUiProjectAssetReference[] {
  return [
    ...assetReferencesFromQui(source, quiNodes),
    ...(qss ? assetReferencesFromQss(source, qss) : []),
  ].sort(compareAssetReferences)
}

export function isSafeNativeUiProjectAssetName(value: string): boolean {
  return isSafePackageAssetName(value)
}

function assetReferencesFromQui(
  source: string,
  nodes: readonly NativeQuiAstNode[],
): NativeUiProjectAssetReference[] {
  return nodes.flatMap(node => node.props
    .filter(prop => (prop.name === 'src' || prop.name === 'image') && prop.value)
    .flatMap((prop) => {
      const assetName = literalStringValue(prop.value)
      if (!assetName || !isSafeNativeUiProjectAssetName(assetName))
        return []

      const assetType = propString(node.props, 'asset-type') || DEFAULT_ASSET_TYPE
      if (!isSafeNativeAssetType(assetType))
        return []
      return [{
        assetName,
        assetType,
        pathRange: prop.valueRange
          ? stringLiteralContentRange(source, prop.value, prop.valueRange)
          : prop.nameRange,
        range: prop.range,
        source: 'qui-prop' as const,
      }]
    }))
}

function assetReferencesFromQss(
  source: string,
  document: NativeQssDocument,
): NativeUiProjectAssetReference[] {
  return document.rules.flatMap(rule => rule.declarations
    .filter(declaration => declaration.name === 'background-image')
    .flatMap((declaration) => {
      const parsed = parseQssAssetCall(declaration.value)
      if (!parsed || !isSafeNativeUiProjectAssetName(parsed.assetName))
        return []

      const valueStart = offsetAtPosition(source, declaration.valueRange.start)
      return [{
        assetName: parsed.assetName,
        assetType: parsed.assetType,
        pathRange: rangeFromRelativeOffsets(
          { line: 0, character: 0 },
          source,
          valueStart + parsed.assetNameStart,
          valueStart + parsed.assetNameEnd,
        ),
        range: declaration.range,
        source: 'qss-asset' as const,
      }]
    }))
}

function parseQssAssetCall(value: string): { assetName: string, assetNameEnd: number, assetNameStart: number, assetType: string } | undefined {
  const match = /^asset\(\s*(["'])([^"']+)\1\s*(?:,\s*(["'])([A-Za-z][A-Za-z0-9-]*)\3)?\s*\)$/i.exec(value.trim())
  if (!match || match.index === undefined)
    return undefined

  const assetName = match[2].trim()
  if (!assetName)
    return undefined

  const rawAssetStart = match.index + match[0].indexOf(match[2])
  const trimStart = match[2].search(/\S/)
  const trimEnd = match[2].length - match[2].trimEnd().length
  return {
    assetName,
    assetNameStart: rawAssetStart + Math.max(0, trimStart),
    assetNameEnd: rawAssetStart + match[2].length - trimEnd,
    assetType: (match[4] || DEFAULT_ASSET_TYPE).trim(),
  }
}

function propString(props: readonly NativeQuiProp[], name: string): string | undefined {
  const value = props.find(prop => prop.name === name)?.value?.trim()
  return literalStringValue(value)
}

function compareAssetReferences(left: NativeUiProjectAssetReference, right: NativeUiProjectAssetReference): number {
  return left.assetName.localeCompare(right.assetName)
    || left.assetType.localeCompare(right.assetType)
    || left.source.localeCompare(right.source)
    || left.range.start.line - right.range.start.line
    || left.range.start.character - right.range.start.character
}
