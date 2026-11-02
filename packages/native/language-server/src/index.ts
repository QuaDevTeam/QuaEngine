export * from './language/document'

export type {
  NativeUiProjectClassReference,
  NativeUiProjectComponentReference,
  NativeUiProjectDocumentLink,
  NativeUiProjectFile,
  NativeUiProjectImport,
  NativeUiProjectIndex,
  NativeUiProjectIndexChange,
  NativeUiProjectIndexedDocument,
  NativeUiProjectIndexOptions,
  NativeUiProjectIndexSummary,
  NativeUiProjectReference,
  NativeUiProjectReferenceKind,
} from './project'
export {
  buildNativeUiProjectIndex,
  updateNativeUiProjectIndex,
} from './project'
export type {
  NativeUiProjectAssetReference,
  NativeUiProjectAssetReferenceSource,
} from './project/assets'
export {
  isSafeNativeUiProjectAssetName,
} from './project/assets'
export type {
  CreateNativeUiProjectRenameEditsOptions,
  FindNativeUiProjectReferencesOptions,
  NativeUiProjectRenameEdit,
} from './project/references'
export {
  createNativeUiProjectRenameEdits,
  findNativeUiProjectDefinitions,
  findNativeUiProjectReferences,
  getNativeUiProjectDocumentLinks,
} from './project/references'
export { offsetAtPosition } from './shared/source-ranges'

export type {
  NativeUiCompletionItem,
  NativeUiDiagnostic,
  NativeUiDocument,
  NativeUiHover,
  NativeUiLanguageOptions,
  NativeUiRange,
} from '@quajs/native-ui-compiler'

export {
  analyzeNativeUiDocument,
  detectNativeUiDocumentKind,
  getNativeUiCompletions,
  getNativeUiHover,
  nativeQssProperties,
  nativeQssPseudoStates,
  nativeQuiDirectiveNames,
  nativeUiComponents,
  nativeWgpuQssFeatureNames,
  nativeWgpuQuiComponentNames,
  QUA_STYLE_FILE_EXTENSIONS,
  QUA_STYLE_LANGUAGE_ID,
  QUA_UI_FILE_EXTENSIONS,
  QUA_UI_LANGUAGE_ID,
} from '@quajs/native-ui-compiler'
