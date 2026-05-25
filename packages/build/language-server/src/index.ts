import type { DecoratorArgumentLanguageContribution, LanguageCompletionValue } from '@quajs/plugin-discovery'
import type {
  DecoratorMapping,
  QuaScriptDiagnostic,
  QuaScriptLintResult,
  QuaScriptTextEdit,
  QuaScriptToolingConfig,
  SourceRange,
} from '@quajs/script-compiler'
import { existsSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDiscoveredLanguageContributions } from '@quajs/plugin-discovery'
import {
  applyQuaScriptLintRules,
  collectQuaScriptStyleDiagnostics,
  createPluginAwareTransformerAsync,
  createLineStarts,
  createQuaScriptLintResult,
  formatQuaScriptWithEdits,
  getQuaScriptFixAllEdits,
  loadProjectDecoratorMappings,
  parseQuaScriptDocument,
  rangeFromOffsets,
  QuaScriptParser,
  lintQuaScriptSource,
  resolveBaseDecoratorMappings,
  resolveDecoratorMappingsForModuleSource,
} from '@quajs/script-compiler'
import ts from 'typescript'
import {
  collectQuaScriptTypeScriptDiagnostics,
  createQuaScriptTypeScriptContext,
  getTypeScriptCompletionsAtSourcePosition,
  getTypeScriptDefinitionsAtSourcePosition,
  getTypeScriptHoverAtSourcePosition,
} from './typescript-service'
import { collectQuaScriptStoryDiagnostics, getQuaScriptStoryDefinitions, getQuaScriptStoryTargetCompletions } from './story-diagnostics'
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
  toolingConfig?: QuaScriptToolingConfig
}

export interface QuaScriptAnalysis {
  characters: string[]
  diagnostics: QuaScriptDiagnostic[]
  setupVariables: string[]
  virtualTypeScript: string
}

export interface QuaScriptCodeAction {
  title: string
  kind: 'quickfix' | 'refactor.rewrite' | 'source.fixAll.quascript'
  diagnostics?: QuaScriptDiagnostic[]
  edit: {
    edits: QuaScriptTextEdit[]
    range?: SourceRange
    newText?: string
  }
}

export interface QuaScriptCodeActionOptions {
  diagnostics?: readonly QuaScriptDiagnostic[]
  includeFixAll?: boolean
  includeLintFixes?: boolean
  toolingConfig?: QuaScriptToolingConfig
}

export async function analyzeQuaScript(source: string, options: QuaScriptLanguageOptions = {}): Promise<QuaScriptAnalysis> {
  const document = parseQuaScriptDocument(source)

  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  const lintEnabled = options.toolingConfig?.lint?.enable !== false
  const styleDiagnostics = collectQuaScriptStyleDiagnostics(source, options.toolingConfig?.format)
  const compilerDiagnostics = lintEnabled
    ? await collectQuaScriptCompilerDiagnostics(source, document.diagnostics, parsed, options)
    : []
  const baseDiagnostics = lintEnabled
    ? [
        ...document.diagnostics,
        ...parsed.diagnostics,
        ...compilerDiagnostics,
        ...styleDiagnostics,
      ]
    : []
  let diagnostics: QuaScriptDiagnostic[] = []
  let virtualTypeScript = createQuaScriptVirtualDocument(source, options).text
  try {
    const context = createQuaScriptTypeScriptContext(source, options)
    virtualTypeScript = context.virtualDocument.text
    diagnostics = !lintEnabled
      ? []
      : applyQuaScriptLintRules([
          ...context.virtualDocument.diagnostics,
          ...compilerDiagnostics,
          ...collectQuaScriptTypeScriptDiagnostics(context),
          ...collectQuaScriptStoryDiagnostics(source, parsed, options),
          ...styleDiagnostics,
        ], options.toolingConfig?.lint)
  }
  catch (error) {
    diagnostics = !lintEnabled
      ? []
      : applyQuaScriptLintRules([
          ...baseDiagnostics,
          {
            code: 'QS_PROJECT_ANALYSIS_FAILED',
            message: error instanceof Error ? error.message : String(error),
            severity: 'error',
            source: 'quascript/project',
          },
        ], options.toolingConfig?.lint)
  }

  return {
    characters: [...parsed.characters],
    diagnostics,
    setupVariables: collectSetupVariables(document.setupScript?.content || '', document.moduleScript?.content || ''),
    virtualTypeScript,
  }
}

