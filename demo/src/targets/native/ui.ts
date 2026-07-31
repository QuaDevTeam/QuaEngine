import {
  analyzeQssSource,
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
} from '@quajs/native-ui-compiler'
import nativeAppQuiSource from '../../../assets/ui/native-app.qui?raw'
import nativeAppQssSource from '../../../assets/ui/native-app.qss?raw'

export type NativeDemoAppScreen =
  | 'game'
  | 'game-over'
  | 'game-menu'
  | 'save-load'
  | 'story-tree'
  | 'system'
  | 'title'
  | 'title-confirm'

export interface NativeDemoAppListItem {
  id: string
  label: string
}

export interface NativeDemoAppSurfaceState {
  autoLabel: string
  englishTitle: string
  gameOverDescription: string
  gameOverSubtitle: string
  gameOverTitle: string
  gameMenuSubtitle: string
  hudChapter: string
  hudRoute: string
  hudSignal: string
  saveLoadTitle: string
  saveLoadMode: 'load' | 'save'
  saveSlotItems: readonly NativeDemoAppListItem[]
  screen: NativeDemoAppScreen
  skipLabel: string
  storyTreeItems: readonly NativeDemoAppListItem[]
  title: string
  titleSurface: boolean
}

export const NATIVE_DEMO_APP_ELEMENT_ID = 'native-app-shell'
export const NATIVE_DEMO_APP_SURFACE_KEY = 'demo/native-app.qui'

const nativeAppQui = analyzeQuiSource(nativeAppQuiSource)
const nativeAppQss = analyzeQssSource(nativeAppQssSource)

assertValidNativeUiDocument('native-app.qui', nativeAppQui.diagnostics)
assertValidNativeUiDocument('native-app.qss', nativeAppQss.diagnostics)

export function createNativeDemoAppSurface(state: NativeDemoAppSurfaceState): Record<string, unknown> {
  const projection = compileNativeUiSurfaceProjection(nativeAppQui, {
    context: { view: state },
    qss: nativeAppQss,
  })
  if (!projection.root) {
    throw new Error('Native demo QUI/QSS compilation produced no app surface root.')
  }
  return {
    visible: true,
    // The app shell is the base plate for every screen. Plugin panels
    // (settings/gallery/backlog) live in the `overlay` stack at priority 100,
    // so the shell must sit below them or its opaque title background paints
    // over the panel that was just opened.
    overlayStack: 'hud',
    zIndex: 10,
    surface: {
      key: NATIVE_DEMO_APP_SURFACE_KEY,
      root: projection.root,
    },
  }
}

function assertValidNativeUiDocument(
  name: string,
  diagnostics: readonly { code?: string, message?: string }[],
): void {
  if (diagnostics.length === 0) {
    return
  }
  const summary = diagnostics
    .map(diagnostic => `${diagnostic.code || 'NATIVE_UI'}: ${diagnostic.message || 'invalid document'}`)
    .join('; ')
  throw new Error(`${name} is invalid: ${summary}`)
}
