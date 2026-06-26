import type {
  NativeQssAtRule,
  NativeQssDeclaration,
  NativeQssDocument,
  NativeQssRule,
  NativeUiCompletionItem,
  NativeUiDiagnostic,
  NativeUiHover,
  NativeUiLanguageOptions,
} from './types'
import {
  findNativeQssProperty,
  findNativeUiComponent,
  nativeQssProperties,
  nativeQssPseudoStates,
  nativeUiComponents,
} from './registry'
import {
  parseNativeQssBackgroundImage,
  parseNativeQssBackgroundPosition,
  parseNativeQssBorderStyle,
  parseNativeQssCoordinateNumber,
  parseNativeQssDisplay,
  parseNativeQssEdgeInsets,
  parseNativeQssFontFamilyList,
  parseNativeQssFontWeight,
  parseNativeQssInteger,
  parseNativeQssLogicalNumber,
  parseNativeQssObjectFit,
  parseNativeQssOpacity,
  parseNativeQssOverflow,
  parseNativeQssTextAlign,
  parseNativeQssVisibility,
} from './qss-resolved-style'
import {
  collectBalancedDelimiterDiagnostics,
  createLineStarts,
  findMatchingDelimiter,
  maskSourceLiterals,
  rangeFromOffsets,
  splitTopLevel,
  wordAt,
} from './source'

interface ParsedQssItem {
  atRule?: NativeQssAtRule
  bodyEnd?: number
  bodyStart?: number
  header: string
  rangeEnd: number
  rangeStart: number
  rule?: NativeQssRule
}

