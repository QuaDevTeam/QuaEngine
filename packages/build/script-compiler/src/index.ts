import type { QuaScriptTransformerOptions } from './core/transformer'
import type { DecoratorMapping } from './core/types'
import process from 'node:process'
import { resolveQuaScriptDecoratorCompileOptions } from './core/config'
import { getHotReloadManager } from './core/hot-reload'
import { createHotReloadAwareTransformer } from './integrations/hot-reload-transformer'
import { createPluginAwareTransformer, createPluginAwareTransformerAsync } from './integrations/plugin-aware-transformer'

export {
  DEFAULT_QUASCRIPT_TOOLING_CONFIG,
  loadQuaScriptToolingConfig,
  mergeQuaScriptToolingConfig,
  resolveQuaScriptDecoratorCompileOptions,
} from './core/config'
export { generateQuaScriptModuleDeclaration } from './core/declaration'
export {
  collectDecoratorImportSources,
  collectImportedDecoratorMappings,
  resolveBaseDecoratorMappings,
  resolveDecoratorMappingsForModuleSource,
  resolveDecoratorMappingsForProgram,
} from './core/decorator-resolution'
export type { QuaScriptDecoratorResolutionOptions } from './core/decorator-resolution'
export {
  applyQuaScriptLintRules,
  applyQuaScriptTextEdits,
  createFullDocumentEdit,
  createMinimalTextEdit,
  createQuaScriptLintResult,
  resolveQuaScriptRuleSeverity,
  summarizeQuaScriptDiagnostics,
} from './core/diagnostics'
export { createLineStarts, parseQuaScriptDocument, positionAt, rangeFromOffsets } from './core/document'
export { fileMatchesQuaScriptConfig, resolveQuaScriptFiles } from './core/files'
export type { QuaScriptFileMatchOptions } from './core/files'
export {
  collectScriptRanges,
  detectLineEnding,
  formatQuaScript,
  formatQuaScriptDocument,
  formatQuaScriptWithEdits,
  splitQuaScriptSourceLines,
} from './core/format'
export type { QuaScriptScriptRange, QuaScriptSourceLine } from './core/format'
// Hot-reload manager
export {
  getHotReloadManager,
  HotReloadManager,
  resetHotReloadManager,
} from './core/hot-reload'
export type { HotReloadCallback, HotReloadEvent } from './core/hot-reload'
export {
  collectQuaScriptStyleDiagnostics,
  getQuaScriptFixAllEdits,
  lintQuaScriptSource,
  QUASCRIPT_STYLE_RULES,
} from './core/lint'
export type { QuaScriptSourceLintOptions } from './core/lint'
export {
  applyQuaScriptLocaleOverlay,
  compileLocalizedQuaScriptModuleToTs,
  compileLocalizedQuaScriptModuleToTsAsync,
  createQuaScriptLocaleSkeleton,
  createQuaScriptLocaleSyncState,
  extractQuaScriptLocalizableUnits,
  syncQuaScriptLocale,
} from './core/localization'

export type {
  CompileLocalizedQuaScriptModuleOptions,
  QuaScriptLocaleSyncResult,
  QuaScriptLocaleSyncState,
  QuaScriptLocaleSyncStateUnit,
  QuaScriptLocaleSyncStatus,
  QuaScriptLocalizableUnit,
  QuaScriptLocalizableUnitKind,
  SyncQuaScriptLocaleOptions,
} from './core/localization'
export { QuaScriptParser } from './core/parser'
export { extractQuaScriptStoryDeclaration } from './core/story-declaration'
export { QuaScriptTransformer } from './core/transformer'
export type { QuaScriptTransformerOptions } from './core/transformer'

// Core types
export type {
  DecoratorMapping,
  ParsedQuaScript,
  ParsedQuaScriptDocument,
  QuaScriptAction,
  QuaScriptChoice,
  QuaScriptDecorator,
  QuaScriptDiagnostic,
  QuaScriptDiagnosticSeverity,
  QuaScriptDiagnosticSource,
  QuaScriptDialogue,
  QuaScriptDocumentBlock,
  QuaScriptFix,
  QuaScriptFormatOptions,
  QuaScriptFormatResult,
  QuaScriptLintOptions,
  QuaScriptLintResult,
  QuaScriptLintRule,
  QuaScriptRuleSeverity,
  QuaScriptStep,
  QuaScriptTextEdit,
  QuaScriptToolingConfig,
  SourcePosition,
  SourceRange,
  StoryDeclaration,
} from './core/types'

