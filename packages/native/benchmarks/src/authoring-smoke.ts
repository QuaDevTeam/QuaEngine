import {
  buildNativeUiProjectIndex,
  formatNativeUiDocumentEdits,
  fullDocumentRange,
  getNativeUiAssetCodeActions,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  lintNativeUiDocument,
  updateNativeUiProjectIndex,
} from '@quajs/native-language-server'
import {
  analyzeNativeUiDocument,
  collectNativeUiSurfaceProjectionRequirements,
  compileNativeUiSurfaceProjection,
  createNativeUiSurfaceCompatibilityFromProjection,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
  isNativeQssDocument,
  isNativeQuiDocument,
  resolveNativeQssDeclarations,
} from '@quajs/native-ui-compiler'
import type { BenchmarkDefinition, NativeBenchmarkRecord, NativeBenchmarkRunOptions } from './types'
import {
  countQuiAst,
  countSurfaceProjection,
  createInvalidAssetSourceFixture,
  positionAtOffset,
} from './authoring-utils'
import {
  createNativeAuthoringBenchmarkFixtures,
  createUpdatedQuiProjectSource,
} from './fixtures'
import { byteLength, runBenchmarkDefinition } from './runner'

export function runNativeAuthoringSmokeBenchmarks(
  options: NativeBenchmarkRunOptions = {},
): NativeBenchmarkRecord[] {
  const fixtures = createNativeAuthoringBenchmarkFixtures()
  const quiCompletionOffset = fixtures.qui.indexOf('Button(action')
  const quiHoverOffset = fixtures.qui.indexOf('Button')
  const qssCompletionOffset = fixtures.qss.indexOf('background-color')
  const qssHoverOffset = fixtures.qss.indexOf('border-radius')
  const invalidAssetSource = createInvalidAssetSourceFixture()
  const invalidAssetDiagnostics = lintNativeUiDocument(invalidAssetSource, {
    filePath: 'bench/invalid-assets.qui',
  }).diagnostics.filter(diagnostic => diagnostic.code === 'QUI_INVALID_ASSET_REFERENCE')
  const projectIndexOptions = {
    language: {
      lint: {
        strictComponents: true,
      },
    },
  } as const
  const projectDocumentBytes = fixtures.projectFiles.reduce((total, file) => total + byteLength(file.source), 0)
  const initialProjectIndex = buildNativeUiProjectIndex(fixtures.projectFiles, projectIndexOptions)
  const projectionQuiDocument = analyzeNativeUiDocument(fixtures.qui, {
    filePath: 'bench/menu.qui',
    lint: {
      strictComponents: true,
    },
  })
  const projectionQssDocument = analyzeNativeUiDocument(fixtures.qss, {
    filePath: 'bench/menu.qss',
    lint: {
      strictComponents: true,
    },
  })
  if (!isNativeQuiDocument(projectionQuiDocument) || !isNativeQssDocument(projectionQssDocument))
    throw new Error('Native authoring benchmark fixtures must include QUI and QSS documents.')

  const definitions: BenchmarkDefinition[] = [
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
    {
      bench: 'native.authoring.surface_projection.compile.smoke',
      defaultIterations: 16,
      documentBytes: byteLength(fixtures.qui) + byteLength(fixtures.qss),
      run(iterations) {
        let checksum = 0
        let diagnostics = projectionQuiDocument.diagnostics.length + projectionQssDocument.diagnostics.length
        let assetKinds = 0
        let compatibilityAssetKinds = 0
        let compatibilityCapabilities = 0
        let compatibilityNativeCodeFalse = 0
        let compatibilityQssFeatures = 0
        let compatibilityQuiComponents = 0
        let intents = 0
        let intentEvents = 0
        let nodes = 0
        let projectionFields = 0
        let qssFeatures = 0
        let quiComponents = 0
        let styleFields = 0
        let textNodes = 0
        for (let index = 0; index < iterations; index += 1) {
          const projection = compileNativeUiSurfaceProjection(projectionQuiDocument, {
            qss: projectionQssDocument,
            rootId: 'bench-root',
          })
          const metrics = countSurfaceProjection(projection.root)
          const requirements = collectNativeUiSurfaceProjectionRequirements(projection)
          const compatibility = createNativeUiSurfaceCompatibilityFromProjection(projection)
          assetKinds += requirements.assetKinds.length
          compatibilityAssetKinds += compatibility.assetKinds?.length ?? 0
          compatibilityCapabilities += compatibility.capabilities?.length ?? 0
          compatibilityNativeCodeFalse += compatibility.nativeCode === false ? 1 : 0
          compatibilityQssFeatures += compatibility.qssFeatures?.length ?? 0
          compatibilityQuiComponents += compatibility.quiComponents?.length ?? 0
          intents += metrics.intents
          intentEvents += requirements.intentEvents.length
          nodes += metrics.nodes
          projectionFields += requirements.projectionFields.length
          qssFeatures += requirements.qssFeatures.length
          quiComponents += requirements.quiComponents.length
          styleFields += metrics.styleFields
          textNodes += metrics.textNodes
          checksum += metrics.nodes
            + metrics.styleFields
            + metrics.intents
            + metrics.textNodes
            + requirements.assetKinds.length
            + requirements.intentEvents.length
            + requirements.projectionFields.length
            + requirements.qssFeatures.length
            + requirements.quiComponents.length
            + (compatibility.assetKinds?.length ?? 0)
            + (compatibility.capabilities?.length ?? 0)
            + (compatibility.qssFeatures?.length ?? 0)
            + (compatibility.quiComponents?.length ?? 0)
            + (compatibility.nativeCode === false ? 1 : 0)
        }
        diagnostics *= iterations
        return {
          checksum,
          diagnostics,
          metrics: {
            assetKinds,
            compatibilityAssetKinds,
            compatibilityCapabilities,
            compatibilityNativeCodeFalse,
            compatibilityQssFeatures,
            compatibilityQuiComponents,
            intents,
            intentEvents,
            nodes,
            projectionFields,
            qssFeatures,
            quiComponents,
            styleFields,
            textNodes,
          },
        }
      },
    },
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
        let diagnostics = 0
        let formattedBytes = 0
        for (let index = 0; index < iterations; index += 1) {
          const formatted = formatNativeUiDocument(fixtures.qss, {
            filePath: 'bench/menu.qss',
            format: {
              indentSize: 2,
              insertFinalNewline: true,
            },
          })
          const edits = formatNativeUiDocumentEdits(fixtures.qss, {
            filePath: 'bench/menu.qss',
          })
          formattedBytes += byteLength(formatted)
          diagnostics += lintNativeUiDocument(formatted, {
            filePath: 'bench/menu.qss',
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
    {
      bench: 'native.authoring.project_index.build.smoke',
      defaultIterations: 6,
      documentBytes: projectDocumentBytes,
      run(iterations) {
        let checksum = 0
        let assetReferences = 0
        let diagnostics = 0
        let documentLinks = 0
        let documentCount = 0
        let components = 0
        let classes = 0
        let ids = 0
        let references = 0
        let qssRules = 0
        for (let index = 0; index < iterations; index += 1) {
          const projectIndex = buildNativeUiProjectIndex(fixtures.projectFiles, projectIndexOptions)
          assetReferences += projectIndex.summary.assetReferences
          diagnostics += projectIndex.summary.diagnostics
          documentLinks += projectIndex.documentLinks.length
          documentCount += projectIndex.summary.documentCount
          components += projectIndex.summary.components
          classes += projectIndex.summary.classes
          ids += projectIndex.summary.ids
          references += projectIndex.references.length
          qssRules += projectIndex.summary.qssRules
          checksum += projectIndex.summary.documentBytes
            + projectIndex.summary.components
            + projectIndex.summary.qssDeclarations
            + projectIndex.summary.assetReferences
            + projectIndex.documentLinks.length
            + projectIndex.references.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            assetReferences,
            classes,
            components,
            documentLinks,
            documentCount,
            ids,
            references,
            qssRules,
          },
        }
      },
    },
    {
      bench: 'native.authoring.project_index.incremental_update.smoke',
      defaultIterations: 48,
      documentBytes: projectDocumentBytes,
      run(iterations) {
        let checksum = 0
        let assetReferences = 0
        let diagnostics = 0
        let documentLinks = 0
        let documentCount = 0
        let components = 0
        let classes = 0
        let ids = 0
        let references = 0
        let qssRules = 0
        let projectIndex = initialProjectIndex
        const targetFile = fixtures.projectFiles[0]
        for (let index = 0; index < iterations; index += 1) {
          projectIndex = updateNativeUiProjectIndex(projectIndex, [
            {
              ...targetFile,
              source: createUpdatedQuiProjectSource(targetFile.source, index),
              version: index + 2,
            },
          ], projectIndexOptions)
          assetReferences += projectIndex.summary.assetReferences
          diagnostics += projectIndex.summary.diagnostics
          documentLinks += projectIndex.documentLinks.length
          documentCount += projectIndex.summary.documentCount
          components += projectIndex.summary.components
          classes += projectIndex.summary.classes
          ids += projectIndex.summary.ids
          references += projectIndex.references.length
          qssRules += projectIndex.summary.qssRules
          checksum += projectIndex.summary.documentBytes
            + projectIndex.summary.components
            + projectIndex.summary.qssDeclarations
            + projectIndex.summary.assetReferences
            + projectIndex.documentLinks.length
            + projectIndex.references.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            assetReferences,
            classes,
            components,
            documentLinks,
            documentCount,
            ids,
            references,
            qssRules,
          },
        }
      },
    },
  ]

  return definitions.map(definition => runBenchmarkDefinition(definition, options.iterations))
}