const UNSUPPORTED_UNIT_PATTERN = /(?:^|[^\w-])(?:-?\d*\.?\d+)(em|rem|vw|vh|vmin|vmax|dvh|svh|lvh|cm|mm|in|pt|pc)\b/g
const SUPPORTED_MEDIA_PATTERN = /^\s*\((?:orientation:\s*(?:landscape|portrait)|(?:min|max)-(?:width|height):\s*\d+(?:\.\d+)?px)\)\s*$/
const SUPPORTED_SUPPORTS_PATTERN = /^\s*(?:renderer\((?:wgpu|preview)\)|native-feature\((?:video|audio-levels|filters|blend-modes|virtualization|focus-navigation)\))\s*$/
const ATTR_SELECTOR_PATTERN = /\[[A-Za-z_][\w-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[A-Za-z0-9_-]+))?\]/g
const PART_SELECTOR_PATTERN = /([A-Z][A-Za-z0-9_]*)::part\(([A-Za-z_][\w-]*)\)/g
const PSEUDO_PATTERN = /(?<!:):([A-Za-z-]+)(?![A-Za-z-(])/g

export function analyzeQssSource(source: string, options: NativeUiLanguageOptions = {}): NativeQssDocument {
  const lineStarts = createLineStarts(source)
  const masked = maskSourceLiterals(source)
  const diagnostics = [
    ...collectBalancedDelimiterDiagnostics(source, lineStarts, 'qss'),
  ]
  const items = parseQssItems(source, masked, 0, source.length, lineStarts, diagnostics)
  const rules = items.flatMap(item => item.rule ? [item.rule] : [])
  const atRules = items.flatMap(item => item.atRule ? [item.atRule] : [])

  for (const atRule of atRules)
    validateAtRule(atRule, diagnostics)

  for (const rule of rules) {
    validateSelector(rule, diagnostics, options)
    for (const declaration of rule.declarations)
      validateDeclaration(declaration, diagnostics, options)
  }

  return {
    kind: 'qss',
    source,
    atRules,
    rules,
    diagnostics,
  }
}

export function formatQssSource(source: string, options: NativeUiLanguageOptions = {}): string {
  const lineStarts = createLineStarts(source)
  const masked = maskSourceLiterals(source)
  const diagnostics: NativeUiDiagnostic[] = []
  const items = parseQssItems(source, masked, 0, source.length, lineStarts, diagnostics)
  const indent = ' '.repeat(options.format?.indentSize ?? 2)
  const output: string[] = []

  for (const item of items) {
    if (item.rule) {
      pushRule(output, item.rule, '')
      output.push('')
      continue
    }
    if (!item.atRule)
      continue

    if (item.bodyStart === undefined || item.bodyEnd === undefined) {
      output.push(`${item.header.trim()};`)
      output.push('')
      continue
    }

    const body = source.slice(item.bodyStart, item.bodyEnd).trim()
    output.push(`${item.header.trim()} {`)
    for (const line of body.split(/\r?\n/).map(line => line.trim()).filter(Boolean))
      output.push(`${indent}${normalizeQssLine(line)}`)
    output.push('}')
    output.push('')
  }

  const formatted = output.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
  return options.format?.insertFinalNewline === false ? formatted : `${formatted}\n`

  function pushRule(target: string[], rule: NativeQssRule, prefix: string): void {
    target.push(`${prefix}${rule.selector.trim()} {`)
    for (const declaration of rule.declarations)
      target.push(`${prefix}${indent}${declaration.name}: ${declaration.value.trim()};`)
    target.push(`${prefix}}`)
  }
}

export function getQssCompletions(source: string, offset: number): NativeUiCompletionItem[] {
  const valueContext = findQssDeclarationContext(source, offset)
  if (valueContext) {
    const property = findNativeQssProperty(valueContext.propertyName)
    if (property?.values?.length) {
      return property.values.map((value, index) => ({
        label: value.label,
        kind: 'value',
        detail: `${property.name} value: ${value.description}`,
        insertText: value.insertText ?? value.label,
        sortText: `1${index.toString().padStart(3, '0')}`,
      }))
    }
    return []
  }

  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const beforeCursor = source.slice(lineStart, offset)

  if (/\{\s*[\w-]*$/.test(beforeCursor) || /;\s*[\w-]*$/.test(beforeCursor) || /^\s*[\w-]*$/.test(beforeCursor)) {
    return nativeQssProperties.map((property, index) => ({
      label: property.name,
      kind: 'property',
      detail: property.nativeWgpu
        ? `Native wgpu ${property.phase.toUpperCase()} property`
        : `Planned ${property.phase.toUpperCase()} QSS property`,
      insertText: `${property.name}: `,
      sortText: `${property.nativeWgpu ? '1' : '2'}${index.toString().padStart(3, '0')}`,
    }))
  }

  return [
    ...nativeUiComponents.map((component, index) => ({
      label: component.name,
      kind: 'selector' as const,
      detail: component.description,
      insertText: `${component.name} {\n  $0\n}`,
      sortText: `1${index.toString().padStart(3, '0')}`,
    })),
    ...nativeQssPseudoStates.map((state, index) => ({
      label: `:${state}`,
      kind: 'selector' as const,
      detail: 'Native QSS pseudo-state selector.',
      insertText: `:${state}`,
      sortText: `2${index.toString().padStart(3, '0')}`,
    })),
  ]
}

export function getQssHover(source: string, offset: number): NativeUiHover | undefined {
  const word = wordAt(source, offset)
  if (!word)
    return undefined

  const valueContext = findQssDeclarationContext(source, offset)
  const valueProperty = valueContext ? findNativeQssProperty(valueContext.propertyName) : undefined
  const propertyValue = valueProperty?.values?.find(value =>
    value.label === word.text
    || value.insertText === word.text
    || value.label.split(/\s+/).includes(word.text),
  )
  if (valueProperty && propertyValue) {
    return {
      contents: `**${propertyValue.label}** value for \`${valueProperty.name}\`\n\n${propertyValue.description}\n\nNative wgpu: ${valueProperty.nativeWgpu ? 'supported' : 'not yet supported'}.`,
    }
  }

  const property = findNativeQssProperty(word.text)
  if (property) {
    return {
      contents: `**${property.name}** (${property.phase.toUpperCase()})\n\n${property.description}\n\nNative wgpu: ${property.nativeWgpu ? 'supported' : 'not yet supported'}.`,
    }
  }

  const component = findNativeUiComponent(word.text)
  if (component) {
    return {
      contents: `**${component.name}** selector\n\n${component.description}`,
    }
  }

  return undefined
}

function findQssDeclarationContext(source: string, offset: number): { propertyName: string } | undefined {
  const cursor = Math.max(0, Math.min(offset, source.length))
  const masked = maskSourceLiterals(source)
  const ruleOpen = masked.lastIndexOf('{', cursor)
  const ruleClose = masked.lastIndexOf('}', cursor)
  if (ruleOpen === -1 || ruleClose > ruleOpen)
    return undefined

  const declarationStart = Math.max(ruleOpen + 1, masked.lastIndexOf(';', cursor - 1) + 1)
  const maskedDeclaration = masked.slice(declarationStart, cursor)
  const colon = maskedDeclaration.indexOf(':')
  if (colon === -1)
    return undefined

  const propertyName = source.slice(declarationStart, declarationStart + colon).trim()
  if (!/^[A-Za-z_-][\w-]*$/.test(propertyName))
    return undefined

  return { propertyName }
}

function parseQssItems(
  source: string,
  masked: string,
  start: number,
  end: number,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): ParsedQssItem[] {
  const items: ParsedQssItem[] = []
  let offset = start

  while (offset < end) {
    offset = skipWhitespace(masked, offset, end)
    if (offset >= end)
      break

    if (masked[offset] === '@') {
      const item = parseAtRule(source, masked, offset, end, lineStarts, diagnostics)
      if (!item)
        break
      items.push(item)
      offset = item.rangeEnd
      continue
    }

    const open = masked.indexOf('{', offset)
    if (open === -1 || open >= end) {
      diagnostics.push({
        code: 'QSS_PARSE_ERROR',
        message: 'Expected a rule block after selector.',
        range: rangeFromOffsets(lineStarts, offset, Math.min(end, source.length)),
        severity: 'error',
        source: 'qss',
      })
      break
    }

    const close = findMatchingDelimiter(masked, open, '{', '}')
    if (close === -1 || close > end)
      break

    const selector = source.slice(offset, open).trim()
    const declarations = parseDeclarations(source, masked, open + 1, close, lineStarts, diagnostics)
    const rule: NativeQssRule = {
      selector,
      declarations,
      selectorRange: rangeFromOffsets(lineStarts, offset, open),
      range: rangeFromOffsets(lineStarts, offset, close + 1),
    }
    items.push({
      header: selector,
      rangeStart: offset,
      rangeEnd: close + 1,
      bodyStart: open + 1,
      bodyEnd: close,
      rule,
    })
    offset = close + 1
  }

  return items
}

function parseAtRule(
  source: string,
  masked: string,
  offset: number,
  end: number,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): ParsedQssItem | undefined {
  const nextSemicolon = masked.indexOf(';', offset)
  const nextOpen = masked.indexOf('{', offset)

  if (nextSemicolon !== -1 && (nextOpen === -1 || nextSemicolon < nextOpen)) {
    const header = source.slice(offset, nextSemicolon).trim()
    const atRule = createAtRule(header, '', offset, nextSemicolon + 1, lineStarts)
    return {
      header,
      atRule,
      rangeStart: offset,
      rangeEnd: nextSemicolon + 1,
    }
  }

  if (nextOpen === -1 || nextOpen >= end) {
    diagnostics.push({
      code: 'QSS_PARSE_ERROR',
      message: 'Expected ; or block after at-rule.',
      range: rangeFromOffsets(lineStarts, offset, Math.min(end, source.length)),
      severity: 'error',
      source: 'qss',
    })
    return undefined
  }

  const close = findMatchingDelimiter(masked, nextOpen, '{', '}')
  if (close === -1 || close > end)
    return undefined

  const header = source.slice(offset, nextOpen).trim()
  const body = source.slice(nextOpen + 1, close)
  const atRule = createAtRule(header, body, offset, close + 1, lineStarts)
  return {
    header,
    atRule,
    bodyStart: nextOpen + 1,
    bodyEnd: close,
    rangeStart: offset,
    rangeEnd: close + 1,
  }
}

function createAtRule(
  header: string,
  body: string,
  start: number,
  end: number,
  lineStarts: readonly number[],
): NativeQssAtRule {
  const kind = header.match(/^@([\w-]+)/)?.[1] || 'unknown'
  return {
    kind,
    prelude: header.replace(/^@[\w-]+/, '').trim(),
    body,
    range: rangeFromOffsets(lineStarts, start, end),
  }
}

function parseDeclarations(
  source: string,
  masked: string,
  start: number,
  end: number,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): NativeQssDeclaration[] {
  const declarations: NativeQssDeclaration[] = []
  let offset = start

  while (offset < end) {
    offset = skipWhitespace(masked, offset, end)
    if (offset >= end)
      break

    const colon = masked.indexOf(':', offset)
    if (colon === -1 || colon > end)
      break

    const name = source.slice(offset, colon).trim()
    const nameStart = offset + source.slice(offset, colon).indexOf(name)
    let valueEnd = colon + 1
    let depth = 0
    while (valueEnd < end) {
      const char = masked[valueEnd]
      if (char === '(' || char === '[')
        depth += 1
      else if (char === ')' || char === ']')
        depth = Math.max(0, depth - 1)
      else if (char === ';' && depth === 0)
        break
      valueEnd += 1
    }

    const value = source.slice(colon + 1, valueEnd).trim()
    const valueStart = colon + 1 + source.slice(colon + 1, valueEnd).indexOf(value)
    if (!name) {
      diagnostics.push({
        code: 'QSS_PARSE_ERROR',
        message: 'Expected property name before colon.',
        range: rangeFromOffsets(lineStarts, offset, colon),
        severity: 'error',
        source: 'qss',
      })
    }
    else {
      declarations.push({
        name,
        value,
        nameRange: rangeFromOffsets(lineStarts, nameStart, nameStart + name.length),
        valueRange: rangeFromOffsets(lineStarts, valueStart, valueStart + value.length),
        range: rangeFromOffsets(lineStarts, offset, valueEnd + (masked[valueEnd] === ';' ? 1 : 0)),
      })
    }

    offset = valueEnd + 1
  }

  return declarations
}

function validateAtRule(atRule: NativeQssAtRule, diagnostics: NativeUiDiagnostic[]): void {
  if (atRule.kind === 'import' || atRule.kind === 'keyframes') {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_AT_RULE',
      message: `@${atRule.kind} is not supported by native QSS milestone 1.`,
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
    return
  }

  if (!['tokens', 'theme', 'font-face', 'media', 'supports'].includes(atRule.kind)) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_AT_RULE',
      message: `@${atRule.kind} is not part of the native QSS subset.`,
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
    return
  }

  if (atRule.kind === 'media' && !SUPPORTED_MEDIA_PATTERN.test(atRule.prelude)) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_AT_RULE',
      message: 'Native QSS @media supports orientation plus logical min/max width or height only.',
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
  }

  if (atRule.kind === 'supports' && !SUPPORTED_SUPPORTS_PATTERN.test(atRule.prelude)) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_AT_RULE',
      message: 'Native QSS @supports accepts renderer(...) or native-feature(...) gates only.',
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
  }

  if (/url\s*\(/i.test(atRule.body || '')) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_VALUE',
      message: 'Use asset("...") instead of browser url(...) references in native QSS.',
      range: atRule.range,
      severity: 'error',
      source: 'qss',
    })
  }
}

