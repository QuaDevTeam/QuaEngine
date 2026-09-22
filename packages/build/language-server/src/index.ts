import type { DecoratorArgumentLanguageContribution, LanguageCompletionValue } from '@quajs/plugin-discovery'
import type {
  QuaScriptDiagnostic,
  QuaScriptLintResult,
  QuaScriptTextEdit,
  QuaScriptToolingConfig,
  SourceRange,
} from '@quajs/script-compiler'
import type { QuaScriptDialogueHighlight } from './dialogue-highlights'
import type { QuaScriptTypeScriptSession } from './typescript-service'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyQuaScriptLintRules,
  collectQuaScriptStyleDiagnostics,
  createLineStarts,
  createPluginAwareTransformerAsync,
  createQuaScriptLintResult,
  formatQuaScriptWithEdits,
  getQuaScriptFixAllEdits,
  lintQuaScriptSource,
  parseQuaScriptDocument,
  QuaScriptParser,
  rangeFromOffsets,
} from '@quajs/script-compiler'
import ts from 'typescript'
import { collectQuaScriptAuthoring } from './authoring'
import { activeDecoratorMappings, decoratorArgumentContext, decoratorAt, decoratorBinding, decoratorIndex, decoratorSignature } from './decorators'
import { collectDialogueHighlights } from './dialogue-highlights'
import { collectQuaScriptStoryDiagnostics, getQuaScriptStoryDefinitions, getQuaScriptStoryTargetCompletions } from './story-diagnostics'
import {
  collectQuaScriptTypeScriptDiagnostics,
  createQuaScriptTypeScriptContext,
  getTypeScriptCompletionsAtSourcePosition,
  getTypeScriptDefinitionsAtSourcePosition,
  getTypeScriptHoverAtSourcePosition,
} from './typescript-service'
import { createQuaScriptVirtualDocument, sourceRangeFromOffsets } from './virtual'

export type { QuaScriptAuthoring, QuaScriptAuthoringDecorator, QuaScriptAuthoringField, QuaScriptAuthoringStep } from './authoring'
export { getQuaScriptSignatureHelp } from './decorators'
export type { QuaScriptSignatureHelp } from './decorators'
export type { QuaScriptDialogueHighlight } from './dialogue-highlights'
export { checkTypeScriptProject, QuaScriptTypeScriptSession } from './typescript-service'

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
  documentation?: string
  range?: SourceRange
  snippet?: boolean
  detail?: string
  insertText?: string
  kind: QuaScriptCompletionKind
  label: string
  sortText?: string
}

export interface QuaScriptLanguageOptions {
  /** Include source-preserving visual authoring fields for an interactive editor. */
  authoring?: boolean
  /** Optional caller-owned reusable TypeScript service. Dispose when the project closes. */
  typescriptSession?: QuaScriptTypeScriptSession
  extraFiles?: Record<string, string>
  filePath?: string
  projectRoot?: string
  toolingConfig?: QuaScriptToolingConfig
}