export { DEFAULT_DECORATOR_MAPPINGS, mergeDecoratorMappings } from './core/types'
export {
  loadPackageDecoratorMappingsSync,
  loadProjectDecoratorCompilers,
  loadProjectDecoratorCompilersSync,
  loadProjectDecoratorMappings,
  loadProjectDecoratorMappingsSync,
} from './decorators'
// Hot-reload transformers
export {
  createHotReloadAwareTransformer,
  HotReloadAwareTransformer,
} from './integrations/hot-reload-transformer'

// Plugin-aware transformers
export { createPluginAwareTransformer, PluginAwareQuaScriptTransformer } from './integrations/plugin-aware-transformer'
export { createPluginAwareTransformerAsync } from './integrations/plugin-aware-transformer'

// Vite plugin with hot-reload support
export { quaScriptPlugin } from './integrations/vite-plugin'
export type { QuaScriptPluginOptions } from './integrations/vite-plugin'

/**
 * Convenience function to compile QuaScript string (with hot-reload support)
 */
export function compileQuaScript(
  source: string,
  options?: {
    autoCollectDecorators?: boolean
    decoratorMappings?: DecoratorMapping
    /** Project root for plugin discovery */
    projectRoot?: string
    /** Enable hot-reload features */
    hotReload?: boolean
    decoratorCompilers?: QuaScriptTransformerOptions['decoratorCompilers']
    runtimeModule?: QuaScriptTransformerOptions['runtimeModule']
  },
): string {
  const { hotReload = process.env.NODE_ENV !== 'production', ...restOptions } = options || {}
  const resolvedDecoratorOptions = resolveQuaScriptDecoratorCompileOptions({
    autoCollectDecorators: restOptions.autoCollectDecorators,
    decoratorMappings: restOptions.decoratorMappings,
    projectRoot: restOptions.projectRoot,
  })

  const transformer = hotReload
    ? createHotReloadAwareTransformer(
        resolvedDecoratorOptions.decoratorMappings,
        {
          projectRoot: restOptions.projectRoot,
          autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
          decoratorCompilers: restOptions.decoratorCompilers,
          runtimeModule: restOptions.runtimeModule,
        },
      )
    : createPluginAwareTransformer(
        resolvedDecoratorOptions.decoratorMappings,
        {
          projectRoot: restOptions.projectRoot,
          autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
          decoratorCompilers: restOptions.decoratorCompilers,
          runtimeModule: restOptions.runtimeModule,
        },
      )

  if (hotReload) {
    getHotReloadManager(restOptions.projectRoot).enable()
  }

  return transformer.transformSource(source)
}

/**
 * Compile a QuaScript string to TypeScript using async plugin discovery.
 */
export async function compileQuaScriptAsync(
  source: string,
  options?: {
    autoCollectDecorators?: boolean
    decoratorCompilers?: QuaScriptTransformerOptions['decoratorCompilers']
    decoratorMappings?: DecoratorMapping
    /** Project root for plugin discovery */
    projectRoot?: string
    /** Enable hot-reload features */
    hotReload?: boolean
    runtimeModule?: QuaScriptTransformerOptions['runtimeModule']
  },
): Promise<string> {
  const { hotReload = false, ...restOptions } = options || {}
  const resolvedDecoratorOptions = resolveQuaScriptDecoratorCompileOptions({
    autoCollectDecorators: restOptions.autoCollectDecorators,
    decoratorMappings: restOptions.decoratorMappings,
    projectRoot: restOptions.projectRoot,
  })

  if (hotReload) {
    const transformer = createHotReloadAwareTransformer(
      resolvedDecoratorOptions.decoratorMappings,
      {
        projectRoot: restOptions.projectRoot,
        autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
        decoratorCompilers: restOptions.decoratorCompilers,
        runtimeModule: restOptions.runtimeModule,
      },
    )
    await transformer.updateDecoratorMappings({
      autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
      decoratorMappings: resolvedDecoratorOptions.decoratorMappings,
    })
    getHotReloadManager(restOptions.projectRoot).enable()
    return transformer.transformSource(source)
  }

  const transformer = await createPluginAwareTransformerAsync(
    resolvedDecoratorOptions.decoratorMappings,
    {
      projectRoot: restOptions.projectRoot,
      autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
      decoratorCompilers: restOptions.decoratorCompilers,
      runtimeModule: restOptions.runtimeModule,
    },
  )

  return transformer.transformSource(source)
}

