import type { QuaScriptTransformerOptions } from './transformer'
import type { DecoratorMapping, ParsedQuaScript, QuaScriptChoice, QuaScriptDecorator, QuaScriptDialogue, QuaScriptStep, SourceRange } from './types'
import { parse } from '@babel/parser'
import { loadProjectDecoratorMappingsSync } from '../decorators'
import { resolveQuaScriptDecoratorCompileOptions } from './config'
import { parseQuaScriptDocument } from './document'
import { QuaScriptParser, scanTemplateText } from './parser'
import { QuaScriptTransformer } from './transformer'
import { createPluginAwareTransformerAsync } from '../integrations/plugin-aware-transformer'
import { mergeDecoratorMappings } from './types'

export type QuaScriptLocalizableUnitKind = 'dialogue' | 'choice'
export type QuaScriptLocaleSyncStatus = 'matched' | 'needs-review' | 'todo' | 'obsolete' | 'conflict'

export interface QuaScriptLocalizableUnit {
  id: string
  kind: QuaScriptLocalizableUnitKind
  text: string
  textRange: SourceRange
  stepIndex: number
  optionIndex?: number
  character?: string
  target?: string
  condition?: string
  decorators: QuaScriptDecorator[]
  anchors: string[]
  textKeys: string[]
  expressionSignature: string[]
  structureHash: string
  textHash: string
  neighborhoodHash: string
  previousStructureHash?: string
  nextStructureHash?: string
}

export interface CompileLocalizedQuaScriptModuleOptions extends QuaScriptTransformerOptions {
  baseSource: string
  localizedSource: string
  locale: string
  sourceId?: string
  strict?: boolean
  decoratorMappings?: DecoratorMapping
  projectRoot?: string
}

export interface QuaScriptLocaleSyncResult {
  source: string
  state: QuaScriptLocaleSyncState
  units: Array<{
    base: QuaScriptLocalizableUnit
    locale?: QuaScriptLocalizableUnit
    status: QuaScriptLocaleSyncStatus
    confidence: number
  }>
  obsolete: QuaScriptLocalizableUnit[]
}

export interface QuaScriptLocaleSyncState {
  version: 1
  sourceHash: string
  units: QuaScriptLocaleSyncStateUnit[]
}

export type QuaScriptLocaleSyncStateUnit = Pick<
  QuaScriptLocalizableUnit,
  | 'anchors'
  | 'character'
  | 'condition'
  | 'expressionSignature'
  | 'id'
  | 'kind'
  | 'neighborhoodHash'
  | 'nextStructureHash'
  | 'optionIndex'
  | 'previousStructureHash'
  | 'stepIndex'
  | 'structureHash'
  | 'target'
  | 'textHash'
  | 'textKeys'
>

export interface SyncQuaScriptLocaleOptions {
  previousState?: QuaScriptLocaleSyncState
}

export function compileLocalizedQuaScriptModuleToTs(options: CompileLocalizedQuaScriptModuleOptions): string {
  const { baseSource, localizedSource, strict, decoratorMappings, locale: _locale, sourceId: _sourceId, projectRoot, ...transformerOptions } = options
  void _locale
  void _sourceId
  const resolvedDecoratorOptions = resolveQuaScriptDecoratorCompileOptions({
    autoCollectDecorators: transformerOptions.autoCollectDecorators,
    decoratorMappings,
    projectRoot,
  })
  const document = parseQuaScriptDocument(baseSource)
  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  applyLocalizedTextToParsedQuaScript(parsed, localizedSource, { strict })
  return new QuaScriptTransformer(mergeDecoratorMappings(resolvedDecoratorOptions.decoratorMappings), {
    ...transformerOptions,
    autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
    availableDecoratorMappings: loadProjectDecoratorMappingsSync(projectRoot),
  }).transformParsedModuleSource(document, parsed)
}

export async function compileLocalizedQuaScriptModuleToTsAsync(options: CompileLocalizedQuaScriptModuleOptions): Promise<string> {
  const { baseSource, localizedSource, strict, decoratorMappings, locale: _locale, sourceId: _sourceId, projectRoot, ...transformerOptions } = options
  void _locale
  void _sourceId
  const resolvedDecoratorOptions = resolveQuaScriptDecoratorCompileOptions({
    autoCollectDecorators: transformerOptions.autoCollectDecorators,
    decoratorMappings,
    projectRoot,
  })
  const document = parseQuaScriptDocument(baseSource)
  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  applyLocalizedTextToParsedQuaScript(parsed, localizedSource, { strict })

  const transformer = await createPluginAwareTransformerAsync(resolvedDecoratorOptions.decoratorMappings, {
    ...transformerOptions,
    autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
    projectRoot,
  })

  return transformer.transformParsedModuleSource(document, parsed)
}

