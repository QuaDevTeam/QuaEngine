import type { DecoratorArgumentLanguageContribution, LanguageCompletionValue } from '@quajs/plugin-discovery'
import type { QuaScriptDiagnostic } from '@quajs/script-compiler'
import { existsSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDiscoveredDecoratorMappings, getDiscoveredLanguageContributions } from '@quajs/plugin-discovery'
import {
  DEFAULT_DECORATOR_MAPPINGS,
  parseQuaScriptDocument,
  QuaScriptParser,
} from '@quajs/script-compiler'
import ts from 'typescript'
import {
  collectQuaScriptTypeScriptDiagnostics,
  createQuaScriptTypeScriptContext,
  getTypeScriptCompletionsAtSourcePosition,
  getTypeScriptDefinitionsAtSourcePosition,
  getTypeScriptHoverAtSourcePosition,
} from './typescript-service'
import { createQuaScriptVirtualDocument } from './virtual'

export type { QuaScriptDefinition, QuaScriptHover } from './typescript-service'
export {
  createQuaScriptVirtualDocument,
  mapSourceOffsetToVirtualOffset,
  mapVirtualOffsetToSourceOffset,
  mapVirtualRangeToSourceRange,
} from './virtual'

export interface QuaScriptLanguagePosition {
  character: number
  line: number
}

export type QuaScriptCompletionKind
  = 'asset'
    | 'character'
    | 'class'
    | 'decorator'
    | 'enum'
    | 'function'
    | 'interface'
    | 'keyword'
    | 'method'
    | 'module'
    | 'property'
    | 'type'
    | 'value'
    | 'variable'

export interface QuaScriptCompletionItem {
  detail?: string
  insertText?: string
  kind: QuaScriptCompletionKind
  label: string
  sortText?: string
}

export interface QuaScriptLanguageOptions {
  extraFiles?: Record<string, string>
  filePath?: string
  projectRoot?: string
}

export interface QuaScriptAnalysis {
  characters: string[]
  diagnostics: QuaScriptDiagnostic[]
  setupVariables: string[]
  virtualTypeScript: string
}

export async function analyzeQuaScript(source: string, options: QuaScriptLanguageOptions = {}): Promise<QuaScriptAnalysis> {
  const document = parseQuaScriptDocument(source)

  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  let diagnostics: QuaScriptDiagnostic[] = []
  let virtualTypeScript = createQuaScriptVirtualDocument(source, options).text
  try {
    const context = createQuaScriptTypeScriptContext(source, options)
    virtualTypeScript = context.virtualDocument.text
    diagnostics = [
      ...context.virtualDocument.diagnostics,
      ...collectQuaScriptTypeScriptDiagnostics(context),
    ]
  }
  catch (error) {
    diagnostics.push({
      message: error instanceof Error ? error.message : String(error),
      severity: 'error',
    })
  }

  return {
    characters: [...parsed.characters],
    diagnostics,
    setupVariables: collectSetupVariables(document.setupScript?.content || '', document.moduleScript?.content || ''),
    virtualTypeScript,
  }
}

export async function getQuaScriptCompletions(
  source: string,
  position: QuaScriptLanguagePosition,
  options: QuaScriptLanguageOptions = {},
): Promise<QuaScriptCompletionItem[]> {
  const lines = source.split(/\r?\n/)
  const line = lines[position.line] || ''
  const beforeCursor = line.slice(0, position.character)

  if (isDecoratorContext(beforeCursor)) {
    return getDecoratorCompletions(options.projectRoot)
  }

  if (isSpeakerContext(beforeCursor)) {
    const analysis = await analyzeQuaScript(source, options)
    return [
      ...new Set([
        ...analysis.characters,
        ...readCharacterNamesFromAssets(options.projectRoot),
      ]),
    ].map(label => ({
      label,
      kind: 'character' as const,
      detail: 'QuaScript character',
    }))
  }

  const decoratorArgumentCompletions = await getDecoratorArgumentCompletions(source, position, options)
  const context = createQuaScriptTypeScriptContext(source, options)
  const tsCompletions = getTypeScriptCompletionsAtSourcePosition(context, position)
  if (tsCompletions) {
    return uniqueCompletions([
      ...decoratorArgumentCompletions,
      ...tsCompletions.entries.map(entry => ({
        detail: entry.kind,
        insertText: entry.insertText,
        kind: mapTypeScriptCompletionKind(entry.kind),
        label: entry.name,
        sortText: entry.sortText,
      })),
    ])
  }

  if (decoratorArgumentCompletions.length > 0) {
    return decoratorArgumentCompletions
  }

  if (isExpressionContext(line, position.character)) {
    return getVariableCompletions(source)
  }

  return []
}

export function createQuaScriptVirtualTypeScript(source: string, options: QuaScriptLanguageOptions = {}): string {
  return createQuaScriptVirtualDocument(source, options).text
}