export interface QuaScriptAnalysis {
  authoring?: import('./authoring').QuaScriptAuthoring
  previewSteps: { index: number, range: SourceRange }[]
  dialogueHighlights: QuaScriptDialogueHighlight[]
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
  const virtualDocument = createQuaScriptVirtualDocument(source, options, { document, parsed })
  let virtualTypeScript = virtualDocument.text
  const context = createQuaScriptTypeScriptContext(source, options, virtualDocument)
  try {
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
  finally {
    context.dispose()
  }

  const authoring = options.authoring ? await collectQuaScriptAuthoring(source, parsed, options) : undefined
  if (authoring && document.diagnostics.some(item => item.severity === 'error')) {
    authoring.steps = []
    authoring.error = '请先修复 QuaScript 模块语法错误，再编辑表单。'
  }
  return {
    authoring,
    previewSteps: parsed.steps.flatMap((step, index) => step.range && step.type !== 'action' ? [{ index, range: step.range }] : []),
    dialogueHighlights: collectDialogueHighlights(source, parsed),
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

  const decorator = decoratorAt(source, position)
  if (decorator) {
    const range = sourceRangeFromOffsets(source, decorator.start, decorator.nameEnd)
    return (await decoratorIndex(source, options)).map(entry => ({
      label: entry.name,
      kind: 'decorator' as const,
      detail: `${decoratorSignature(entry.name, entry.language)} — ${entry.mapping.module}`,
      documentation: [entry.language?.description, `Lowers to \`${entry.mapping.function}\` from \`${entry.mapping.module}\`.`].filter(Boolean).join('\n\n'),
      insertText: entry.name,
      range,
    }))
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

  if (isSpeakerContext(beforeCursor) && !decoratorAt(source, position, true) && !isScriptPosition(source, position)) {
    return readCharacterNames(source, options.projectRoot).map(label => ({
      label,
      kind: 'character' as const,
      detail: 'QuaScript character',
    }))
  }

  const decoratorArgumentCompletions = await getDecoratorArgumentCompletions(source, position, options)
  const context = createQuaScriptTypeScriptContext(source, options)
  try {
    const tsCompletions = getTypeScriptCompletionsAtSourcePosition(context, position)
    if (tsCompletions) {
      return uniqueCompletions([
        ...decoratorArgumentCompletions,
        ...tsCompletions.entries.filter(entry => !['__quaDecorator', '__quaExpr', 'createQuaScript'].includes(entry.name)).map(entry => ({
          detail: entry.kind,
          insertText: entry.insertText,
          kind: mapTypeScriptCompletionKind(entry.kind),
          label: entry.name,
          sortText: entry.sortText,
        })),
      ])
    }
  }
  finally { context.dispose() }

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
  const decorator = decoratorAt(source, position)
  if (decorator) {
    const entry = (await decoratorIndex(source, options)).find(entry => entry.name === decorator.name)
    if (!entry)
      return undefined
    const binding = entry.language?.description ? undefined : decoratorBinding(source, entry.mapping, options)
    return {
      contents: [
        `\`\`\`quascript\n${decoratorSignature(entry.name, entry.language)}\n\`\`\``,
        entry.language?.description || binding?.documentation,
        ...(entry.language?.args || []).map(arg => `- **${arg.name}**${arg.detail ? `: ${arg.detail}` : ''}`),
        `Lowers to \`${entry.mapping.function}\` from \`${entry.mapping.module}\`.`,
      ].filter(Boolean).join('\n\n'),
      range: sourceRangeFromOffsets(source, decorator.start - 1, decorator.nameEnd),
    }
  }

  const context = createQuaScriptTypeScriptContext(source, options)
  try {
    return getTypeScriptHoverAtSourcePosition(context, position)
  }
  finally { context.dispose() }
}

export function getQuaScriptDefinitions(
  source: string,
  position: QuaScriptLanguagePosition,
  options: QuaScriptLanguageOptions = {},
) {
  const decorator = decoratorAt(source, position)
  if (decorator) {
    const mapping = activeDecoratorMappings(source, options)[decorator.name]
    return mapping ? decoratorBinding(source, mapping, options).definitions : []
  }
  const storyDefinitions = getQuaScriptStoryDefinitions(source, position, options)
  if (storyDefinitions.length > 0) {
    return storyDefinitions
  }
  const context = createQuaScriptTypeScriptContext(source, options)
  try {
    return getTypeScriptDefinitionsAtSourcePosition(context, position)
  }
  finally { context.dispose() }
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
    { label: 'node', insertText: ['node("', snippetPlaceholder('1:id'), '")'].join(''), detail: 'Choice target helper', kind: 'function' },
    { label: 'label', insertText: ['label("', snippetPlaceholder('1:id'), '")'].join(''), detail: 'Choice target helper', kind: 'function' },
    { label: 'scene', insertText: ['scene("', snippetPlaceholder('1:sceneId'), '", { entry: "', snippetPlaceholder('2:entry'), '" })'].join(''), detail: 'Choice target helper', kind: 'function' },
    { label: 'script', insertText: ['script("', snippetPlaceholder('1:moduleId'), '", { nodeId: "', snippetPlaceholder('2:nodeId'), '" })'].join(''), detail: 'Choice target helper', kind: 'function' },
    { label: 'packageNode', insertText: ['packageNode("', snippetPlaceholder('1:packageId'), '", "', snippetPlaceholder('2:nodeId'), '")'].join(''), detail: 'Choice target helper', kind: 'function' },
    { label: 'checkpoint', insertText: ['checkpoint("', snippetPlaceholder('1:id'), '")'].join(''), detail: 'Choice target helper', kind: 'function' },
    { label: 'image', insertText: ['image("', snippetPlaceholder('1:asset.png'), '")'].join(''), detail: 'Story asset reference helper', kind: 'function' },
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
  const context = decoratorArgumentContext(source, position)
  if (!context) {
    return []
  }

  const entry = (await decoratorIndex(source, options)).find(entry => entry.name === context.decoratorName)
  const contribution = entry?.language
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

  return uniqueCompletions(completions).map(item => ({ ...item, range: context.range }))
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
  const decoratorMatch = message.match(/@([A-Z_]\w*)/i)
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

function readCharacterNamesFromProfiles(projectRoot?: string): string[] {
  if (!projectRoot) {
    return []
  }

  const candidates = [
    join(projectRoot, 'assets', 'characters', 'characters.json'),
    join(projectRoot, 'assets', 'characters', 'character-profiles.json'),
    join(projectRoot, 'src', 'game', 'characters.json'),
  ]
  return candidates.flatMap((filePath) => {
    if (!existsSync(filePath)) {
      return []
    }
    try {
      return extractCharacterNamesFromProfileJson(JSON.parse(readFileSync(filePath, 'utf-8')))
    }
    catch {
      return []
    }
  })
}

function extractCharacterNamesFromProfileJson(value: unknown): string[] {
  const records = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Array.isArray((value as { characters?: unknown }).characters)
        ? (value as { characters: unknown[] }).characters
        : Object.values(value as Record<string, unknown>)
      : []
  return records.flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return []
    }
    const profile = record as Record<string, unknown>
    const aliases = Array.isArray(profile.aliases)
      ? profile.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.length > 0)
      : []
    return [
      typeof profile.id === 'string' ? profile.id : undefined,
      typeof profile.displayName === 'string' ? profile.displayName : undefined,
      typeof profile.name === 'string' ? profile.name : undefined,
      ...aliases,
    ].filter((name): name is string => Boolean(name))
  })
}