/**
 * Compile a standalone QuaScript source file into a TypeScript module.
 */
export function compileQuaScriptModuleToTs(
  source: string,
  options?: {
    autoCollectDecorators?: boolean
    decoratorMappings?: DecoratorMapping
    /** Project root for plugin discovery */
    projectRoot?: string
    /** Enable hot-reload features */
    hotReload?: boolean
    decoratorCompilers?: QuaScriptTransformerOptions['decoratorCompilers']
    runtimeModule?: QuaScriptTransformerOptions['runtimeModule']
  },
): string {
  const { hotReload = process.env.NODE_ENV !== 'production', ...restOptions } = options || {}
  const resolvedDecoratorOptions = resolveQuaScriptDecoratorCompileOptions({
    autoCollectDecorators: restOptions.autoCollectDecorators,
    decoratorMappings: restOptions.decoratorMappings,
    projectRoot: restOptions.projectRoot,
  })

  const transformer = hotReload
    ? createHotReloadAwareTransformer(
        resolvedDecoratorOptions.decoratorMappings,
        {
          projectRoot: restOptions.projectRoot,
          autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
          decoratorCompilers: restOptions.decoratorCompilers,
          runtimeModule: restOptions.runtimeModule,
        },
      )
    : createPluginAwareTransformer(
        resolvedDecoratorOptions.decoratorMappings,
        {
          projectRoot: restOptions.projectRoot,
          autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
          decoratorCompilers: restOptions.decoratorCompilers,
          runtimeModule: restOptions.runtimeModule,
        },
      )

  if (hotReload) {
    getHotReloadManager(restOptions.projectRoot).enable()
  }

  return transformer.transformModuleSource(source)
}

/**
 * Compile a standalone QuaScript source file into a TypeScript module.
 */
export async function compileQuaScriptModuleToTsAsync(
  source: string,
  options?: {
    autoCollectDecorators?: boolean
    decoratorCompilers?: QuaScriptTransformerOptions['decoratorCompilers']
    decoratorMappings?: DecoratorMapping
    /** Project root for plugin discovery */
    projectRoot?: string
    /** Enable hot-reload features */
    hotReload?: boolean
    runtimeModule?: QuaScriptTransformerOptions['runtimeModule']
  },
): Promise<string> {
  const { hotReload = false, ...restOptions } = options || {}
  const resolvedDecoratorOptions = resolveQuaScriptDecoratorCompileOptions({
    autoCollectDecorators: restOptions.autoCollectDecorators,
    decoratorMappings: restOptions.decoratorMappings,
    projectRoot: restOptions.projectRoot,
  })

  if (hotReload) {
    const transformer = createHotReloadAwareTransformer(
      resolvedDecoratorOptions.decoratorMappings,
      {
        projectRoot: restOptions.projectRoot,
        autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
        decoratorCompilers: restOptions.decoratorCompilers,
        runtimeModule: restOptions.runtimeModule,
      },
    )
    await transformer.updateDecoratorMappings({
      autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
      decoratorMappings: resolvedDecoratorOptions.decoratorMappings,
    })
    getHotReloadManager(restOptions.projectRoot).enable()
    return transformer.transformModuleSource(source)
  }

  const transformer = await createPluginAwareTransformerAsync(
    resolvedDecoratorOptions.decoratorMappings,
    {
      projectRoot: restOptions.projectRoot,
      autoCollectDecorators: resolvedDecoratorOptions.autoCollectDecorators,
      decoratorCompilers: restOptions.decoratorCompilers,
      runtimeModule: restOptions.runtimeModule,
    },
  )

  return transformer.transformModuleSource(source)
}