export function applyQuaScriptLocaleOverlay(
  baseSource: string,
  localizedSource: string,
  options: { strict?: boolean } = {},
): string {
  const baseUnits = extractQuaScriptLocalizableUnits(baseSource)
  const localizedUnits = extractQuaScriptLocalizableUnits(localizedSource)
  const matches = matchLocaleUnits(baseUnits, localizedUnits)
  const replacements: Array<{ range: SourceRange, text: string }> = []

  for (const match of matches.units) {
    if (!match.locale) {
      if (options.strict) {
        throw new Error(`Missing localized QuaScript text for unit "${match.base.id}".`)
      }
      continue
    }
    replacements.push({
      range: match.base.textRange,
      text: match.locale.text,
    })
  }

  return replaceSourceRanges(baseSource, replacements)
}

export function extractQuaScriptLocalizableUnits(source: string, sourceId = ''): QuaScriptLocalizableUnit[] {
  const document = parseQuaScriptDocument(source)
  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  return attachNeighborhoods(parsed.steps.flatMap((step, stepIndex) => extractStepUnits(step, stepIndex, sourceId)))
}

export function createQuaScriptLocaleSkeleton(source: string, locale: string): string {
  const units = extractQuaScriptLocalizableUnits(source)
  return [
    `// locale: ${locale}`,
    ...units.map((unit) => {
      const anchor = unit.anchors[0] ? `@LineId('${escapeSingleQuoted(unit.anchors[0])}')\n` : ''
      if (unit.kind === 'choice') {
        const target = unit.target ? ` -> ${unit.target}` : ''
        const condition = unit.condition ? ` if ${unit.condition}` : ''
        return `${anchor}- ${unit.text}${target}${condition}`
      }
      return `${anchor}${unit.character}: ${unit.text}`
    }),
  ].join('\n\n')
}

export function syncQuaScriptLocale(
  baseSource: string,
  localizedSource: string,
  options: SyncQuaScriptLocaleOptions = {},
): QuaScriptLocaleSyncResult {
  const baseUnits = extractQuaScriptLocalizableUnits(baseSource)
  const localizedUnits = extractQuaScriptLocalizableUnits(localizedSource)
  const matched = options.previousState?.units.length
    ? matchLocaleUnitsWithPreviousState(baseUnits, localizedUnits, options.previousState)
    : matchLocaleUnits(baseUnits, localizedUnits)
  return {
    source: renderQuaScriptLocaleOverlay(matched.units, matched.obsolete, localizedSource),
    state: createQuaScriptLocaleSyncState(baseSource, baseUnits),
    units: matched.units,
    obsolete: matched.obsolete,
  }
}

export function createQuaScriptLocaleSyncState(
  source: string,
  units = extractQuaScriptLocalizableUnits(source),
): QuaScriptLocaleSyncState {
  return {
    version: 1,
    sourceHash: stableHash(source),
    units: units.map(unit => ({
      anchors: [...unit.anchors],
      character: unit.character,
      condition: unit.condition,
      expressionSignature: [...unit.expressionSignature],
      id: unit.id,
      kind: unit.kind,
      neighborhoodHash: unit.neighborhoodHash,
      nextStructureHash: unit.nextStructureHash,
      optionIndex: unit.optionIndex,
      previousStructureHash: unit.previousStructureHash,
      stepIndex: unit.stepIndex,
      structureHash: unit.structureHash,
      target: unit.target,
      textHash: unit.textHash,
      textKeys: [...unit.textKeys],
    })),
  }
}

