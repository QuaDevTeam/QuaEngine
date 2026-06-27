import {
  buildNativeUiProjectIndex,
  updateNativeUiProjectIndex,
} from '@quajs/native-language-server'
import {
  collectNativeUiSurfaceProjectionRequirements,
  compileNativeUiSurfaceProjection,
  createNativeUiSurfaceCompatibilityFromProjection,
} from '@quajs/native-ui-compiler'
import type { BenchmarkDefinition } from './types'
import type { NativeAuthoringSmokeContext } from './authoring-smoke-context'
import { countSurfaceProjection } from './authoring-utils'
import { createUpdatedQuiProjectSource } from './fixtures'
import { byteLength } from './runner'

export function createNativeAuthoringProjectionBenchmarkDefinitions(
  context: NativeAuthoringSmokeContext,
): BenchmarkDefinition[] {
  const {
    fixtures,
    projectionQssDocument,
    projectionQuiDocument,
  } = context

  return [
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
  ]
}

export function createNativeAuthoringProjectIndexBenchmarkDefinitions(
  context: NativeAuthoringSmokeContext,
): BenchmarkDefinition[] {
  const {
    fixtures,
    initialProjectIndex,
    projectDocumentBytes,
    projectIndexOptions,
  } = context

  return [
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
}
