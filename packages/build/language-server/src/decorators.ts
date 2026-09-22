import type { DecoratorLanguageContribution } from '@quajs/plugin-discovery'
import type { DecoratorMapping, SourceRange } from '@quajs/script-compiler'
import type { QuaScriptLanguageOptions, QuaScriptLanguagePosition } from './index'
import { getDiscoveredLanguageContributions } from '@quajs/plugin-discovery'
import { DEFAULT_DECORATOR_MAPPINGS, loadProjectDecoratorMappingsSync, parseQuaScriptDocument, resolveBaseDecoratorMappings, resolveDecoratorMappingsForModuleSource } from '@quajs/script-compiler'
import ts from 'typescript'
import { builtinDecoratorLanguage } from './builtin-decorator-language'
import { createQuaScriptTypeScriptContext, mapDefinition } from './typescript-service'
import { createQuaScriptVirtualDocument, sourcePositionToOffset, sourceRangeFromOffsets } from './virtual'

export interface DecoratorOccurrence {
  name: string
  start: number
  nameEnd: number
  end: number
  open?: number
  close?: number
  commas: number[]
  strings: { start: number, end: number, closed: boolean }[]
}

/** Tolerant lexical index, including unfinished calls. Script blocks are masked by the compiler. */
export function decoratorOccurrences(source: string): DecoratorOccurrence[] {
  const body = parseQuaScriptDocument(source).dslBody
  const result: DecoratorOccurrence[] = []
  const lines = /[^\r\n]+/g
  let covered = 0
  let blockComment = false
  for (const line of body.matchAll(lines)) {
    const start = line.index!
    if (start < covered)
      continue
    const trimmed = line[0].trimStart()
    if (blockComment) {
      blockComment = !trimmed.includes('*/')
      continue
    }
    if (trimmed.startsWith('/*')) {
      blockComment = !trimmed.includes('*/', 2)
      continue
    }
    const match = /^\s*@([\w$]*)/.exec(line[0])
    if (!match)
      continue
    const nameStart = start + match[0].indexOf('@') + 1
    const nameEnd = nameStart + match[1].length
    const item: DecoratorOccurrence = { name: match[1], start: nameStart, nameEnd, end: nameEnd, commas: [], strings: [] }
    result.push(item)
    const open = nameEnd + (body.slice(nameEnd).match(/^[ \t]*/)?.[0].length || 0)
    if (body[open] !== '(')
      continue
    item.open = open
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, body)
    scanner.setTextPos(open + 1)
    const stack: ts.SyntaxKind[] = []
    item.end = body.length
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      const at = scanner.getTokenPos()
      if (token === ts.SyntaxKind.CloseParenToken && stack.length === 0) {
        item.close = at
        item.end = scanner.getTextPos()
        break
      }
      if (token === ts.SyntaxKind.CommaToken && stack.length === 0)
        item.commas.push(at)
      if (token === ts.SyntaxKind.StringLiteral || token === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
        const end = scanner.getTextPos()
        item.strings.push({ start: at, end, closed: !scanner.isUnterminated() })
      }
      if (token === ts.SyntaxKind.OpenParenToken || token === ts.SyntaxKind.OpenBracketToken || token === ts.SyntaxKind.OpenBraceToken || token === ts.SyntaxKind.TemplateHead) {
        stack.push(token)
      }
      else if (token === ts.SyntaxKind.CloseBraceToken && stack.at(-1) === ts.SyntaxKind.TemplateHead) {
        token = scanner.reScanTemplateToken(false)
        if (token === ts.SyntaxKind.TemplateTail)
          stack.pop()
      }
      else if (token === ts.SyntaxKind.CloseParenToken || token === ts.SyntaxKind.CloseBracketToken || token === ts.SyntaxKind.CloseBraceToken) {
        stack.pop()
      }
    }
    covered = item.end
  }
  return result
}

export function decoratorAt(source: string, position: QuaScriptLanguagePosition, args = false): DecoratorOccurrence | undefined {
  const offset = sourcePositionToOffset(source, position)
  return decoratorOccurrences(source).find(item => args
    ? item.open !== undefined && offset > item.open && offset <= (item.close ?? item.end)
    : offset >= item.start - 1 && offset <= item.nameEnd)
}