function extractStepUnits(step: QuaScriptStep, stepIndex: number, sourceId: string): QuaScriptLocalizableUnit[] {
  if (step.type === 'dialogue') {
    const dialogue = step.content as QuaScriptDialogue
    return [createUnit({
      kind: 'dialogue',
      text: dialogue.text,
      textRange: dialogue.textRange,
      stepIndex,
      character: dialogue.character,
      decorators: dialogue.decorators,
      sourceId,
      expressions: dialogue.templateExpressions,
    })]
  }

  if (step.type === 'choice') {
    const choice = step.content as QuaScriptChoice
    return choice.options.map((option, optionIndex) => createUnit({
      kind: 'choice',
      text: option.text,
      textRange: option.textRange,
      stepIndex,
      optionIndex,
      target: typeof option.target === 'string' ? option.target : undefined,
      condition: option.condition,
      decorators: [],
      sourceId,
      expressions: option.templateExpressions,
    }))
  }

  return []
}

function applyLocalizedTextToParsedQuaScript(
  parsed: ParsedQuaScript,
  localizedSource: string,
  options: { strict?: boolean },
): void {
  const baseUnits = attachNeighborhoods(parsed.steps.flatMap((step, stepIndex) => extractStepUnits(step, stepIndex, '')))
  const localizedUnits = extractQuaScriptLocalizableUnits(localizedSource)
  const matches = matchLocaleUnits(baseUnits, localizedUnits)

  for (const match of matches.units) {
    if (!match.locale) {
      if (options.strict) {
        throw new Error(`Missing localized QuaScript text for unit "${match.base.id}".`)
      }
      continue
    }
    applyLocalizedUnitText(parsed, match.base, match.locale.text)
  }
}

function applyLocalizedUnitText(parsed: ParsedQuaScript, unit: QuaScriptLocalizableUnit, text: string): void {
  const scan = scanTemplateText(text)
  if (scan.diagnostics.length > 0) {
    throw new Error(scan.diagnostics.map(diagnostic => diagnostic.message).join('\n'))
  }

  const step = parsed.steps[unit.stepIndex]
  if (!step) {
    return
  }
  if (unit.kind === 'dialogue' && step.type === 'dialogue') {
    const dialogue = step.content as QuaScriptDialogue
    dialogue.text = text
    dialogue.templateExpressions = scan.expressions
    dialogue.templateExpressionRanges = []
    return
  }
  if (unit.kind === 'choice' && step.type === 'choice' && unit.optionIndex !== undefined) {
    const choice = step.content as QuaScriptChoice
    const option = choice.options[unit.optionIndex]
    if (!option) {
      return
    }
    option.text = text
    option.templateExpressions = scan.expressions
    option.templateExpressionRanges = []
  }
}

function renderQuaScriptLocaleOverlay(
  units: QuaScriptLocaleSyncResult['units'],
  obsolete: QuaScriptLocalizableUnit[],
  localizedSource: string,
): string {
  const header = localizedSource.match(/^\s*\/\/\s*locale:[^\n]*(?:\r?\n){0,2}/)?.[0].trim()
  const body = units.map(({ base, locale, status }) => renderQuaScriptLocaleUnit(base, locale?.text ?? base.text, status)).join('\n\n')
  const obsoleteBody = obsolete.length > 0
    ? [
        '// OBSOLETE: no matching base unit',
        ...obsolete.map(unit => commentOutQuaScriptLocaleUnit(unit)),
      ].join('\n\n')
    : ''
  return [header, body, obsoleteBody].filter(Boolean).join('\n\n')
}

function renderQuaScriptLocaleUnit(unit: QuaScriptLocalizableUnit, text: string, status?: QuaScriptLocaleSyncStatus): string {
  const anchor = unit.anchors[0] ? `@LineId('${escapeSingleQuoted(unit.anchors[0])}')\n` : ''
  const marker = renderSyncStatusMarker(status)
  if (unit.kind === 'choice') {
    const target = unit.target ? ` -> ${unit.target}` : ''
    const condition = unit.condition ? ` if ${unit.condition}` : ''
    return `${marker}${anchor}- ${text}${target}${condition}`
  }
  return `${marker}${anchor}${unit.character}: ${text}`
}

function renderSyncStatusMarker(status?: QuaScriptLocaleSyncStatus): string {
  switch (status) {
    case 'todo':
      return '// TRANSLATION-REQUIRED\n'
    case 'needs-review':
      return '// NEEDS-REVIEW: base text or matching context changed\n'
    case 'conflict':
      return '// CONFLICT: verify this localized unit matches the base unit\n'
    default:
      return ''
  }
}