function validateSelector(
  rule: NativeQssRule,
  diagnostics: NativeUiDiagnostic[],
  options: NativeUiLanguageOptions,
): void {
  const selectors = splitTopLevel(rule.selector, ',')
    .map(item => item.text.trim())
    .filter(Boolean)

  if (selectors.length === 0) {
    diagnostics.push({
      code: 'QSS_PARSE_ERROR',
      message: 'Expected selector before rule block.',
      range: rule.selectorRange,
      severity: 'error',
      source: 'qss',
    })
    return
  }

  const maxDepth = options.lint?.maxSelectorDepth ?? 3
  for (const selector of selectors) {
    if (/[+~]/.test(selector)) {
      pushUnsupportedSelector(rule, diagnostics, 'Sibling selectors are not supported in native QSS milestone 1.')
    }
    if (/::(?:before|after|marker)\b/.test(selector) || /::(?!part\()/u.test(selector)) {
      pushUnsupportedSelector(rule, diagnostics, 'Browser pseudo-elements are not supported; use declared ::part(...) selectors.')
    }
    if (/:(?:nth-child|has|not)\s*\(/.test(selector)) {
      pushUnsupportedSelector(rule, diagnostics, ':nth-child, :has, and :not are not supported in milestone 1.')
    }
    if (selector.includes('*') && selector.trim() !== '*') {
      pushUnsupportedSelector(rule, diagnostics, 'The universal selector is only allowed as a standalone reset selector.')
    }

    const withoutAttributes = selector.replace(ATTR_SELECTOR_PATTERN, '')
    if (withoutAttributes.includes('[') || withoutAttributes.includes(']')) {
      pushUnsupportedSelector(rule, diagnostics, 'Attribute selectors must use [name] or [name="value"] syntax.')
    }

    let partMatch: RegExpExecArray | null
    PART_SELECTOR_PATTERN.lastIndex = 0
    while ((partMatch = PART_SELECTOR_PATTERN.exec(selector))) {
      const component = findNativeUiComponent(partMatch[1])
      if (!component || !(component.styleParts || []).includes(partMatch[2])) {
        diagnostics.push({
          code: 'QSS_UNKNOWN_ELEMENT',
          message: `Style part "${partMatch[2]}" is not declared by component "${partMatch[1]}".`,
          range: rule.selectorRange,
          severity: 'error',
          source: 'qss',
        })
      }
    }

    let pseudoMatch: RegExpExecArray | null
    PSEUDO_PATTERN.lastIndex = 0
    while ((pseudoMatch = PSEUDO_PATTERN.exec(selector))) {
      if (!(nativeQssPseudoStates as readonly string[]).includes(pseudoMatch[1])) {
        pushUnsupportedSelector(rule, diagnostics, `Pseudo-state :${pseudoMatch[1]} is not supported.`)
      }
    }

    const depth = selector
      .replace(/\[[^\]]*\]/g, '')
      .replace(/::part\([^)]+\)/g, '')
      .split(/\s+|>/)
      .map(part => part.trim())
      .filter(Boolean)
      .length
    if (depth > maxDepth) {
      diagnostics.push({
        code: 'QSS_COMPLEXITY_LIMIT_EXCEEDED',
        message: `Selector depth ${depth} exceeds the native QSS limit of ${maxDepth}.`,
        range: rule.selectorRange,
        severity: 'error',
        source: 'qss',
      })
    }

    if (options.lint?.strictComponents) {
      for (const match of selector.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) {
        if (!findNativeUiComponent(match[1])) {
          diagnostics.push({
            code: 'QSS_UNKNOWN_ELEMENT',
            message: `Component selector "${match[1]}" is not registered.`,
            range: rule.selectorRange,
            severity: 'warning',
            source: 'qss',
          })
        }
      }
    }
  }
}