export async function getQuaScriptHover(
  source: string,
  position: QuaScriptLanguagePosition,
  options: QuaScriptLanguageOptions = {},
) {
  const line = source.split(/\r?\n/)[position.line] || ''
  const decoratorName = getDecoratorNameAtPosition(line, position.character)
  if (decoratorName) {
    const mappings = await getDecoratorMappings(options.projectRoot)
    const mapping = mappings[decoratorName]
    if (mapping) {
      return {
        contents: `QuaScript decorator \`@${decoratorName}\`\n\nLowers to \`${mapping.function}\` from \`${mapping.module}\`.`,
      }
    }
  }

  const context = createQuaScriptTypeScriptContext(source, options)
  return getTypeScriptHoverAtSourcePosition(context, position)
}

export function getQuaScriptDefinitions(
  source: string,
  position: QuaScriptLanguagePosition,
  options: QuaScriptLanguageOptions = {},
) {
  const context = createQuaScriptTypeScriptContext(source, options)
  return getTypeScriptDefinitionsAtSourcePosition(context, position)
}

async function getDecoratorCompletions(projectRoot?: string): Promise<QuaScriptCompletionItem[]> {
  const mappings = await getDecoratorMappings(projectRoot)
  return Object.keys(mappings)
    .sort()
    .map(label => ({
      label,
      kind: 'decorator' as const,
      detail: 'QuaScript decorator',
    }))
}

async function getDecoratorArgumentCompletions(
  source: string,
  position: QuaScriptLanguagePosition,
  options: QuaScriptLanguageOptions,
): Promise<QuaScriptCompletionItem[]> {
  const context = getDecoratorArgumentContext(source, position)
  if (!context) {
    return []
  }

  const language = await getDiscoveredLanguageContributions(options.projectRoot)
  const contribution = language.decorators?.[context.decoratorName]
  const arg = contribution?.args?.[context.argumentIndex]
  if (!arg) {
    return []
  }

  const completions: QuaScriptCompletionItem[] = [
    ...completionValuesToItems(arg.values, context.insideString),
    ...assetContributionToItems(arg, options.projectRoot, context.insideString),
  ]

  if (arg.characterNames) {
    completions.push(...readCharacterNames(source, options.projectRoot).map(label => ({
      detail: arg.detail || 'QuaScript character',
      insertText: context.insideString ? label : JSON.stringify(label),
      kind: 'character' as const,
      label,
    })))
  }

  return uniqueCompletions(completions)
}

async function getDecoratorMappings(projectRoot?: string) {
  const discovered = await getDiscoveredDecoratorMappings(projectRoot)
  return {
    ...DEFAULT_DECORATOR_MAPPINGS,
    ...discovered,
  }
}

function completionValuesToItems(
  values: DecoratorArgumentLanguageContribution['values'],
  insideString: boolean,
): QuaScriptCompletionItem[] {
  return (values || []).map((value) => {
    const normalized = normalizeCompletionValue(value)
    return {
      detail: normalized.detail,
      insertText: normalized.insertText || (insideString ? normalized.label : JSON.stringify(normalized.label)),
      kind: 'value' as const,
      label: normalized.label,
    }
  })
}

function assetContributionToItems(
  contribution: DecoratorArgumentLanguageContribution,
  projectRoot: string | undefined,
  insideString: boolean,
): QuaScriptCompletionItem[] {
  if (!projectRoot || !contribution.assetRoots) {
    return []
  }

  const extensions = new Set((contribution.assetExtensions || []).map(extension => extension.toLowerCase()))
  return contribution.assetRoots.flatMap((assetRoot) => {
    const root = join(projectRoot, assetRoot)
    return listAssetFiles(root)
      .filter(filePath => extensions.size === 0 || extensions.has(extname(filePath).toLowerCase()))
      .map((filePath) => {
        const label = relative(root, filePath).replace(/\\/g, '/')
        return {
          detail: contribution.detail || assetRoot,
          insertText: insideString ? label : JSON.stringify(label),
          kind: 'asset' as const,
          label,
        }
      })
  })
}

function normalizeCompletionValue(value: string | LanguageCompletionValue): LanguageCompletionValue {
  return typeof value === 'string'
    ? { label: value }
    : value
}

function getVariableCompletions(source: string): QuaScriptCompletionItem[] {
  const document = parseQuaScriptDocument(source)
  return [...new Set([
    'scope',
    ...collectSetupVariables(document.setupScript?.content || '', document.moduleScript?.content || ''),
  ])]
    .sort()
    .map(label => ({
      label,
      kind: 'variable' as const,
      detail: 'TypeScript binding',
    }))
}

