import type { NativeQuiProp, NativeUiDiagnostic } from './types'
import { isSafeNativeAssetType, isSafePackageAssetName, literalStringValue } from './assets'
import { hasUnsupportedQuiActionArgument, parseQuiActionDescriptor } from './qui-actions'

const IDENTIFIER_PATTERN_SOURCE = String.raw`[A-Za-z_$][\w$]*`
const FOR_SOURCE_PATTERN_SOURCE = String.raw`[\s\S]+?`
const FOR_PATTERN = new RegExp([
  String.raw`^\s*(?:`,
  IDENTIFIER_PATTERN_SOURCE,
  String.raw`|\(\s*`,
  IDENTIFIER_PATTERN_SOURCE,
  String.raw`(?:\s*,\s*`,
  IDENTIFIER_PATTERN_SOURCE,
  String.raw`)?\s*\))\s+in\s+`,
  FOR_SOURCE_PATTERN_SOURCE,
  String.raw`\s*$`,
].join(''))
const UNSAFE_EXPRESSION_PATTERNS = [
  { pattern: /\b(?:await|new|function|class|throw|return|yield)\b/, reason: 'imperative JavaScript is not allowed in QUI expressions' },
  { pattern: /=>/, reason: 'function expressions are not allowed in QUI expressions' },
  { pattern: /(?:^|[^=!<>])=(?:[^=]|$)/, reason: 'assignments are not allowed in QUI expressions' },
  { pattern: /(?:\+\+|--|\+=|-=|\*=|\/=)/, reason: 'mutation operators are not allowed in QUI expressions' },
] as const

export function validateQuiProps(props: readonly NativeQuiProp[], diagnostics: NativeUiDiagnostic[]): void {
  for (const prop of props) {
    if (prop.name === 'else' && prop.value) {
      diagnostics.push({
        code: 'QUI_ELSE_HAS_VALUE',
        message: 'The else directive must not have a value.',
        range: prop.range,
        severity: 'error',
        source: 'qui',
      })
    }

    if (['if', 'else-if', 'show', 'key', 'for', 'action'].includes(prop.name) && !prop.value) {
      diagnostics.push({
        code: 'QUI_DIRECTIVE_VALUE_MISSING',
        message: `The ${prop.name} directive requires a value.`,
        range: prop.range,
        severity: 'error',
        source: 'qui',
      })
      continue
    }

    if (prop.name === 'for' && prop.value && !FOR_PATTERN.test(prop.value)) {
      diagnostics.push({
        code: 'QUI_INVALID_LOOP_EXPRESSION',
        message: 'Loop expressions must use "item in source" or "(item, index) in source" syntax.',
        range: prop.valueRange,
        severity: 'error',
        source: 'qui',
      })
    }

    if (prop.value)
      validateQuiExpression(prop, diagnostics)
  }

  validateQuiAssetReferences(props, diagnostics)
  validateQuiPropGroups(props, diagnostics)
}

function validateQuiAssetReferences(props: readonly NativeQuiProp[], diagnostics: NativeUiDiagnostic[]): void {
  const groups = collectPropGroups(props)
  for (const group of groups) {
    const assetTypeProp = group.find(prop => prop.name === 'asset-type' && prop.value)
    const assetType = literalStringValue(assetTypeProp?.value)
    if (assetTypeProp && (!assetType || !isSafeNativeAssetType(assetType))) {
      diagnostics.push({
        code: 'QUI_INVALID_ASSET_REFERENCE',
        message: 'QUI asset-type must be a literal native asset kind such as "images" or "fonts".',
        range: assetTypeProp.valueRange ?? assetTypeProp.range,
        severity: 'error',
        source: 'qui',
      })
    }

    for (const prop of group) {
      if (prop.name !== 'src' && prop.name !== 'image')
        continue

      const assetName = literalStringValue(prop.value)
      if (assetName && isSafePackageAssetName(assetName))
        continue

      diagnostics.push({
        code: 'QUI_INVALID_ASSET_REFERENCE',
        message: `QUI ${prop.name} must be a package-relative literal asset path without URLs, absolute paths, or traversal.`,
        range: prop.valueRange ?? prop.range,
        severity: 'error',
        source: 'qui',
      })
    }
  }
}

function validateQuiPropGroups(props: readonly NativeQuiProp[], diagnostics: NativeUiDiagnostic[]): void {
  const groups = collectPropGroups(props)

  for (const group of groups) {
    validateDuplicateProps(group, diagnostics)
    validateKeyedLoops(group, diagnostics)
  }

  validateConditionalChains(groups, diagnostics)
}

