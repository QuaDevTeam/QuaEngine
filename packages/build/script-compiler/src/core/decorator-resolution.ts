import type { ParserPlugin } from '@babel/parser'
import type { DecoratorMapping } from './types'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { mergeDecoratorMappings } from './types'

const HOST_SOURCE_PARSER_PLUGINS: ParserPlugin[] = ['typescript', 'jsx', 'decorators']

export interface QuaScriptDecoratorResolutionOptions {
  autoCollectDecorators?: boolean
  availableDecoratorMappings?: DecoratorMapping
  decoratorMappings?: DecoratorMapping
}

export function resolveBaseDecoratorMappings(
  options: QuaScriptDecoratorResolutionOptions = {},
): DecoratorMapping {
  const {
    autoCollectDecorators = true,
    availableDecoratorMappings = {},
    decoratorMappings = {},
  } = options

  return mergeDecoratorMappings({
    ...(autoCollectDecorators ? availableDecoratorMappings : {}),
    ...decoratorMappings,
  })
}

export function resolveDecoratorMappingsForProgram(
  program: t.Program,
  options: QuaScriptDecoratorResolutionOptions = {},
): DecoratorMapping {
  const {
    autoCollectDecorators = true,
    availableDecoratorMappings = {},
    decoratorMappings = {},
  } = options

  return mergeDecoratorMappings({
    ...(autoCollectDecorators ? availableDecoratorMappings : {}),
    ...collectImportedDecoratorMappings(program, availableDecoratorMappings),
    ...decoratorMappings,
  })
}

export function resolveDecoratorMappingsForModuleSource(
  source: string,
  options: QuaScriptDecoratorResolutionOptions = {},
): DecoratorMapping {
  if (!source.trim()) {
    return resolveBaseDecoratorMappings(options)
  }

  const parsed = parse(source, {
    sourceType: 'module',
    plugins: HOST_SOURCE_PARSER_PLUGINS,
  })

  return resolveDecoratorMappingsForProgram(parsed.program, options)
}

export function collectImportedDecoratorMappings(
  program: t.Program,
  availableDecoratorMappings: DecoratorMapping,
): DecoratorMapping {
  const mappings: DecoratorMapping = {}

  for (const source of collectDecoratorImportSources(program)) {
    for (const [decoratorName, mapping] of Object.entries(availableDecoratorMappings)) {
      if (mapping.module !== source) {
        continue
      }

      const existing = mappings[decoratorName]
      if (existing && (existing.module !== mapping.module || existing.function !== mapping.function)) {
        throw new Error(`Decorator @${decoratorName} is provided by multiple imported modules: "${existing.module}" and "${mapping.module}".`)
      }

      mappings[decoratorName] = mapping
    }
  }

  return mappings
}

export function collectDecoratorImportSources(program: t.Program): Set<string> {
  const sources = new Set<string>()

  program.body.forEach((node) => {
    if (!t.isImportDeclaration(node) || node.importKind === 'type') {
      return
    }

    const hasValueImport = node.specifiers.length === 0 || node.specifiers.some((specifier) => {
      if (!t.isImportSpecifier(specifier)) {
        return true
      }
      return specifier.importKind !== 'type'
    })

    if (hasValueImport) {
      sources.add(node.source.value)
    }
  })

  return sources
}
