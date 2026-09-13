import {
  formatNativeUiDocumentEdits,
  fullDocumentRange,
  getNativeUiAssetCodeActions,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  lintNativeUiDocument,
} from '@quajs/native-language-server'
import {
  analyzeNativeUiDocument,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
  resolveNativeQssDeclarations,
} from '@quajs/native-ui-compiler'
import type { BenchmarkDefinition } from './types'
import type { NativeAuthoringSmokeContext } from './authoring-smoke-context'
import { countQuiAst, positionAtOffset } from './authoring-utils'
import { byteLength } from './runner'

export function createNativeAuthoringDocumentParseBenchmarkDefinitions(
  context: NativeAuthoringSmokeContext,
): BenchmarkDefinition[] {
  const { fixtures } = context

  return [
    {
      bench: 'native.authoring.qui.parse_validate.smoke',
      defaultIterations: 32,
      documentBytes: byteLength(fixtures.qui),
      run(iterations) {
        let checksum = 0
        let actions = 0
        let astComponents = 0
        let astNodes = 0
        let astSlots = 0
        let diagnostics = 0
        let nodes = 0
        let props = 0
        for (let index = 0; index < iterations; index += 1) {
          const document = analyzeNativeUiDocument(fixtures.qui, {
            filePath: 'bench/menu.qui',
            lint: {
              strictComponents: true,
            },
          })
          if (document.kind === 'qui') {
            const ast = countQuiAst(document.tree)
            actions += document.actions.length
            astComponents += ast.components
            astNodes += ast.nodes
            astSlots += ast.slots
            nodes += document.nodes.length
            props += document.props.length
            checksum += document.imports.length
              + document.nodes.length
              + document.props.length
              + document.actions.length
              + ast.nodes
          }
          diagnostics += document.diagnostics.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            actions,
            astComponents,
            astNodes,
            astSlots,
            nodes,
            props,
          },
        }
      },
    },
    {
      bench: 'native.authoring.qss.parse_validate.smoke',
      defaultIterations: 32,
      documentBytes: byteLength(fixtures.qss),
      run(iterations) {
        let checksum = 0
        let declarations = 0
        let diagnostics = 0
        let rules = 0
        for (let index = 0; index < iterations; index += 1) {
          const document = analyzeNativeUiDocument(fixtures.qss, {
            filePath: 'bench/menu.qss',
            lint: {
              strictComponents: true,
            },
          })
          if (document.kind === 'qss') {
            rules += document.rules.length
            declarations += document.rules.reduce((total, rule) => total + rule.declarations.length, 0)
            checksum += document.atRules.length + document.rules.length + declarations
          }
          diagnostics += document.diagnostics.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            declarations,
            rules,
          },
        }
      },
    },
    {
      bench: 'native.authoring.qss.resolve_style.smoke',
      defaultIterations: 32,
      documentBytes: byteLength(fixtures.qss),
      run(iterations) {
        let checksum = 0
        let diagnostics = 0
        let resolvedDeclarations = 0
        let resolvedRules = 0
        let styleFields = 0
        let zIndexes = 0
        for (let index = 0; index < iterations; index += 1) {
          const document = analyzeNativeUiDocument(fixtures.qss, {
            filePath: 'bench/menu.qss',
            lint: {
              strictComponents: true,
            },
          })
          if (document.kind === 'qss') {
            for (const rule of document.rules) {
              const resolved = resolveNativeQssDeclarations(rule.declarations)
              const fieldCount = Object.keys(resolved.style).length
              resolvedRules += 1
              resolvedDeclarations += rule.declarations.length
              styleFields += fieldCount
              zIndexes += resolved.zIndex === undefined ? 0 : 1
              checksum += fieldCount + (resolved.zIndex ?? 0)
            }
          }
          diagnostics += document.diagnostics.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            resolvedDeclarations,
            resolvedRules,
            styleFields,
            zIndexes,
          },
        }
      },
    },
  ]
}

