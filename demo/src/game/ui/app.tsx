import type { QuiNode } from '@quajs/native-ui'
import type { ViewLayoutProjection } from '@quajs/render-core'
import type { DemoAppScreen, DemoAppSurfaceState } from './surface'
/** @jsxImportSource @quajs/native-ui */
import { Stack } from '@quajs/native-ui'
import { GameHud } from './screens/game-hud'
import { GameMenuOverlay } from './screens/game-menu'
import { GameOverDialog } from './screens/game-over'
import { QuitConfirmDialog } from './screens/quit-confirm'
import { SaveConfirmDialog, SaveLoadOverlay } from './screens/save-load'
import { TitleSurface } from './screens/shell'
import { StoryTreeOverlay } from './screens/story-tree'
import { TitleScreen } from './screens/title'
import { TitleConfirmDialog } from './screens/title-confirm'

// ─── Public view type ─────────────────────────────────────────────────────────

export type { DemoAppScreen }
export type DemoAppView = DemoAppSurfaceState & { layout: Readonly<ViewLayoutProjection> }

// ─── Screen registry ──────────────────────────────────────────────────────────
//
// To add a new screen:
//   1. Create screens/my-screen.tsx exporting (props: { view: DemoAppView })
//   2. Add one entry here — DemoApp itself never changes.

type ScreenComponent = (props: { view: DemoAppView }) => QuiNode | null

const SCREEN_REGISTRY: Partial<Record<DemoAppScreen, ScreenComponent>> = {
  'title': TitleScreen,
  'game': GameHud,
  'game-menu': GameMenuOverlay,
  'title-confirm': TitleConfirmDialog,
  'quit-confirm': QuitConfirmDialog,
  'game-over': GameOverDialog,
  'story-tree': StoryTreeOverlay,
  'save-load': SaveLoadOverlay,
  'save-confirm': SaveConfirmDialog,
}

// ─── Root component ───────────────────────────────────────────────────────────

export function DemoApp({ view }: { view: DemoAppView }) {
  const Screen = SCREEN_REGISTRY[view.screen] ?? null
  return (
    <Stack id="native-app-root" class="native-app">
      {view.titleSurface && <TitleSurface view={view} />}
      {Screen && <Screen view={view} />}
    </Stack>
  )
}
