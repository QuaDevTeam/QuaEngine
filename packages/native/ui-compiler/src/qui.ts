import type {
  NativeQuiDocument,
  NativeQuiImport,
  NativeQuiNode,
  NativeQuiProp,
  NativeUiCompletionItem,
  NativeUiDiagnostic,
  NativeUiHover,
  NativeUiLanguageOptions,
} from './types'
import {
  findNativeUiComponent,
  nativeQuiDirectiveNames,
  nativeUiComponents,
} from './registry'
import {
  collectBalancedDelimiterDiagnostics,
  createLineStarts,
  findMatchingDelimiter,
  maskSourceLiterals,
  rangeFromOffsets,
  splitTopLevel,
  wordAt,
} from './source'

const IMPORT_PATTERN = /^\s*import\s+(style|tokens|component)\s+(['"])([^'"]+)\2\s*;?\s*$/
const IMPORT_START_PATTERN = /^\s*import\b/
const COMPONENT_PATTERN = /\b([A-Z][A-Za-z0-9_]*)\b(?=\s*(?:[.{(]|$))/g
const NODE_CLASS_PATTERN = /^([A-Z][A-Za-z0-9_]*)(\.[A-Za-z_][\w-]*)+/
const PROP_NAME_PATTERN = /^\s*([A-Za-z_][\w-]*)(?:\s*:([\s\S]*))?$/
const IDENTIFIER_PATTERN_SOURCE = String.raw`[A-Za-z_$][\w$]*`
const FOR_SOURCE_PATTERN_SOURCE = String.raw`[\w$.[\]?.]+(?:\s*\?\?\s*[\w$.[\]?.]+)?`
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
const ACTION_PATTERN = /^\s*(?:ui|choice|save|settings)\.[A-Za-z_$][\w$]*\s*\(/
const UNSAFE_EXPRESSION_PATTERNS = [
  { pattern: /\b(?:await|new|function|class|throw|return|yield)\b/, reason: 'imperative JavaScript is not allowed in QUI expressions' },
  { pattern: /=>/, reason: 'function expressions are not allowed in QUI expressions' },
  { pattern: /(?:^|[^=!<>])=(?:[^=]|$)/, reason: 'assignments are not allowed in QUI expressions' },
  { pattern: /(?:\+\+|--|\+=|-=|\*=|\/=)/, reason: 'mutation operators are not allowed in QUI expressions' },
] as const

export function analyzeQuiSource(source: string, options: NativeUiLanguageOptions = {}): NativeQuiDocument {
  const lineStarts = createLineStarts(source)
  const masked = maskSourceLiterals(source)
  const diagnostics = [
    ...collectBalancedDelimiterDiagnostics(source, lineStarts, 'qui'),
  ]
  const imports = collectQuiImports(source, lineStarts, diagnostics)
  const nodes = collectQuiNodes(source, masked, lineStarts)
  const props = collectQuiProps(source, masked, lineStarts)

  validateQuiProps(props, diagnostics)
  validateQuiImports(imports, diagnostics)

  if (options.lint?.strictComponents) {
    const imported = new Set(inferImportedComponentNames(imports))
    for (const node of nodes) {
      if (!findNativeUiComponent(node.name) && !imported.has(node.name)) {
        diagnostics.push({
          code: 'QUI_UNKNOWN_COMPONENT',
          message: `Component "${node.name}" is not registered or imported.`,
          range: node.nameRange,
          severity: 'warning',
          source: 'qui',
        })
      }
    }
  }

  return {
    kind: 'qui',
    source,
    imports,
    nodes,
    props,
    diagnostics,
  }
}

export function formatQuiSource(source: string, options: NativeUiLanguageOptions = {}): string {
  const indent = ' '.repeat(options.format?.indentSize ?? 2)
  const masked = maskSourceLiterals(source)
  const lines = source.split(/\r?\n/)
  const maskedLines = masked.split(/\r?\n/)
  const output: string[] = []
  let level = 0
  let blankLines = 0

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const trimmed = raw.trim()
    const maskedLine = maskedLines[index] || ''

    if (!trimmed) {
      blankLines += 1
      if (blankLines <= 1 && output.length > 0)
        output.push('')
      continue
    }
    blankLines = 0

    if (/^[}\])]/.test(trimmed))
      level = Math.max(0, level - 1)

    output.push(`${indent.repeat(level)}${normalizeQuiLine(trimmed)}`)

    const opens = count(maskedLine, '{')
    const closes = count(maskedLine, '}')
    level = Math.max(0, level + opens - closes)
  }

  const formatted = output.join('\n').replace(/\n{3,}/g, '\n\n')
  return options.format?.insertFinalNewline === false ? formatted : `${formatted.replace(/\n+$/, '')}\n`
}

export function getQuiCompletions(
  source: string,
  offset: number,
): NativeUiCompletionItem[] {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const beforeCursor = source.slice(lineStart, offset)

  if (/^\s*import\s*$/.test(beforeCursor)) {
    return [
      completion('style', 'import', 'Import a .qss style sheet.', 'style "$1";'),
      completion('tokens', 'import', 'Import a token table JSON asset.', 'tokens "$1";'),
      completion('component', 'import', 'Import a package-local .qui component.', 'component "$1";'),
    ]
  }

  if (/\(\s*[\w-]*$/.test(beforeCursor) || /,\s*[\w-]*$/.test(beforeCursor)) {
    return nativeQuiDirectiveNames.map((name, index) =>
      completion(name, 'directive', 'QUI directive or common prop.', name === 'else' ? 'else' : `${name}: `, `1${index.toString().padStart(2, '0')}`))
  }

  return [
    completion('slot', 'slot', 'Declare a named slot.', 'slot ${1:header} {\n  $0\n}'),
    ...nativeUiComponents.map((component, index) =>
      completion(component.name, 'component', component.description, `${component.name} {\n  $0\n}`, `2${index.toString().padStart(2, '0')}`)),
  ]
}

export function getQuiHover(source: string, offset: number): NativeUiHover | undefined {
  const word = wordAt(source, offset)
  if (!word)
    return undefined

  const component = findNativeUiComponent(word.text)
  if (component) {
    const parts = component.styleParts?.length
      ? `\n\nStyle parts: ${component.styleParts.join(', ')}`
      : ''
    return {
      contents: `**${component.name}** (${component.kind})\n\n${component.description}${parts}`,
    }
  }

  if ((nativeQuiDirectiveNames as readonly string[]).includes(word.text)) {
    return {
      contents: `**${word.text}**\n\nQUI directive handled by the native UI compiler.`,
    }
  }

  return undefined
}

function collectQuiImports(
  source: string,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): NativeQuiImport[] {
  const imports: NativeQuiImport[] = []
  const lines = source.split(/\r?\n/)
  let offset = 0

  for (const line of lines) {
    const match = IMPORT_PATTERN.exec(line)
    if (match) {
      const pathStartInLine = line.indexOf(match[3])
      imports.push({
        kind: match[1] as NativeQuiImport['kind'],
        path: match[3],
        pathRange: rangeFromOffsets(lineStarts, offset + pathStartInLine, offset + pathStartInLine + match[3].length),
        range: rangeFromOffsets(lineStarts, offset, offset + line.length),
      })
    }
    else if (IMPORT_START_PATTERN.test(line)) {
      diagnostics.push({
        code: 'QUI_INVALID_IMPORT',
        message: 'QUI imports must use import style|tokens|component "./path"; syntax.',
        range: rangeFromOffsets(lineStarts, offset, offset + line.length),
        severity: 'error',
        source: 'qui',
      })
    }
    offset += line.length + 1
  }

  return imports
}

function collectQuiNodes(
  source: string,
  masked: string,
  lineStarts: readonly number[],
): NativeQuiNode[] {
  const nodes: NativeQuiNode[] = []
  const seen = new Set<number>()
  let match: RegExpExecArray | null

  while ((match = COMPONENT_PATTERN.exec(masked))) {
    const start = match.index
    if (seen.has(start))
      continue
    seen.add(start)

    const classMatch = NODE_CLASS_PATTERN.exec(source.slice(start, Math.min(source.length, start + 120)))
    nodes.push({
      name: match[1],
      classes: classMatch
        ? classMatch[0].split('.').slice(1)
        : [],
      nameRange: rangeFromOffsets(lineStarts, start, start + match[1].length),
      range: rangeFromOffsets(lineStarts, start, start + (classMatch?.[0].length || match[1].length)),
    })
  }

  return nodes
}

function collectQuiProps(
  source: string,
  masked: string,
  lineStarts: readonly number[],
): NativeQuiProp[] {
  const props: NativeQuiProp[] = []
  let groupId = 0
  for (let offset = 0; offset < masked.length; offset += 1) {
    if (masked[offset] !== '(')
      continue
    const close = findMatchingDelimiter(masked, offset, '(', ')')
    if (close === -1)
      continue
    const currentGroupId = groupId
    groupId += 1
    const bodyStart = offset + 1
    const body = source.slice(bodyStart, close)
    for (const part of splitTopLevel(body, ',')) {
      const raw = part.text
      if (!raw.trim())
        continue
      const match = PROP_NAME_PATTERN.exec(raw)
      if (!match)
        continue
      const nameStart = bodyStart + part.start + raw.indexOf(match[1])
      const value = match[2]?.trim()
      const valueStartInRaw = match[2] ? raw.indexOf(match[2]) : -1
      props.push({
        groupId: currentGroupId,
        name: match[1],
        value,
        nameRange: rangeFromOffsets(lineStarts, nameStart, nameStart + match[1].length),
        valueRange: value && valueStartInRaw >= 0
          ? rangeFromOffsets(lineStarts, bodyStart + part.start + valueStartInRaw, bodyStart + part.start + valueStartInRaw + match[2].length)
          : undefined,
        range: rangeFromOffsets(lineStarts, bodyStart + part.start, bodyStart + part.end),
      })
    }
    offset = close
  }
  return props
}

function validateQuiImports(imports: readonly NativeQuiImport[], diagnostics: NativeUiDiagnostic[]): void {
  for (const item of imports) {
    if (/^(?:[a-z]+:)?\/\//i.test(item.path) || item.path.startsWith('/')) {
      diagnostics.push({
        code: 'QUI_UNSAFE_IMPORT',
        message: 'QUI imports must be package-local relative paths, not URLs or absolute paths.',
        range: item.pathRange,
        severity: 'error',
        source: 'qui',
      })
    }
    const extension = item.path.split('.').pop()
    const expected = item.kind === 'style' ? 'qss' : item.kind === 'tokens' ? 'json' : 'qui'
    if (extension !== expected) {
      diagnostics.push({
        code: 'QUI_IMPORT_EXTENSION_MISMATCH',
        message: `import ${item.kind} expects a .${expected} file.`,
        range: item.pathRange,
        severity: 'warning',
        source: 'qui',
      })
    }
  }
}

function validateQuiProps(props: readonly NativeQuiProp[], diagnostics: NativeUiDiagnostic[]): void {
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

  validateQuiPropGroups(props, diagnostics)
}

function validateQuiPropGroups(props: readonly NativeQuiProp[], diagnostics: NativeUiDiagnostic[]): void {
  const groups = new Map<number, NativeQuiProp[]>()
  for (const prop of props) {
    if (prop.groupId === undefined)
      continue
    const group = groups.get(prop.groupId) || []
    groups.set(prop.groupId, [...group, prop])
  }

  for (const group of groups.values()) {
    const forProp = group.find(prop => prop.name === 'for' && prop.value && FOR_PATTERN.test(prop.value))
    if (!forProp)
      continue
    const hasKey = group.some(prop => prop.name === 'key' && prop.value)
    if (hasKey)
      continue

    diagnostics.push({
      code: 'QUI_LOOP_KEY_MISSING',
      message: 'Loop-rendered QUI nodes must declare a stable key directive.',
      range: forProp.range,
      severity: 'error',
      source: 'qui',
    })
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

  if (prop.name !== 'action' && /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\(/.test(value)) {
    diagnostics.push({
      code: 'QUI_UNSAFE_EXPRESSION',
      message: 'Function calls are not allowed outside declarative action descriptors.',
      range: prop.valueRange,
      severity: 'error',
      source: 'qui',
    })
  }

  if (prop.name === 'action' && !ACTION_PATTERN.test(value)) {
    diagnostics.push({
      code: 'QUI_INVALID_ACTION_DESCRIPTOR',
      message: 'Actions must use declarative ui.*, choice.*, save.*, or settings.* descriptors.',
      range: prop.valueRange,
      severity: 'error',
      source: 'qui',
    })
  }
}

function inferImportedComponentNames(imports: readonly NativeQuiImport[]): string[] {
  return imports
    .filter(item => item.kind === 'component')
    .map((item) => {
      const basename = item.path.split('/').pop() || ''
      return basename.replace(/\.qui$/, '')
    })
    .filter(Boolean)
}

function normalizeQuiLine(line: string): string {
  return line
    .replace(/\s+\{/g, ' {')
    .replace(/\{\s+/g, '{ ')
    .replace(/\s+\}/g, ' }')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/,\s*/g, ', ')
    .replace(/\s*:\s*/g, ': ')
    .trim()
}

function completion(
  label: string,
  kind: NativeUiCompletionItem['kind'],
  detail: string,
  insertText?: string,
  sortText?: string,
): NativeUiCompletionItem {
  return {
    label,
    kind,
    detail,
    insertText,
    sortText,
  }
}

function count(text: string, char: string): number {
  return Array.from(text).filter(item => item === char).length
}
