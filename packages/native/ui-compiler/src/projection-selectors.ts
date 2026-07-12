import type {
  NativeQssDocument,
  NativeQssInteractivePseudoState,
  NativeQssResolvedNodeStyle,
  NativeQssRule,
  NativeQuiAstNode,
} from './types'
import { propString } from './projection-props'
import { resolveNativeQssDeclarations } from './qss-resolved-style'
import { splitTopLevel } from './source'

export interface NativeQuiProjectionStyleContext {
  ancestors: readonly NativeQuiAstNode[]
  node: NativeQuiAstNode
}

interface SelectorSegment {
  classes: string[]
  component?: string
  id?: string
}

interface SelectorChain {
  direct: boolean[]
  pseudoState?: NativeQssInteractivePseudoState
  segments: SelectorSegment[]
  specificity: number
}

interface MatchedRule {
  order: number
  rule: NativeQssRule
  specificity: number
}

export function resolveStyleForNode(
  context: NativeQuiProjectionStyleContext,
  qssDocuments: readonly NativeQssDocument[],
): NativeQssResolvedNodeStyle {
  const rules = qssDocuments.flatMap(document => document.rules)
  const baseMatched = matchingRules(context, rules)
  const resolved = resolveNativeQssDeclarations(baseMatched.flatMap(item => item.rule.declarations))

  for (const state of NATIVE_INTERACTIVE_PSEUDO_STATES) {
    const stateMatched = matchingRules(context, rules, state)
    if (stateMatched.length === 0)
      continue
    const stateResolved = resolveNativeQssDeclarations(
      [...baseMatched, ...stateMatched]
        .sort(compareMatchedRules)
        .flatMap(item => item.rule.declarations),
    )
    resolved.stateStyles ||= {}
    resolved.stateStyles[state] = {
      style: stateResolved.style,
      ...(stateResolved.layout?.transform
        ? { layout: { transform: stateResolved.layout.transform } }
        : {}),
    }
  }

  return resolved
}

const NATIVE_INTERACTIVE_PSEUDO_STATES: readonly NativeQssInteractivePseudoState[] = [
  'hover',
  'active',
  'focus',
  'focus-visible',
]

function matchingRules(
  context: NativeQuiProjectionStyleContext,
  rules: readonly NativeQssRule[],
  pseudoState?: NativeQssInteractivePseudoState,
): MatchedRule[] {
  return rules
    .flatMap((rule, order): MatchedRule[] => matchingSpecificities(context, rule, pseudoState)
      .map(specificity => ({ rule, order, specificity })))
    .sort(compareMatchedRules)
}

function compareMatchedRules(left: MatchedRule, right: MatchedRule): number {
  return left.specificity - right.specificity || left.order - right.order
}

function matchingSpecificities(
  context: NativeQuiProjectionStyleContext,
  rule: NativeQssRule,
  pseudoState?: NativeQssInteractivePseudoState,
): number[] {
  return splitTopLevel(rule.selector, ',')
    .map(item => parseSelectorChain(item.text.trim()))
    .filter((chain): chain is SelectorChain => Boolean(chain))
    .filter(chain => chain.pseudoState === pseudoState)
    .filter(chain => matchesSelectorChain(context, chain))
    .map(chain => chain.specificity)
}

function parseSelectorChain(selector: string): SelectorChain | undefined {
  if (!selector || selector.includes('::') || selector.includes('['))
    return undefined

  const pseudoMatch = /:(hover|active|focus-visible|focus)$/.exec(selector)
  const pseudoState = pseudoMatch?.[1] as NativeQssInteractivePseudoState | undefined
  const selectorWithoutPseudo = pseudoMatch
    ? selector.slice(0, -pseudoMatch[0].length)
    : selector
  if (selectorWithoutPseudo.includes(':'))
    return undefined

  const normalized = selectorWithoutPseudo.replace(/\s*>\s*/g, ' > ').trim()
  const rawParts = normalized.split(/\s+/).filter(Boolean)
  if (rawParts.length === 0 || rawParts.includes('*'))
    return undefined

  const segments: SelectorSegment[] = []
  const direct: boolean[] = []
  let nextDirect = false
  for (const part of rawParts) {
    if (part === '>') {
      if (segments.length === 0 || nextDirect)
        return undefined
      nextDirect = true
      continue
    }

    const segment = parseSelectorSegment(part)
    if (!segment)
      return undefined

    segments.push(segment)
    if (segments.length > 1)
      direct.push(nextDirect)
    nextDirect = false
  }

  return segments.length > 0 && !nextDirect
    ? {
        segments,
        direct,
        pseudoState,
        specificity: selectorSpecificity(segments) + (pseudoState ? 10 : 0),
      }
    : undefined
}

function parseSelectorSegment(source: string): SelectorSegment | undefined {
  const component = /^[A-Z][A-Za-z0-9_]*/.exec(source)?.[0]
  let cursor = component?.length ?? 0
  const segment: SelectorSegment = { classes: [] }
  if (component)
    segment.component = component

  while (cursor < source.length) {
    const prefix = source[cursor]
    const match = /^[-_A-Za-z][\w-]*/.exec(source.slice(cursor + 1))
    if (!match)
      return undefined

    if (prefix === '.') {
      segment.classes.push(match[0])
    }
    else if (prefix === '#') {
      if (segment.id)
        return undefined
      segment.id = match[0]
    }
    else {
      return undefined
    }
    cursor += match[0].length + 1
  }

  return segment.component || segment.id || segment.classes.length > 0 ? segment : undefined
}

function selectorSpecificity(segments: readonly SelectorSegment[]): number {
  return segments.reduce((total, segment) => {
    const id = segment.id ? 100 : 0
    const classes = segment.classes.length * 10
    const component = segment.component ? 1 : 0
    return total + id + classes + component
  }, 0)
}

function matchesSelectorChain(context: NativeQuiProjectionStyleContext, chain: SelectorChain): boolean {
  const last = chain.segments[chain.segments.length - 1]
  if (!matchesSegment(context.node, last))
    return false

  let ancestorIndex = context.ancestors.length - 1
  for (let segmentIndex = chain.segments.length - 2; segmentIndex >= 0; segmentIndex -= 1) {
    const segment = chain.segments[segmentIndex]
    const mustBeDirect = chain.direct[segmentIndex]

    if (mustBeDirect) {
      if (ancestorIndex < 0 || !matchesSegment(context.ancestors[ancestorIndex], segment))
        return false
      ancestorIndex -= 1
      continue
    }

    let matched = false
    while (ancestorIndex >= 0) {
      if (matchesSegment(context.ancestors[ancestorIndex], segment)) {
        matched = true
        ancestorIndex -= 1
        break
      }
      ancestorIndex -= 1
    }
    if (!matched)
      return false
  }

  return true
}

function matchesSegment(node: NativeQuiAstNode, segment: SelectorSegment): boolean {
  if (node.kind !== 'component')
    return false
  if (segment.component && node.name !== segment.component)
    return false
  if (segment.id && propString(node.props, 'id') !== segment.id)
    return false
  return segment.classes.every(className => node.classes.includes(className))
}
