import type { SaveSlotProjection, ViewLayoutProjection } from '@quajs/render-core'
import {
  analyzeQssSource,
  compileQuiTsxProjection,
} from '@quajs/native-ui-compiler/runtime'
import { DemoApp } from './app'
import appQssSource from './app.scss?raw'

export type DemoAppScreen
  = | 'backlog'
    | 'gallery'
    | 'game'
    | 'game-over'
    | 'game-menu'
    | 'save-load'
    | 'save-confirm'
    | 'settings'
    | 'story-tree'
    | 'system'
    | 'title'
    | 'title-confirm'
    | 'quit-confirm'

export interface DemoAppListItem {
  id: string
  label: string
  disabled?: boolean
}

export interface DemoChapterItem extends DemoAppListItem {
  chapter: string
  description?: string
  current?: boolean
  unlocked?: boolean
}

export interface DemoAppSurfaceState {
  /** Translation function — called for every static UI string. */
  t: (key: string) => string
  pendingSaveSlotId?: string
  canContinue: boolean
  autoActive: boolean
  gameOverDescription: string
  gameOverSubtitle: string
  gameOverTitle: string
  gameMenuSubtitle: string
  saveLoadTitle: string
  saveLoadMode: 'load' | 'save'
  saveSlotItems: readonly SaveSlotProjection[]
  screen: DemoAppScreen
  skipActive: boolean
  storyTreeItems: readonly DemoChapterItem[]
  title: string
  titleSurface: boolean

}

export const DEMO_APP_ELEMENT_ID = 'demo-app-shell'
export const DEMO_APP_SURFACE_KEY = 'demo/app'

const appQss = analyzeQssSource(appQssSource)
assertValidNativeUiDocument('app.qss', appQss.diagnostics)

export function createDemoAppSurface(state: DemoAppSurfaceState, layout: Readonly<ViewLayoutProjection>): Record<string, unknown> {
  // DemoApp is called with the current view state — all conditionals and
  // loops are evaluated here (TSX semantics), producing a resolved QuiNode tree.
  const root = DemoApp({ view: { ...state, layout } })

  const projection = compileQuiTsxProjection(root, {
    qss: appQss,
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
      key: DEMO_APP_SURFACE_KEY,
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