function commentOutQuaScriptLocaleUnit(unit: QuaScriptLocalizableUnit): string {
  return renderQuaScriptLocaleUnit(unit, unit.text)
    .split('\n')
    .map(line => `// ${line}`)
    .join('\n')
}

function createUnit(input: {
  kind: QuaScriptLocalizableUnitKind
  text: string
  textRange: SourceRange
  stepIndex: number
  optionIndex?: number
  character?: string
  target?: string
  condition?: string
  decorators: QuaScriptDecorator[]
  sourceId: string
  expressions: readonly string[]
}): QuaScriptLocalizableUnit {
  const anchors = getDecoratorAnchors(input.decorators)
  const textKeys = [...getExpressionTextKeys(input.expressions), ...getDecoratorTextKeys(input.decorators)]
  const expressionSignature = input.expressions.map(normalizeExpression)
  const structureSeed = [
    input.sourceId,
    input.kind,
    input.character || '',
    input.target || '',
    input.condition || '',
    expressionSignature.join(','),
  ].join('|')
  const idSeed = [
    anchors[0] || textKeys[0] || '',
    structureSeed,
    input.stepIndex,
    input.optionIndex ?? '',
  ].join('|')

  return {
    id: stableHash(idSeed),
    kind: input.kind,
    text: input.text,
    textRange: input.textRange,
    stepIndex: input.stepIndex,
    optionIndex: input.optionIndex,
    character: input.character,
    target: input.target,
    condition: input.condition,
    decorators: input.decorators,
    anchors,
    textKeys,
    expressionSignature,
    structureHash: stableHash(structureSeed),
    textHash: stableHash(input.text),
    neighborhoodHash: '',
  }
}

function attachNeighborhoods(units: QuaScriptLocalizableUnit[]): QuaScriptLocalizableUnit[] {
  return units.map((unit, index) => {
    const previousStructureHash = units[index - 1]?.structureHash
    const nextStructureHash = units[index + 1]?.structureHash
    return {
      ...unit,
      previousStructureHash,
      nextStructureHash,
      neighborhoodHash: stableHash([
        previousStructureHash || '',
        unit.structureHash,
        nextStructureHash || '',
      ].join('|')),
    }
  })
}

function matchLocaleUnits(
  baseUnits: QuaScriptLocalizableUnit[],
  localizedUnits: QuaScriptLocalizableUnit[],
): Pick<QuaScriptLocaleSyncResult, 'obsolete' | 'units'> {
  const unused = new Set(localizedUnits)
  const units = baseUnits.map((base, index) => {
    const locale = findBestLocaleUnit(base, localizedUnits, unused, index)
    if (locale) {
      unused.delete(locale)
    }
    return {
      base,
      locale,
      status: resolveMatchStatus(base, locale),
      confidence: resolveMatchConfidence(base, locale),
    }
  })

  return {
    units,
    obsolete: [...unused],
  }
}

function matchLocaleUnitsWithPreviousState(
  baseUnits: QuaScriptLocalizableUnit[],
  localizedUnits: QuaScriptLocalizableUnit[],
  previousState: QuaScriptLocaleSyncState,
): Pick<QuaScriptLocaleSyncResult, 'obsolete' | 'units'> {
  const previousUnits = previousState.units.map(stateUnitToLocalizableUnit)
  const previousToLocale = matchLocaleUnits(previousUnits, localizedUnits)
  const localeByPrevious = new Map<QuaScriptLocalizableUnit, QuaScriptLocalizableUnit | undefined>(
    previousToLocale.units.map(match => [match.base, match.locale]),
  )
  const unusedPrevious = new Set(previousUnits)
  const unusedLocales = new Set(localizedUnits)
  const allowPreviousOrderFallback = baseUnits.length === previousUnits.length

  const units = baseUnits.map((base, index) => {
    const previous = findBestPreviousUnit(base, previousUnits, unusedPrevious, index, allowPreviousOrderFallback)
    if (previous) {
      unusedPrevious.delete(previous)
    }

    let locale = previous ? localeByPrevious.get(previous) : undefined
    if (locale && unusedLocales.has(locale)) {
      unusedLocales.delete(locale)
    }
    else {
      locale = findExplicitLocaleUnit(base, localizedUnits, unusedLocales)
      if (locale) {
        unusedLocales.delete(locale)
      }
    }

    return {
      base,
      locale,
      status: resolveStatefulMatchStatus(base, previous, locale),
      confidence: previous
        ? resolvePreviousMatchConfidence(base, previous, locale)
        : resolveMatchConfidence(base, locale),
    }
  })

  return {
    units,
    obsolete: [...unusedLocales],
  }
}