export function createNativeAuthoringDocumentToolingBenchmarkDefinitions(
  context: NativeAuthoringSmokeContext,
): BenchmarkDefinition[] {
  const {
    fixtures,
    invalidAssetDiagnostics,
    invalidAssetSource,
    qssCompletionOffset,
    qssHoverOffset,
    quiCompletionOffset,
    quiHoverOffset,
  } = context

  return [
    {
      bench: 'native.authoring.qui.format.smoke',
      defaultIterations: 24,
      documentBytes: byteLength(fixtures.qui),
      run(iterations) {
        let checksum = 0
        let diagnostics = 0
        let formattedBytes = 0
        for (let index = 0; index < iterations; index += 1) {
          const formatted = formatNativeUiDocument(fixtures.qui, {
            filePath: 'bench/menu.qui',
            format: {
              indentSize: 2,
              insertFinalNewline: true,
            },
          })
          const edits = formatNativeUiDocumentEdits(fixtures.qui, {
            filePath: 'bench/menu.qui',
          })
          formattedBytes += byteLength(formatted)
          diagnostics += lintNativeUiDocument(formatted, {
            filePath: 'bench/menu.qui',
          }).diagnostics.length
          checksum += formatted.length + edits.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            formattedBytes,
          },
        }
      },
    },
    {
      bench: 'native.authoring.qss.format.smoke',
      defaultIterations: 24,
      documentBytes: byteLength(fixtures.qss),
      run(iterations) {
        let checksum = 0
        let declarations = 0
        let diagnostics = 0
        let formatIdempotentPasses = 0
        let formattedBytes = 0
        let resolvedRules = 0
        let styleFields = 0
        for (let index = 0; index < iterations; index += 1) {
          const formatted = formatNativeUiDocument(fixtures.qss, {
            filePath: 'bench/menu.qss',
            format: {
              indentSize: 2,
              insertFinalNewline: true,
            },
          })
          const formattedAgain = formatNativeUiDocument(formatted, {
            filePath: 'bench/menu.qss',
            format: {
              indentSize: 2,
              insertFinalNewline: true,
            },
          })
          const edits = formatNativeUiDocumentEdits(fixtures.qss, {
            filePath: 'bench/menu.qss',
          })
          const document = analyzeNativeUiDocument(formatted, {
            filePath: 'bench/menu.qss',
          })
          formattedBytes += byteLength(formatted)
          diagnostics += lintNativeUiDocument(formatted, {
            filePath: 'bench/menu.qss',
          }).diagnostics.length
          if (formattedAgain === formatted)
            formatIdempotentPasses += 1
          if (document.kind === 'qss') {
            declarations += document.rules.reduce((total, rule) => total + rule.declarations.length, 0)
            for (const rule of document.rules) {
              const resolved = resolveNativeQssDeclarations(rule.declarations)
              const fieldCount = Object.keys(resolved.style).length
              resolvedRules += 1
              styleFields += fieldCount
              checksum += fieldCount + (resolved.zIndex ?? 0)
            }
          }
          checksum += formatted.length + edits.length + (formattedAgain === formatted ? 1 : 0)
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            declarations,
            formatIdempotentPasses,
            formattedBytes,
            resolvedRules,
            styleFields,
          },
        }
      },
    },
    {
      bench: 'native.authoring.completion_hover.smoke',
      defaultIterations: 128,
      documentBytes: byteLength(fixtures.qui) + byteLength(fixtures.qss),
      run(iterations) {
        let checksum = 0
        const diagnostics = 0
        let completionItems = 0
        let hoverHits = 0
        for (let index = 0; index < iterations; index += 1) {
          const quiCompletions = getNativeUiLanguageCompletions(
            fixtures.qui,
            positionAtOffset(fixtures.qui, quiCompletionOffset),
            { filePath: 'bench/menu.qui' },
          )
          const qssCompletions = getNativeUiCompletions(
            fixtures.qss,
            qssCompletionOffset,
            { filePath: 'bench/menu.qss' },
          )
          const quiHover = getNativeUiLanguageHover(
            fixtures.qui,
            positionAtOffset(fixtures.qui, quiHoverOffset),
            { filePath: 'bench/menu.qui' },
          )
          const qssHover = getNativeUiHover(
            fixtures.qss,
            qssHoverOffset,
            { filePath: 'bench/menu.qss' },
          )
          completionItems += quiCompletions.length + qssCompletions.length
          hoverHits += (quiHover ? 1 : 0) + (qssHover ? 1 : 0)
          checksum += completionItems + hoverHits
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            completionItems,
            hoverHits,
          },
        }
      },
    },
    {
      bench: 'native.authoring.asset_code_actions.smoke',
      defaultIterations: 64,
      documentBytes: byteLength(invalidAssetSource),
      run(iterations) {
        let checksum = 0
        const diagnostics = 0
        let assetDiagnostics = 0
        let codeActions = 0
        let fixAllActions = 0
        let fixAllEdits = 0
        let quickFixes = 0
        for (let index = 0; index < iterations; index += 1) {
          const actions = getNativeUiAssetCodeActions({
            diagnostics: invalidAssetDiagnostics,
            range: fullDocumentRange(invalidAssetSource),
            source: invalidAssetSource,
            uri: 'file:///bench/invalid-assets.qui',
          })
          const fixAll = actions.find(action => action.kind === 'source.fixAll.quaNativeAssets')
          assetDiagnostics += invalidAssetDiagnostics.length
          codeActions += actions.length
          fixAllActions += fixAll ? 1 : 0
          fixAllEdits += fixAll?.edits.length ?? 0
          quickFixes += actions.filter(action => action.kind === 'quickfix').length
          checksum += actions.length
            + (fixAll?.edits.length ?? 0)
            + actions.reduce((total, action) => total + action.edits.length + action.diagnostics.length, 0)
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            assetDiagnostics,
            codeActions,
            fixAllActions,
            fixAllEdits,
            quickFixes,
          },
        }
      },
    },
  ]
}