export async function lintQuaScript(source: string, options: QuaScriptLanguageOptions = {}): Promise<QuaScriptLintResult> {
  if (options.toolingConfig?.lint?.enable === false) {
    return createQuaScriptLintResult([])
  }
  const analysis = await analyzeQuaScript(source, options)
  return createQuaScriptLintResult(analysis.diagnostics)
}

export function formatQuaScriptDocumentEdits(source: string, options: QuaScriptLanguageOptions = {}): QuaScriptTextEdit[] {
  if (options.toolingConfig?.format?.enable === false) {
    return []
  }
  return formatQuaScriptWithEdits(source, options.toolingConfig?.format)
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
    return getDecoratorCompletions(source, options)
  }

  if (isChoiceHelperContext(beforeCursor)) {
    return getChoiceHelperCompletions()
  }

  if (isChoiceTargetContext(beforeCursor)) {
    return getChoiceTargetCompletions(source, options)
  }

  if (isImageAssetContext(beforeCursor)) {
    return getStoryImageAssetCompletions(options.projectRoot)
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
    const mappings = await getActiveDecoratorMappings(source, options)
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
  const storyDefinitions = getQuaScriptStoryDefinitions(source, position, options)
  if (storyDefinitions.length > 0) {
    return storyDefinitions
  }
  const context = createQuaScriptTypeScriptContext(source, options)
  return getTypeScriptDefinitionsAtSourcePosition(context, position)
}

export function getQuaScriptCodeActions(
  source: string,
  position: QuaScriptLanguagePosition,
  options: QuaScriptCodeActionOptions = {},
): QuaScriptCodeAction[] {
  const actions: QuaScriptCodeAction[] = []
  const lines = source.split(/\r?\n/)
  const line = lines[position.line] || ''
  const expanded = expandChoiceSugarLine(line)
  if (expanded) {
    const range = sourceLineRangeAt(source, position.line, line.length)
    actions.push({
      title: 'Expand choice sugar to @Choice',
      kind: 'refactor.rewrite',
      edit: {
        edits: [{ newText: expanded, range }],
        newText: expanded,
        range,
      },
    })
  }

  if (!options.includeLintFixes) {
    return actions
  }

  const diagnostics = options.diagnostics
    ?? lintQuaScriptSource(source, {
      format: options.toolingConfig?.format,
      lint: options.toolingConfig?.lint,
    }).diagnostics
  const fixableDiagnostics = diagnostics.filter(diagnostic => diagnostic.fix?.edits.length)

  actions.push(...fixableDiagnostics
    .filter(diagnostic => diagnosticTouchesPosition(diagnostic, position))
    .map(diagnostic => ({
      title: diagnostic.fix?.title || `Fix ${diagnostic.code}`,
      kind: 'quickfix' as const,
      diagnostics: [diagnostic],
      edit: {
        edits: diagnostic.fix?.edits || [],
      },
    })))

  if (options.includeFixAll !== false) {
    const edits = getQuaScriptFixAllEdits(fixableDiagnostics)
    if (edits.length > 0) {
      actions.push({
        title: 'Fix all auto-fixable QuaScript problems',
        kind: 'source.fixAll.quascript',
        diagnostics: fixableDiagnostics,
        edit: {
          edits,
        },
      })
    }
  }

  return actions
}

async function getDecoratorCompletions(
  source: string,
  options: QuaScriptLanguageOptions,
): Promise<QuaScriptCompletionItem[]> {
  const mappings = await getActiveDecoratorMappings(source, options)
  return [...new Set(Object.keys(mappings))]
    .sort()
    .map(label => ({
      label,
      kind: 'decorator' as const,
      detail: 'QuaScript decorator',
    }))
}

