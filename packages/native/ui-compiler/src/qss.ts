import type {
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
  collectBalancedDelimiterDiagnostics,
  createLineStarts,
  maskSourceLiterals,
  wordAt,
} from './source'
import { parseQssItems } from './qss-parser'
import {
  validateAtRule,
  validateDeclaration,
  validateSelector,
} from './qss-validation'

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

function normalizeQssLine(line: string): string {
  return line
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*;\s*$/g, ';')
    .trim()
}
