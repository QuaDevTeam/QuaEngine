import generateModule from '@babel/generator'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { parseQuaScriptDocument } from './document'

const generateCode = resolveCallableDefault(generateModule)

function resolveCallableDefault<T extends (...args: any[]) => unknown>(module: T | { default?: T }): T {
  const maybeDefault = (module as { default?: T }).default
  return typeof maybeDefault === 'function'
    ? maybeDefault
    : module as T
}

export function generateQuaScriptModuleDeclaration(source: string): string {
  const document = parseQuaScriptDocument(source)
  const errors = document.diagnostics.filter(diagnostic => diagnostic.severity === 'error')
  if (errors.length > 0) {
    throw new Error(errors.map(error => error.message).join('\n'))
  }

  const moduleScript = document.moduleScript?.content.trim() || ''
  const declarations = extractTypeDeclarations(moduleScript)
  const scopeType = hasExportedScopeType(moduleScript) ? 'Scope' : 'Record<string, unknown>'
  const optional = hasExportedScopeType(moduleScript) ? '' : '?'

  return [
    'import type { GameStep } from "@quajs/engine";',
    declarations,
    `declare const createQuaScript: (scope${optional}: ${scopeType}) => GameStep[];`,
    'export default createQuaScript;',
  ]
    .filter(part => part.trim().length > 0)
    .join('\n\n')
}

function extractTypeDeclarations(moduleScript: string): string {
  if (!moduleScript.trim()) {
    return ''
  }

  const parsed = parse(moduleScript, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'decorators'],
  })

  const body = parsed.program.body.filter((node) => {
    if (t.isImportDeclaration(node)) {
      return true
    }
    if (t.isExportNamedDeclaration(node)) {
      return !node.declaration
        || t.isTSInterfaceDeclaration(node.declaration)
        || t.isTSTypeAliasDeclaration(node.declaration)
    }
    return t.isTSInterfaceDeclaration(node) || t.isTSTypeAliasDeclaration(node)
  })

  return generateCode(t.program(body), {
    compact: false,
    retainLines: false,
  }).code
}

function hasExportedScopeType(source: string): boolean {
  return /\bexport\s+(?:interface|type)\s+Scope\b/.test(source)
}