export function decoratorArgumentContext(source: string, position: QuaScriptLanguagePosition) {
  const item = decoratorAt(source, position, true)
  if (!item)
    return undefined
  const offset = sourcePositionToOffset(source, position)
  const string = item.strings.find(string => offset > string.start && offset <= string.end - (string.closed ? 1 : 0))
  const word = /[\w$]*$/.exec(source.slice(0, offset))![0]
  const suffix = /^[\w$]*/.exec(source.slice(offset))![0]
  return {
    decoratorName: item.name,
    argumentIndex: item.commas.filter(comma => comma < offset).length,
    insideString: Boolean(string),
    range: sourceRangeFromOffsets(source, string ? string.start + 1 : offset - word.length, string ? string.end - (string.closed ? 1 : 0) : offset + suffix.length),
  }
}

export function activeDecoratorMappings(source: string, options: QuaScriptLanguageOptions): DecoratorMapping {
  const resolution = {
    availableDecoratorMappings: loadProjectDecoratorMappingsSync(options.projectRoot),
    autoCollectDecorators: options.toolingConfig?.decorators?.autoCollect,
    decoratorMappings: options.toolingConfig?.decorators?.mappings,
  }
  try {
    return resolveDecoratorMappingsForModuleSource(parseQuaScriptDocument(source).moduleScript?.content || '', resolution)
  }
  catch { return resolveBaseDecoratorMappings(resolution) }
}

export async function decoratorIndex(source: string, options: QuaScriptLanguageOptions) {
  const mappings = activeDecoratorMappings(source, options)
  const language = await getDiscoveredLanguageContributions(options.projectRoot)
  return Object.entries(mappings).sort(([a], [b]) => a.localeCompare(b)).map(([name, mapping]) => ({
    name,
    mapping,
    // An explicit override must not inherit another provider's parameter contract.
    language: options.toolingConfig?.decorators?.mappings?.[name] ? undefined : language.decorators?.[name] ?? (mapping.module === DEFAULT_DECORATOR_MAPPINGS[name]?.module && mapping.function === DEFAULT_DECORATOR_MAPPINGS[name]?.function ? builtinDecoratorLanguage[name] : undefined),
  }))
}

export function decoratorSignature(name: string, language?: DecoratorLanguageContribution): string {
  return language?.args ? `@${name}(${language.args.map((arg, i) => arg.name || `arg${i + 1}`).join(', ')})` : `@${name}`
}

export interface QuaScriptSignatureHelp {
  signatures: { label: string, documentation?: string, parameters: { label: string, documentation?: string }[] }[]
  activeSignature: number
  activeParameter: number
}

export async function getQuaScriptSignatureHelp(source: string, position: QuaScriptLanguagePosition, options: QuaScriptLanguageOptions = {}): Promise<QuaScriptSignatureHelp | undefined> {
  const context = decoratorArgumentContext(source, position)
  if (!context)
    return undefined
  const entry = (await decoratorIndex(source, options)).find(entry => entry.name === context.decoratorName)
  if (!entry?.language?.args)
    return undefined
  return {
    signatures: [{
      label: decoratorSignature(entry.name, entry.language),
      documentation: entry.language.description,
      parameters: entry.language.args.map((arg, i) => ({ label: arg.name || `arg${i + 1}`, documentation: arg.detail })),
    }],
    activeSignature: 0,
    activeParameter: Math.min(context.argumentIndex, Math.max(0, entry.language.args.length - 1)),
  }
}

/** Resolve the compiler's actual binding with TS module/exports/path resolution, never execute it. */
export function decoratorBinding(source: string, mapping: DecoratorMapping[string], options: QuaScriptLanguageOptions) {
  const document = createQuaScriptVirtualDocument(source, options)
  const name = '__quaDecoratorDefinition'
  document.text += `\nimport { ${mapping.function} as ${name} } from ${JSON.stringify(mapping.module)};\n${name};\n`
  let offset = document.text.lastIndexOf(name)
  if (mapping.module === '@quajs/engine' && ['setFlowControlPolicy', 'resetFlowControlPolicy', 'createRollbackAnchor', 'markRollbackBoundary', 'fixRollback'].includes(mapping.function)) {
    document.text += `(null as unknown as import('@quajs/engine').QuaEngine).${mapping.function};\n`
    offset = document.text.lastIndexOf(mapping.function)
  }
  const context = createQuaScriptTypeScriptContext(source, options, document)
  try {
    const info = context.service.getQuickInfoAtPosition(context.fileName, offset)
    return {
      documentation: ts.displayPartsToString(info?.documentation),
      definitions: (context.service.getDefinitionAtPosition(context.fileName, offset) || [])
        .map(definition => mapDefinition(context, definition))
        .filter((definition): definition is { filePath?: string, range: SourceRange } => Boolean(definition)),
    }
  }
  finally { context.dispose() }
}