function diagnosticTouchesPosition(diagnostic: QuaScriptDiagnostic, position: QuaScriptLanguagePosition): boolean {
  const range = diagnostic.range
  if (!range) {
    return true
  }

  if (range.start.line === range.end.line && range.start.column === range.end.column) {
    return position.line === range.start.line
  }

  const afterStart = position.line > range.start.line
    || (position.line === range.start.line && position.character >= range.start.column)
  const beforeEnd = position.line < range.end.line
    || (position.line === range.end.line && position.character <= range.end.column)
  return afterStart && beforeEnd
}

function getChoiceHelperCompletions(): QuaScriptCompletionItem[] {
  return [
    { label: 'node', insertText: 'node("${1:id}")', detail: 'Choice target helper', kind: 'function' },
    { label: 'label', insertText: 'label("${1:id}")', detail: 'Choice target helper', kind: 'function' },
    { label: 'scene', insertText: 'scene("${1:sceneId}", { entry: "${2:entry}" })', detail: 'Choice target helper', kind: 'function' },
    { label: 'script', insertText: 'script("${1:moduleId}", { nodeId: "${2:nodeId}" })', detail: 'Choice target helper', kind: 'function' },
    { label: 'packageNode', insertText: 'packageNode("${1:packageId}", "${2:nodeId}")', detail: 'Choice target helper', kind: 'function' },
    { label: 'checkpoint', insertText: 'checkpoint("${1:id}")', detail: 'Choice target helper', kind: 'function' },
    { label: 'image', insertText: 'image("${1:asset.png}")', detail: 'Story asset reference helper', kind: 'function' },
  ]
}

function getChoiceTargetCompletions(source: string, options: QuaScriptLanguageOptions): QuaScriptCompletionItem[] {
  return getQuaScriptStoryTargetCompletions(source, options).map(item => ({
    label: item.label,
    insertText: item.insertText,
    kind: 'value' as const,
    detail: item.detail,
  }))
}

