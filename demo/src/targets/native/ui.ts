import {
  analyzeQssSource,
  compileQuiTsxProjection,
} from '@quajs/native-ui-compiler'
import nativeAppQssSource from './native-app.scss?raw'
import { NativeApp } from './native-app'

export type NativeDemoAppScreen =
  | 'backlog'
  | 'gallery'
  | 'game'
  | 'game-over'
  | 'game-menu'
  | 'save-load'
  | 'settings'
  | 'story-tree'
  | 'system'
  | 'title'
  | 'title-confirm'

export interface NativeDemoAppListItem {
  id: string
  label: string
}

export interface NativeDemoAppSettingItem {
  id: string
  label: string
  type: 'slider' | 'switch'
  selectedIndex: number
  /** Discrete step labels; two entries for switch (off/on). */
  options: readonly { label: string }[]
}

export interface NativeDemoAppSurfaceState {
  /** Translation function — called for every static UI string. */
  t: (key: string) => string
  autoActive: boolean
  englishTitle: string
  gameOverDescription: string
  gameOverSubtitle: string
  gameOverTitle: string
  gameMenuSubtitle: string
  saveLoadTitle: string
  saveLoadMode: 'load' | 'save'
  saveSlotItems: readonly NativeDemoAppListItem[]
  screen: NativeDemoAppScreen
  skipActive: boolean
  storyTreeItems: readonly NativeDemoAppListItem[]
  title: string
  titleSurface: boolean
  /** Gallery image items (id = asset name). */
  galleryItems: readonly NativeDemoAppListItem[]
  /** Dialogue backlog entries. */
  backlogItems: readonly NativeDemoAppListItem[]
  /** Settings items rendered in the settings panel. */
  settingItems: readonly NativeDemoAppSettingItem[]
}

export const NATIVE_DEMO_APP_ELEMENT_ID = 'native-app-shell'
export const NATIVE_DEMO_APP_SURFACE_KEY = 'demo/native-app'

const nativeAppQss = analyzeQssSource(nativeAppQssSource)
assertValidNativeUiDocument('native-app.qss', nativeAppQss.diagnostics)

export function createNativeDemoAppSurface(state: NativeDemoAppSurfaceState): Record<string, unknown> {
  // NativeApp is called with the current view state — all conditionals and
  // loops are evaluated here (TSX semantics), producing a resolved QuiNode tree.
  const root = NativeApp({ view: state })

  const projection = compileQuiTsxProjection(root, {
    qss: nativeAppQss,
  })

  if (!projection.root) {
    throw new Error('Native demo TSX compilation produced no app surface root.')
  }

  return {
    visible: true,
    // The app shell is the base plate for every screen, not a modal shield:
    // its full-stage overlay shell must not swallow pointer hits aimed at
    // engine projections below it (choices, dialogue advance). Interactive
    // content lives on the surface nodes themselves; system screens draw
    // their own Backdrop nodes when they need to block what is underneath.
    interactive: false,
    // Plugin panels (settings/gallery/backlog) live in the `overlay` stack at
    // priority 100, so the shell must sit below them or its opaque title
    // background paints over the panel that was just opened.
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
    .map(d => `${d.code || 'NATIVE_UI'}: ${d.message || 'invalid document'}`)
    .join('; ')
  throw new Error(`${name} is invalid: ${summary}`)
}
