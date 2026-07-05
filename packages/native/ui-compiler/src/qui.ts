import type {
  NativeQuiAstNode,
  NativeQuiDocument,
  NativeQuiNode,
  NativeUiCompletionItem,
  NativeUiHover,
  NativeUiLanguageOptions,
} from './types'
import { collectQuiActionDescriptors } from './qui-actions'
import { formatQuiSource } from './qui-format'
import {
  collectQuiImports,
  inferImportedComponentNames,
  validateQuiImports,
} from './qui-imports'
import { collectQuiProps } from './qui-props'
import { validateQuiActionTargets, validateQuiProps } from './qui-semantics'
import { parseQuiStructureTree, validateQuiStructure } from './qui-structure'
import {
  findNativeUiComponent,
  nativeQuiDirectiveNames,
  nativeUiComponents,
} from './registry'
import {
  collectBalancedDelimiterDiagnostics,
  createLineStarts,
  maskSourceLiterals,
  wordAt,
} from './source'

export function analyzeQuiSource(source: string, options: NativeUiLanguageOptions = {}): NativeQuiDocument {
  const lineStarts = createLineStarts(source)
  const masked = maskSourceLiterals(source)
  const diagnostics = [
    ...collectBalancedDelimiterDiagnostics(source, lineStarts, 'qui'),
  ]
  const imports = collectQuiImports(source, lineStarts, diagnostics)
  const props = collectQuiProps(source, masked, lineStarts)
  const actions = collectQuiActionDescriptors(props)
  const tree = parseQuiStructureTree(source, masked, lineStarts)
  const nodes = collectQuiNodesFromTree(tree)

  validateQuiProps(props, diagnostics)
  validateQuiStructure(source, masked, lineStarts, diagnostics)
  validateQuiActionTargets(tree, diagnostics)
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
    actions,
    imports,
    nodes,
    props,
    diagnostics,
    tree,
  }
}

export { formatQuiSource }

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
    const content = `\n\nContent: ${component.content}`
    const slots = component.slots?.length
      ? `\n\nSlots: ${component.slots.join(', ')}`
      : ''
    const parts = component.styleParts?.length
      ? `\n\nStyle parts: ${component.styleParts.join(', ')}`
      : ''
    return {
      contents: `**${component.name}** (${component.kind})\n\n${component.description}${content}${slots}${parts}`,
    }
  }

  if ((nativeQuiDirectiveNames as readonly string[]).includes(word.text)) {
    return {
      contents: `**${word.text}**\n\nQUI directive handled by the native UI compiler.`,
    }
  }

  return undefined
}

function collectQuiNodesFromTree(tree: readonly NativeQuiAstNode[]): NativeQuiNode[] {
  const nodes: NativeQuiNode[] = []
  visitQuiAstNodes(tree, (node) => {
    if (node.kind !== 'component')
      return
    nodes.push({
      classes: node.classes,
      name: node.name,
      nameRange: node.nameRange,
      range: node.range,
    })
  })
  return nodes
}

function visitQuiAstNodes(
  nodes: readonly NativeQuiAstNode[],
  visit: (node: NativeQuiAstNode) => void,
): void {
  for (const node of nodes) {
    visit(node)
    visitQuiAstNodes(node.children, visit)
  }
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