function findBestLocaleUnit(
  base: QuaScriptLocalizableUnit,
  localizedUnits: QuaScriptLocalizableUnit[],
  unused: Set<QuaScriptLocalizableUnit>,
  index: number,
  allowOrderFallback = true,
): QuaScriptLocalizableUnit | undefined {
  const candidates = localizedUnits.filter(unit => unused.has(unit) && unit.kind === base.kind)
  return findBySharedValue(base.anchors, candidates, unit => unit.anchors)
    || findBySharedValue(base.textKeys, candidates, unit => unit.textKeys)
    || candidates.find(unit => unit.structureHash === base.structureHash)
    || candidates.find(unit => unit.neighborhoodHash === base.neighborhoodHash && sameStructuralHints(unit, base))
    || candidates.find(unit => sameExpressionSignature(unit, base) && sameStructuralHints(unit, base))
    || (allowOrderFallback && unused.has(localizedUnits[index]) && localizedUnits[index].kind === base.kind ? localizedUnits[index] : undefined)
}

function findExplicitLocaleUnit(
  base: QuaScriptLocalizableUnit,
  localizedUnits: QuaScriptLocalizableUnit[],
  unused: Set<QuaScriptLocalizableUnit>,
): QuaScriptLocalizableUnit | undefined {
  const candidates = localizedUnits.filter(unit => unused.has(unit) && unit.kind === base.kind)
  return findBySharedValue(base.anchors, candidates, unit => unit.anchors)
    || findBySharedValue(base.textKeys, candidates, unit => unit.textKeys)
}

function findBestPreviousUnit(
  base: QuaScriptLocalizableUnit,
  previousUnits: QuaScriptLocalizableUnit[],
  unused: Set<QuaScriptLocalizableUnit>,
  index: number,
  allowOrderFallback: boolean,
): QuaScriptLocalizableUnit | undefined {
  const candidates = previousUnits.filter(unit => unused.has(unit) && unit.kind === base.kind)
  return findBySharedValue(base.anchors, candidates, unit => unit.anchors)
    || findBySharedValue(base.textKeys, candidates, unit => unit.textKeys)
    || candidates.find(unit => unit.textHash === base.textHash && sameStructuralHints(unit, base))
    || candidates.find(unit => unit.neighborhoodHash === base.neighborhoodHash && sameStructuralHints(unit, base))
    || (allowOrderFallback ? candidates.find(unit => unit.structureHash === base.structureHash && sameExpressionSignature(unit, base)) : undefined)
    || (allowOrderFallback ? candidates.find(unit => sameExpressionSignature(unit, base) && sameStructuralHints(unit, base)) : undefined)
    || (allowOrderFallback && unused.has(previousUnits[index]) && previousUnits[index].kind === base.kind ? previousUnits[index] : undefined)
}

function findBySharedValue(
  values: readonly string[],
  candidates: QuaScriptLocalizableUnit[],
  read: (unit: QuaScriptLocalizableUnit) => readonly string[],
): QuaScriptLocalizableUnit | undefined {
  if (values.length === 0) {
    return undefined
  }
  return candidates.find(unit => read(unit).some(value => values.includes(value)))
}

function resolveMatchStatus(
  base: QuaScriptLocalizableUnit,
  locale: QuaScriptLocalizableUnit | undefined,
): QuaScriptLocaleSyncStatus {
  if (!locale) {
    return 'todo'
  }
  if (base.structureHash === locale.structureHash && base.textHash !== locale.textHash) {
    return 'matched'
  }
  if (base.kind === locale.kind && sameStructuralHints(base, locale)) {
    return 'needs-review'
  }
  return 'conflict'
}

function resolveStatefulMatchStatus(
  base: QuaScriptLocalizableUnit,
  previous: QuaScriptLocalizableUnit | undefined,
  locale: QuaScriptLocalizableUnit | undefined,
): QuaScriptLocaleSyncStatus {
  if (!locale) {
    return 'todo'
  }
  if (!previous) {
    return resolveMatchStatus(base, locale)
  }
  if (base.kind !== previous.kind) {
    return 'conflict'
  }
  if (
    base.structureHash !== previous.structureHash
    || base.textHash !== previous.textHash
    || base.neighborhoodHash !== previous.neighborhoodHash
    || !sameExpressionSignature(base, previous)
  ) {
    return 'needs-review'
  }
  return resolveMatchStatus(base, locale)
}