function collectPropGroups(props: readonly NativeQuiProp[]): NativeQuiProp[][] {
  const groups = new Map<number, NativeQuiProp[]>()
  for (const prop of props) {
    if (prop.groupId === undefined)
      continue
    const group = groups.get(prop.groupId) || []
    groups.set(prop.groupId, [...group, prop])
  }
  return Array.from(groups.values())
}

function validateDuplicateProps(group: readonly NativeQuiProp[], diagnostics: NativeUiDiagnostic[]): void {
  const seen = new Set<string>()
  for (const prop of group) {
    if (!seen.has(prop.name)) {
      seen.add(prop.name)
      continue
    }
    diagnostics.push({
      code: 'QUI_DUPLICATE_DIRECTIVE',
      message: `The "${prop.name}" directive is declared more than once on the same QUI node.`,
      range: prop.nameRange,
      severity: 'error',
      source: 'qui',
    })
  }
}

function validateKeyedLoops(group: readonly NativeQuiProp[], diagnostics: NativeUiDiagnostic[]): void {
  const forProp = group.find(prop => prop.name === 'for' && prop.value && FOR_PATTERN.test(prop.value))
  if (!forProp)
    return
  const hasKey = group.some(prop => prop.name === 'key' && prop.value)
  if (hasKey)
    return

  diagnostics.push({
    code: 'QUI_LOOP_KEY_MISSING',
    message: 'Loop-rendered QUI nodes must declare a stable key directive.',
    range: forProp.range,
    severity: 'error',
    source: 'qui',
  })
}

function validateConditionalChains(groups: readonly NativeQuiProp[][], diagnostics: NativeUiDiagnostic[]): void {
  let previousBranch: NativeQuiProp | undefined
  for (const group of groups) {
    const branch = group.find(prop => prop.name === 'if' || prop.name === 'else-if' || prop.name === 'else')
    if (!branch) {
      previousBranch = undefined
      continue
    }

    if (branch.name === 'if') {
      previousBranch = branch
      continue
    }

    if (!previousBranch || previousBranch.name === 'else') {
      diagnostics.push({
        code: 'QUI_CONDITIONAL_BRANCH_ORPHANED',
        message: `The ${branch.name} directive must immediately follow an if or else-if branch.`,
        range: branch.range,
        severity: 'error',
        source: 'qui',
      })
    }

    previousBranch = branch
  }
}

function validateQuiExpression(prop: NativeQuiProp, diagnostics: NativeUiDiagnostic[]): void {
  const value = prop.value || ''
  for (const unsafe of UNSAFE_EXPRESSION_PATTERNS) {
    if (!unsafe.pattern.test(value))
      continue
    diagnostics.push({
      code: 'QUI_UNSAFE_EXPRESSION',
      message: unsafe.reason,
      range: prop.valueRange,
      severity: 'error',
      source: 'qui',
    })
    return
  }

  if (prop.name !== 'action' && /\b[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)?\s*\(/i.test(value)) {
    diagnostics.push({
      code: 'QUI_UNSAFE_EXPRESSION',
      message: 'Function calls are not allowed outside declarative action descriptors.',
      range: prop.valueRange,
      severity: 'error',
      source: 'qui',
    })
  }

  if (prop.name === 'action') {
    const descriptor = parseQuiActionDescriptor(value, prop)
    if (!descriptor) {
      diagnostics.push({
        code: 'QUI_INVALID_ACTION_DESCRIPTOR',
        message: 'Actions must use declarative ui.*, choice.select(), save.*, or settings.* descriptors.',
        range: prop.valueRange,
        severity: 'error',
        source: 'qui',
      })
      return
    }

    if (descriptor.namespace === 'choice' && descriptor.name !== 'select') {
      diagnostics.push({
        code: 'QUI_INVALID_ACTION_DESCRIPTOR',
        message: 'Choice actions must use choice.select(choiceId) so native renderers can emit choice/select.',
        range: prop.valueRange,
        severity: 'error',
        source: 'qui',
      })
      return
    }

    if (hasUnsupportedQuiActionArgument(descriptor)) {
      diagnostics.push({
        code: 'QUI_UNSAFE_EXPRESSION',
        message: 'Action descriptor arguments may use literals or references, not nested function calls.',
        range: prop.valueRange,
        severity: 'error',
        source: 'qui',
      })
    }
  }
}