function collectSetupVariables(setupScript: string, moduleScript: string): string[] {
  const source = `${moduleScript}\n${setupScript}`
  const names = new Set<string>()
  const patterns = [
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\bimport\s+([A-Za-z_$][\w$]*)\s+from\b/g,
    /\bimport\s*\{([^}]+)\}\s*from\b/g,
  ]

  for (const pattern of patterns) {
    let match = pattern.exec(source)
    while (match) {
      if (match[1].includes(',')) {
        match[1].split(',').forEach((name) => {
          const normalized = name.trim().split(/\s+as\s+/).pop()
          if (normalized) {
            names.add(normalized)
          }
        })
      }
      else {
        names.add(match[1].trim())
      }
      match = pattern.exec(source)
    }
  }

  return [...names]
}

function readCharacterNamesFromAssets(projectRoot?: string): string[] {
  if (!projectRoot) {
    return []
  }

  const charactersPath = join(projectRoot, 'assets', 'characters')
  if (!existsSync(charactersPath)) {
    return []
  }

  return readdirSync(charactersPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

function readCharacterNames(source: string, projectRoot?: string): string[] {
  const parsed = new QuaScriptParser().parse(parseQuaScriptDocument(source).dslBody)
  return [
    ...new Set([
      ...parsed.characters,
      ...readCharacterNamesFromAssets(projectRoot),
    ]),
  ]
}

function listAssetFiles(root: string): string[] {
  if (!existsSync(root)) {
    return []
  }

  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      return listAssetFiles(path)
    }
    return entry.isFile() ? [path] : []
  })
}

function isDecoratorContext(beforeCursor: string): boolean {
  return /^\s*@[\w$]*$/.test(beforeCursor)
}

function isSpeakerContext(beforeCursor: string): boolean {
  return beforeCursor.trim().length > 0
    && !beforeCursor.includes(':')
    && !beforeCursor.trimStart().startsWith('-')
    && !beforeCursor.trimStart().startsWith('@')
    && !beforeCursor.includes('<script')
}

function isExpressionContext(line: string, character: number): boolean {
  const before = line.slice(0, character)
  const lastOpen = before.lastIndexOf('${')
  const lastClose = before.lastIndexOf('}')
  if (lastOpen > lastClose) {
    return true
  }

  return /\sif\s[\s\S]*$/.test(before)
}

function getDecoratorNameAtPosition(line: string, character: number): string | undefined {
  const match = line.match(/^(\s*)@([a-z_$][\w$]*)/i)
  if (!match) {
    return undefined
  }

  const start = match[1].length + 1
  const end = start + match[2].length
  return character >= start && character <= end ? match[2] : undefined
}

function getDecoratorArgumentContext(source: string, position: QuaScriptLanguagePosition): {
  argumentIndex: number
  decoratorName: string
  insideString: boolean
} | undefined {
  const line = source.split(/\r?\n/)[position.line] || ''
  const beforeCursor = line.slice(0, position.character)
  const match = beforeCursor.match(/^\s*@([a-z_$][\w$]*)\s*\(/i)
  if (!match) {
    return undefined
  }

  const openIndex = beforeCursor.indexOf('(', match[0].indexOf(match[1]) + match[1].length)
  if (openIndex === -1) {
    return undefined
  }

  const argsBeforeCursor = beforeCursor.slice(openIndex + 1)
  if (hasClosedDecoratorArguments(argsBeforeCursor)) {
    return undefined
  }

  return {
    argumentIndex: countTopLevelCommas(argsBeforeCursor),
    decoratorName: match[1],
    insideString: isInsideString(argsBeforeCursor),
  }
}

function hasClosedDecoratorArguments(source: string): boolean {
  let depth = 0
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (const char of source) {
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      depth++
      continue
    }
    if (char === ')' && depth === 0) {
      return true
    }
    if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
    }
  }

  return false
}

function countTopLevelCommas(source: string): number {
  let count = 0
  let depth = 0
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (const char of source) {
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      depth++
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (char === ',' && depth === 0) {
      count++
    }
  }

  return count
}

function isInsideString(source: string): boolean {
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (const char of source) {
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
    }
  }

  return quote !== null
}

function uniqueCompletions(items: QuaScriptCompletionItem[]): QuaScriptCompletionItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.label)) {
      return false
    }
    seen.add(item.label)
    return true
  })
}

function mapTypeScriptCompletionKind(kind: string): QuaScriptCompletionKind {
  switch (kind) {
    case ts.ScriptElementKind.classElement:
      return 'class'
    case ts.ScriptElementKind.enumElement:
      return 'enum'
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
    case ts.ScriptElementKind.constructSignatureElement:
    case ts.ScriptElementKind.callSignatureElement:
      return 'function'
    case ts.ScriptElementKind.interfaceElement:
      return 'interface'
    case ts.ScriptElementKind.keyword:
      return 'keyword'
    case ts.ScriptElementKind.memberFunctionElement:
      return 'method'
    case ts.ScriptElementKind.moduleElement:
      return 'module'
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
      return 'property'
    case ts.ScriptElementKind.typeElement:
      return 'type'
    default:
      return 'variable'
  }
}

export function uriToFilePath(uri: string): string | undefined {
  if (!uri.startsWith('file:')) {
    return undefined
  }
  return fileURLToPath(uri)
}
