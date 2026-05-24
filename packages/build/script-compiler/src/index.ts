import type { DecoratorMapping } from './core/types'
import type { QuaScriptTransformerOptions } from './core/transformer'
import process from 'node:process'
import { getHotReloadManager } from './core/hot-reload'
import { createHotReloadAwareTransformer } from './integrations/hot-reload-transformer'
import { createPluginAwareTransformer } from './integrations/plugin-aware-transformer'

export { generateQuaScriptModuleDeclaration } from './core/declaration'
export {
  applyQuaScriptLintRules,
  applyQuaScriptTextEdits,
  createFullDocumentEdit,
  createMinimalTextEdit,
  createQuaScriptLintResult,
  resolveQuaScriptRuleSeverity,
  summarizeQuaScriptDiagnostics,
} from './core/diagnostics'
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
export {
  collectQuaScriptStyleDiagnostics,
  getQuaScriptFixAllEdits,
  lintQuaScriptSource,
  QUASCRIPT_STYLE_RULES,
} from './core/lint'
export type { QuaScriptSourceLintOptions } from './core/lint'
export {
  DEFAULT_QUASCRIPT_TOOLING_CONFIG,
  loadQuaScriptToolingConfig,
  mergeQuaScriptToolingConfig,
} from './core/config'
export { extractQuaScriptStoryDeclaration } from './core/story-declaration'
export { createLineStarts, parseQuaScriptDocument, positionAt, rangeFromOffsets } from './core/document'
export {
  applyQuaScriptLocaleOverlay,
  compileLocalizedQuaScriptModuleToTs,
  createQuaScriptLocaleSkeleton,
  createQuaScriptLocaleSyncState,
  extractQuaScriptLocalizableUnits,
  syncQuaScriptLocale,
} from './core/localization'
export type {
  CompileLocalizedQuaScriptModuleOptions,
  QuaScriptLocalizableUnit,
  QuaScriptLocalizableUnitKind,
  QuaScriptLocaleSyncResult,
  QuaScriptLocaleSyncState,
  QuaScriptLocaleSyncStateUnit,
  QuaScriptLocaleSyncStatus,
  SyncQuaScriptLocaleOptions,
} from './core/localization'

// Hot-reload manager
export {
  getHotReloadManager,
  HotReloadManager,
  resetHotReloadManager,
} from './core/hot-reload'
export type { HotReloadCallback, HotReloadEvent } from './core/hot-reload'
export { QuaScriptParser } from './core/parser'
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
  QuaScriptDiagnosticSeverity,
  QuaScriptDiagnosticSource,
  QuaScriptDiagnostic,
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
  clearDecoratorCompilerCache,
  createDefaultDecoratorCompilerRegistry,
  DecoratorCompilerRegistry,
  loadDecoratorCompilerRegistry,
  loadPackageDecoratorMappingsSync,
  loadProjectDecoratorMappings,
} from './decorators'
export type {
  DecoratorCompilationResult,
  DecoratorCompileContext,
  DecoratorCompileInput,
  DecoratorCompiler,
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
    decoratorMappings?: DecoratorMapping
    /** Project root for plugin discovery */
    projectRoot?: string
    /** Enable hot-reload features */
    hotReload?: boolean
    runtimeModule?: QuaScriptTransformerOptions['runtimeModule']
  },
): string {
  const { hotReload = process.env.NODE_ENV !== 'production', ...restOptions } = options || {}

  const transformer = hotReload
    ? createHotReloadAwareTransformer(
        restOptions.decoratorMappings,
        {
          projectRoot: restOptions.projectRoot,
          runtimeModule: restOptions.runtimeModule,
        },
      )
    : createPluginAwareTransformer(
        restOptions.decoratorMappings,
        {
          projectRoot: restOptions.projectRoot,
          runtimeModule: restOptions.runtimeModule,
        },
      )

  if (hotReload) {
    getHotReloadManager(restOptions.projectRoot).enable()
  }

  return transformer.transformSource(source)
}

/**
 * Compile a standalone QuaScript source file into a TypeScript module.
 */
export function compileQuaScriptModuleToTs(
  source: string,
  options?: {
    decoratorMappings?: DecoratorMapping
    /** Project root for plugin discovery */
    projectRoot?: string
    /** Enable hot-reload features */
    hotReload?: boolean
    runtimeModule?: QuaScriptTransformerOptions['runtimeModule']
  },
): string {
  const { hotReload = process.env.NODE_ENV !== 'production', ...restOptions } = options || {}

  const transformer = hotReload
    ? createHotReloadAwareTransformer(
        restOptions.decoratorMappings,
        {
          projectRoot: restOptions.projectRoot,
          runtimeModule: restOptions.runtimeModule,
        },
      )
    : createPluginAwareTransformer(
        restOptions.decoratorMappings,
        {
          projectRoot: restOptions.projectRoot,
          runtimeModule: restOptions.runtimeModule,
        },
      )

  if (hotReload) {
    getHotReloadManager(restOptions.projectRoot).enable()
  }

  return transformer.transformModuleSource(source)
}