function readCharacterNames(source: string, projectRoot?: string): string[] {
  const parsed = new QuaScriptParser().parse(parseQuaScriptDocument(source).dslBody)
  return [
    ...new Set([
      ...parsed.characters,
      ...readCharacterNamesFromAssets(projectRoot),
      ...readCharacterNamesFromProfiles(projectRoot),
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

function isChoiceHelperContext(beforeCursor: string): boolean {
  return /@Choice\([^)]*$/.test(beforeCursor)
    && /(?:^|[,\s])(?:[A-Z_$][\w$]*)?$/i.test(beforeCursor)
}

function isChoiceTargetContext(beforeCursor: string): boolean {
  const trimmed = beforeCursor.trimStart()
  if (!trimmed.startsWith('- ')) {
    return false
  }

  const arrowIndex = trimmed.indexOf('->')
  if (arrowIndex < 0) {
    return false
  }

  const target = trimmed.slice(arrowIndex + 2).trim()
  return target.length === 0 || /^[#\w:.-]+$/.test(target)
}

function isImageAssetContext(beforeCursor: string): boolean {
  return /\bimage\(\s*["'][^"']*$/.test(beforeCursor)
}

function expandChoiceSugarLine(line: string): string | undefined {
  const indentMatch = /^\s*/.exec(line)
  const indent = indentMatch?.[0] || ''
  const body = line.slice(indent.length).trim()
  if (!body.startsWith('- ')) {
    return undefined
  }

  let content = body.slice(2).trim()
  if (!content) {
    return undefined
  }

  let rawCondition: string | undefined
  let rawTarget: string | undefined
  const arrowIndex = content.indexOf('->')
  if (arrowIndex >= 0) {
    const targetAndCondition = content.slice(arrowIndex + 2).trim()
    const conditionIndex = targetAndCondition.indexOf(' if ')
    if (conditionIndex >= 0) {
      rawCondition = targetAndCondition.slice(conditionIndex + 4).trim()
      rawTarget = targetAndCondition.slice(0, conditionIndex).trim()
    }
    else {
      rawTarget = targetAndCondition
    }
    content = content.slice(0, arrowIndex).trim()
  }
  else {
    const conditionIndex = content.lastIndexOf(' if ')
    if (conditionIndex >= 0) {
      rawCondition = content.slice(conditionIndex + 4).trim()
      content = content.slice(0, conditionIndex).trim()
    }
  }

  const text = content.trim()
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

  const sceneTarget = splitHashTarget(target, 'scene:', false)
  if (sceneTarget) {
    return sceneTarget.fragment
      ? `scene('${escapeSingleQuoted(sceneTarget.id)}', { entry: '${escapeSingleQuoted(sceneTarget.fragment)}' })`
      : `scene('${escapeSingleQuoted(sceneTarget.id)}')`
  }

  const packageTarget = splitHashTarget(target, 'package:', true)
  if (packageTarget) {
    return `packageNode('${escapeSingleQuoted(packageTarget.id)}', '${escapeSingleQuoted(packageTarget.fragment)}')`
  }

  const scriptTarget = splitHashTarget(target, 'script:', false)
  if (scriptTarget) {
    return scriptTarget.fragment
      ? `script('${escapeSingleQuoted(scriptTarget.id)}', { nodeId: '${escapeSingleQuoted(scriptTarget.fragment)}' })`
      : `script('${escapeSingleQuoted(scriptTarget.id)}')`
  }
  return `node('${escapeSingleQuoted(target)}')`
}

function splitHashTarget(
  target: string,
  prefix: string,
  requireFragment: boolean,
): { fragment: string, id: string } | undefined {
  if (!target.startsWith(prefix)) {
    return undefined
  }

  const value = target.slice(prefix.length)
  const hashIndex = value.indexOf('#')
  const id = hashIndex >= 0 ? value.slice(0, hashIndex) : value
  const fragment = hashIndex >= 0 ? value.slice(hashIndex + 1) : ''
  if (!id || /\s/.test(id) || (hashIndex >= 0 && (!fragment || /\s/.test(fragment)))) {
    return undefined
  }
  if (requireFragment && hashIndex < 0) {
    return undefined
  }

  return { id, fragment }
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
  return value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
}

function snippetPlaceholder(value: string): string {
  return ['$', '{', value, '}'].join('')
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

function isScriptPosition(source: string, position: QuaScriptLanguagePosition): boolean {
  const document = parseQuaScriptDocument(source)
  return [document.moduleScript, document.setupScript].some(block => block && position.line >= block.range.start.line && position.line <= block.range.end.line)
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