function validateDeclaration(
  declaration: NativeQssDeclaration,
  diagnostics: NativeUiDiagnostic[],
  options: NativeUiLanguageOptions,
): void {
  const property = findNativeQssProperty(declaration.name)
  if (!property) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_PROPERTY',
      message: `Property "${declaration.name}" is not part of the native QSS subset.`,
      range: declaration.nameRange,
      severity: 'error',
      source: 'qss',
    })
    return
  }

  if (!property.nativeWgpu && !options.lint?.allowPreviewFeatures) {
    diagnostics.push({
      code: 'QSS_TARGET_UNSUPPORTED_FEATURE',
      message: `Property "${declaration.name}" is planned for ${property.phase.toUpperCase()} but is not supported by current native-wgpu UI surface capabilities.`,
      range: declaration.nameRange,
      severity: 'error',
      source: 'qss',
    })
  }

  const unsupportedUnits = Array.from(declaration.value.matchAll(UNSUPPORTED_UNIT_PATTERN))
  for (const unit of unsupportedUnits) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_UNIT',
      message: `Unit "${unit[1]}" is not supported by native QSS; use logical px, %, fr, or unitless values.`,
      range: declaration.valueRange,
      severity: 'error',
      source: 'qss',
    })
  }

  const hasUnsupportedBrowserValue = /\b(?:url|var|env)\s*\(/i.test(declaration.value) || /https?:\/\//i.test(declaration.value)
  if (hasUnsupportedBrowserValue) {
    diagnostics.push({
      code: 'QSS_UNSUPPORTED_VALUE',
      message: 'Native QSS values must use token(...) and asset("...") instead of browser url(...), var(...), env(...), or network references.',
      range: declaration.valueRange,
      severity: 'error',
      source: 'qss',
    })
  }

  const hasUnsupportedUnits = unsupportedUnits.length > 0
  if (property.nativeWgpu && !hasUnsupportedBrowserValue && !hasUnsupportedUnits) {
    const message = validateNativeWgpuDeclarationValue(declaration)
    if (message) {
      diagnostics.push({
        code: 'QSS_INVALID_VALUE',
        message,
        range: declaration.valueRange,
        severity: 'error',
        source: 'qss',
      })
    }
  }
}