function resolveMatchConfidence(base: QuaScriptLocalizableUnit, locale: QuaScriptLocalizableUnit | undefined): number {
  if (!locale) {
    return 0
  }
  if (base.anchors.some(anchor => locale.anchors.includes(anchor))) {
    return 1
  }
  if (base.textKeys.some(key => locale.textKeys.includes(key))) {
    return 0.95
  }
  if (base.structureHash === locale.structureHash) {
    return 0.85
  }
  if (sameExpressionSignature(base, locale) && sameStructuralHints(base, locale)) {
    return 0.7
  }
  return 0.35
}

function resolvePreviousMatchConfidence(
  base: QuaScriptLocalizableUnit,
  previous: QuaScriptLocalizableUnit,
  locale: QuaScriptLocalizableUnit | undefined,
): number {
  if (!locale) {
    return 0
  }
  if (base.anchors.some(anchor => previous.anchors.includes(anchor))) {
    return 1
  }
  if (base.textKeys.some(key => previous.textKeys.includes(key))) {
    return 0.95
  }
  if (base.textHash === previous.textHash && sameStructuralHints(base, previous)) {
    return 0.9
  }
  if (base.neighborhoodHash === previous.neighborhoodHash && sameStructuralHints(base, previous)) {
    return 0.8
  }
  if (sameExpressionSignature(base, previous) && sameStructuralHints(base, previous)) {
    return 0.7
  }
  return 0.4
}

function sameStructuralHints(left: QuaScriptLocalizableUnit, right: QuaScriptLocalizableUnit): boolean {
  return left.kind === right.kind
    && left.character === right.character
    && left.target === right.target
    && left.condition === right.condition
}

function sameExpressionSignature(left: QuaScriptLocalizableUnit, right: QuaScriptLocalizableUnit): boolean {
  return left.expressionSignature.join('|') === right.expressionSignature.join('|')
}

function stateUnitToLocalizableUnit(unit: QuaScriptLocaleSyncStateUnit): QuaScriptLocalizableUnit {
  return {
    ...unit,
    decorators: [],
    text: '',
    textRange: emptySourceRange(),
  }
}

function emptySourceRange(): SourceRange {
  return {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  }
}

function getDecoratorAnchors(decorators: readonly QuaScriptDecorator[]): string[] {
  return decorators
    .filter(decorator => decorator.name === 'LineId')
    .map(decorator => decorator.args[0])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim())
}

function getDecoratorTextKeys(decorators: readonly QuaScriptDecorator[]): string[] {
  return decorators
    .filter(decorator => decorator.name === 'TextKey' || decorator.name === 'I18nKey' || decorator.name === 'L10nKey')
    .map(decorator => decorator.args[0])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim())
}

function getExpressionTextKeys(expressions: readonly string[]): string[] {
  return expressions.flatMap((expression) => {
    try {
      const ast = parse(`(${expression})`, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators'],
      })
      const statement = ast.program.body[0]
      const expr = statement?.type === 'ExpressionStatement' ? statement.expression : undefined
      if (
        expr?.type === 'CallExpression'
        && expr.callee.type === 'Identifier'
        && (expr.callee.name === '$t' || expr.callee.name === 't')
      ) {
        const key = expr.arguments[0]
        if (key?.type === 'StringLiteral' && key.value.trim()) {
          return [key.value.trim()]
        }
      }
    }
    catch {
      return []
    }
    return []
  })
}

function normalizeExpression(expression: string): string {
  return expression.replace(/\s+/g, ' ').trim()
}

function replaceSourceRanges(source: string, replacements: Array<{ range: SourceRange, text: string }>): string {
  return [...replacements]
    .sort((left, right) => right.range.start.offset - left.range.start.offset)
    .reduce(
      (current, replacement) =>
        `${current.slice(0, replacement.range.start.offset)}${replacement.text}${current.slice(replacement.range.end.offset)}`,
      source,
    )
}

function stableHash(value: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function escapeSingleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
}
