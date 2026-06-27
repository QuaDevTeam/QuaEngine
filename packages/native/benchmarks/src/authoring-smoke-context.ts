import {
  buildNativeUiProjectIndex,
  lintNativeUiDocument,
} from '@quajs/native-language-server'
import {
  analyzeNativeUiDocument,
  isNativeQssDocument,
  isNativeQuiDocument,
} from '@quajs/native-ui-compiler'
import { createInvalidAssetSourceFixture } from './authoring-utils'
import { createNativeAuthoringBenchmarkFixtures } from './fixtures'
import { byteLength } from './runner'

export function createNativeAuthoringSmokeContext() {
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

  return {
    fixtures,
    initialProjectIndex,
    invalidAssetDiagnostics,
    invalidAssetSource,
    projectDocumentBytes,
    projectIndexOptions,
    projectionQssDocument,
    projectionQuiDocument,
    qssCompletionOffset,
    qssHoverOffset,
    quiCompletionOffset,
    quiHoverOffset,
  }
}

export type NativeAuthoringSmokeContext = ReturnType<typeof createNativeAuthoringSmokeContext>