function validateNativeWgpuDeclarationValue(declaration: NativeQssDeclaration): string | undefined {
  const value = declaration.value.trim()
  switch (declaration.name) {
    case 'background-image':
      return parseNativeQssBackgroundImage(value)
        ? undefined
        : 'background-image must use package-relative asset("path") or asset("path", "asset-kind") references.'
    case 'background-position':
      return parseNativeQssBackgroundPosition(value)
        ? undefined
        : 'background-position supports left/center/right, top/center/bottom, and 0%..100% one- or two-axis origins.'
    case 'background-size':
    case 'object-fit':
      return parseNativeQssObjectFit(value)
        ? undefined
        : `${declaration.name} supports cover, contain, fill, none, or scale-down.`
    case 'border-style':
      return parseNativeQssBorderStyle(value)
        ? undefined
        : 'border-style supports solid or none.'
    case 'border-radius':
    case 'border-width':
    case 'font-size':
    case 'height':
    case 'line-height':
    case 'width':
      return parseNativeQssLogicalNumber(value) !== undefined
        ? undefined
        : `${declaration.name} must be a non-negative logical px or unitless number.`
    case 'left':
    case 'top':
      return parseNativeQssCoordinateNumber(value) !== undefined
        ? undefined
        : `${declaration.name} must be a finite logical px or unitless coordinate.`
    case 'display':
      return parseNativeQssDisplay(value) !== undefined
        ? undefined
        : 'display currently supports none only.'
    case 'font-family':
      return parseNativeQssFontFamilyList(value)
        ? undefined
        : 'font-family must include at least one font family name.'
    case 'font-weight':
      return parseNativeQssFontWeight(value) !== undefined
        ? undefined
        : 'font-weight must be normal, bold, or an integer weight.'
    case 'opacity':
      return parseNativeQssOpacity(value) !== undefined
        ? undefined
        : 'opacity must be a finite number; native projection clamps it to 0..1.'
    case 'overflow':
      return parseNativeQssOverflow(value) !== undefined
        ? undefined
        : 'overflow supports visible or hidden.'
    case 'padding':
      return parseNativeQssEdgeInsets(value) !== undefined
        ? undefined
        : 'padding supports one to four non-negative logical px or unitless numbers.'
    case 'padding-bottom':
    case 'padding-left':
    case 'padding-right':
    case 'padding-top':
      return parseNativeQssLogicalNumber(value) !== undefined
        ? undefined
        : `${declaration.name} must be a non-negative logical px or unitless number.`
    case 'text-align':
      return parseNativeQssTextAlign(value)
        ? undefined
        : 'text-align supports left, center, right, or justify.'
    case 'visibility':
      return parseNativeQssVisibility(value) !== undefined
        ? undefined
        : 'visibility supports visible or hidden.'
    case 'z-index':
      return parseNativeQssInteger(value) !== undefined
        ? undefined
        : 'z-index must be a safe integer.'
    default:
      return undefined
  }
}

function pushUnsupportedSelector(
  rule: NativeQssRule,
  diagnostics: NativeUiDiagnostic[],
  message: string,
): void {
  diagnostics.push({
    code: 'QSS_UNSUPPORTED_SELECTOR',
    message,
    range: rule.selectorRange,
    severity: 'error',
    source: 'qss',
  })
}

function skipWhitespace(masked: string, offset: number, end: number): number {
  while (offset < end && /\s/.test(masked[offset]))
    offset += 1
  return offset
}

function normalizeQssLine(line: string): string {
  return line
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*;\s*$/g, ';')
    .trim()
}