function getStoryImageAssetCompletions(projectRoot?: string): QuaScriptCompletionItem[] {
  if (!projectRoot) {
    return []
  }
  return ['assets/images', 'assets/backgrounds']
    .flatMap(assetRoot => listAssetFiles(join(projectRoot, assetRoot))
      .filter(filePath => ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(extname(filePath).toLowerCase()))
      .map((filePath) => {
        const label = relative(join(projectRoot, assetRoot), filePath).replace(/\\/g, '/')
        return {
          detail: assetRoot,
          insertText: label,
          kind: 'asset' as const,
          label,
        }
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

  const mappings = await getActiveDecoratorMappings(source, options)
  if (!mappings[context.decoratorName]) {
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

async function getActiveDecoratorMappings(
  source: string,
  options: QuaScriptLanguageOptions,
): Promise<DecoratorMapping> {
  const availableMappings = await loadProjectDecoratorMappings(options.projectRoot)
  const resolutionOptions = createDecoratorResolutionOptions(options.toolingConfig, availableMappings)
  const moduleScript = parseQuaScriptDocument(source).moduleScript?.content || ''

  try {
    return resolveDecoratorMappingsForModuleSource(moduleScript, resolutionOptions)
  }
  catch {
    return resolveBaseDecoratorMappings(resolutionOptions)
  }
}

function createDecoratorResolutionOptions(
  toolingConfig: QuaScriptToolingConfig | undefined,
  availableDecoratorMappings: DecoratorMapping,
) {
  return {
    autoCollectDecorators: toolingConfig?.decorators?.autoCollect,
    availableDecoratorMappings,
    decoratorMappings: toolingConfig?.decorators?.mappings,
  }
}

async function collectQuaScriptCompilerDiagnostics(
  source: string,
  documentDiagnostics: readonly QuaScriptDiagnostic[],
  parsed: ReturnType<QuaScriptParser['parse']>,
  options: QuaScriptLanguageOptions,
): Promise<QuaScriptDiagnostic[]> {
  if (
    documentDiagnostics.some(diagnostic => diagnostic.severity === 'error')
    || parsed.diagnostics.some(diagnostic => diagnostic.severity === 'error')
  ) {
    return []
  }

  try {
    const transformer = await createPluginAwareTransformerAsync(
      options.toolingConfig?.decorators?.mappings,
      {
        autoCollectDecorators: options.toolingConfig?.decorators?.autoCollect,
        projectRoot: options.projectRoot,
      },
    )
    transformer.transformModuleSource(source, options.filePath)
    return []
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return [{
      code: 'QS_COMPILER_SEMANTICS',
      message,
      range: findCompilerDiagnosticRange(parsed, message),
      severity: 'error',
      source: 'quascript/compiler',
    }]
  }
}

function findCompilerDiagnosticRange(
  parsed: ReturnType<QuaScriptParser['parse']>,
  message: string,
): SourceRange | undefined {
  const decoratorMatch = message.match(/@([A-Za-z_]\w*)/)
  if (!decoratorMatch) {
    return undefined
  }

  const decoratorName = decoratorMatch[1]
  for (const step of parsed.steps) {
    if (step.type === 'dialogue') {
      const dialogue = step.content as { decorators: Array<{ name: string, range?: SourceRange }> }
      const match = dialogue.decorators.find((decorator) => {
        return decorator.name === decoratorName
      })
      if (match?.range) {
        return match.range
      }
      continue
    }

    if (step.type === 'action') {
      const action = step.content as { decorators: Array<{ name: string, range?: SourceRange }> }
      const match = action.decorators.find((decorator) => {
        return decorator.name === decoratorName
      })
      if (match?.range) {
        return match.range
      }
    }
  }

  return undefined
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

function isChoiceHelperContext(beforeCursor: string): boolean {
  return /@Choice\([^)]*$/.test(beforeCursor)
    && /(?:^|[,\s])([A-Za-z_$][\w$]*)?$/.test(beforeCursor)
}

function isChoiceTargetContext(beforeCursor: string): boolean {
  return /^\s*-\s+.+->\s*[#\w:.-]*$/.test(beforeCursor)
}

function isImageAssetContext(beforeCursor: string): boolean {
  return /\bimage\(\s*["'][^"']*$/.test(beforeCursor)
}

function expandChoiceSugarLine(line: string): string | undefined {
  const match = /^(\s*)-\s+(.+?)(?:\s*->\s*([^\s]+))?(?:\s+if\s+(.+))?\s*$/.exec(line)
  if (!match) {
    return undefined
  }
  const [, indent, rawText, rawTarget, rawCondition] = match
  const text = rawText.trim()
  if (!text) {
    return undefined
  }
  const target = targetSugarToHelper(rawTarget?.trim() || slugChoiceId(text))
  const condition = rawCondition?.trim()
  const options = condition ? `, { when: ${condition} }` : ''
  return `${indent}@Choice('${escapeSingleQuoted(text)}', ${target}${options})`
}

function targetSugarToHelper(target: string): string {
  if (target.startsWith('#')) {
    return `label('${escapeSingleQuoted(target.slice(1))}')`
  }
  const sceneMatch = /^scene:([^#\s]+)(?:#([^\s]+))?$/.exec(target)
  if (sceneMatch) {
    return sceneMatch[2]
      ? `scene('${escapeSingleQuoted(sceneMatch[1])}', { entry: '${escapeSingleQuoted(sceneMatch[2])}' })`
      : `scene('${escapeSingleQuoted(sceneMatch[1])}')`
  }
  const packageMatch = /^package:([^#\s]+)#([^\s]+)$/.exec(target)
  if (packageMatch) {
    return `packageNode('${escapeSingleQuoted(packageMatch[1])}', '${escapeSingleQuoted(packageMatch[2])}')`
  }
  const scriptMatch = /^script:([^#\s]+)(?:#([^\s]+))?$/.exec(target)
  if (scriptMatch) {
    return scriptMatch[2]
      ? `script('${escapeSingleQuoted(scriptMatch[1])}', { nodeId: '${escapeSingleQuoted(scriptMatch[2])}' })`
      : `script('${escapeSingleQuoted(scriptMatch[1])}')`
  }
  return `node('${escapeSingleQuoted(target)}')`
}

function slugChoiceId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'choice'
}

function escapeSingleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function sourceLineRangeAt(source: string, line: number, character: number): SourceRange {
  const lineStarts = createLineStarts(source)
  const lineStart = lineStarts[line] ?? source.length
  return rangeFromOffsets(lineStarts, lineStart, lineStart + character)
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
