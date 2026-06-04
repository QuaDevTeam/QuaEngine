export type {
  QuaCocosRendererOptions,
} from './controller'
export {
  clientInputToStagePoint,
  createCocosRendererActions,
  QuaCocosRendererController,
} from './controller'
export { emptyCocosView } from './defaults'
export type {
  CocosRendererHostContext,
  CocosRendererPlugin,
  CocosRendererPluginContext,
  CocosRendererPluginDefinition,
  CocosRendererSnapshot,
  CocosRendererSnapshotListener,
  ResolvedCocosAsset,
} from './types'
export { defineCocosRendererPlugin } from './plugins/core'
export { createFontsCocosRendererPlugin, fontsCocosRendererPlugin } from './plugins/fonts'
export { createSavePreviewCocosRendererPlugin, savePreviewCocosRendererPlugin } from './plugins/save-preview'
export {
  createVisualNovelCocosRendererPlugins,
  type VisualNovelCocosRendererPresetOptions,
} from './plugins/preset'
export {
  renderCocosAudio,
  renderCocosBackground,
  renderCocosCharacters,
  renderCocosChoices,
  renderCocosDialogue,
  renderCocosEffects,
  renderCocosUi,
} from './projection'
export type {
  CocosUiControlSkinOptions,
} from './ui-skin'
export {
  applyCocosUiControlSkin,
  runtimePackageCandidatesFromMetadata,
} from './ui-skin'
