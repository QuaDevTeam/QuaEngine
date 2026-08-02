import type { QuiNode } from '@quajs/native-ui'
import type { NativeDemoAppScreen, NativeDemoAppSurfaceState } from './ui'
/** @jsxImportSource @quajs/native-ui */
import { Stack } from '@quajs/native-ui'
import { BacklogOverlay } from './screens/backlog'
import { GameHud } from './screens/game-hud'
import { GameMenuOverlay } from './screens/game-menu'
import { GameOverDialog } from './screens/game-over'
import { GalleryOverlay } from './screens/gallery'
import { SaveLoadOverlay } from './screens/save-load'
import { SettingsOverlay } from './screens/settings'
import { ShellVignette, TitleSurface } from './screens/shell'
import { StoryTreeOverlay } from './screens/story-tree'
import { TitleScreen } from './screens/title'
import { TitleConfirmDialog } from './screens/title-confirm'

// ─── Public view type ─────────────────────────────────────────────────────────

export type { NativeDemoAppScreen }
export type NativeAppView = NativeDemoAppSurfaceState

// ─── Screen registry ──────────────────────────────────────────────────────────
//
// To add a new screen:
//   1. Create screens/my-screen.tsx exporting (props: { view: NativeAppView })
//   2. Add one entry here — NativeApp itself never changes.

type ScreenComponent = (props: { view: NativeAppView }) => QuiNode | null

const SCREEN_REGISTRY: Partial<Record<NativeDemoAppScreen, ScreenComponent>> = {
  'title': TitleScreen,
  'game': GameHud,
  'game-menu': GameMenuOverlay,
  'title-confirm': TitleConfirmDialog,
  'game-over': GameOverDialog,
  'story-tree': StoryTreeOverlay,
  'save-load': SaveLoadOverlay,
  'gallery': GalleryOverlay,
  'settings': SettingsOverlay,
  'backlog': BacklogOverlay,
}

// ─── Root component ───────────────────────────────────────────────────────────

export function NativeApp({ view }: { view: NativeAppView }) {
  const Screen = SCREEN_REGISTRY[view.screen] ?? null
  return (
    <Stack id="native-app-root" class="native-app">
      <ShellVignette />
      {view.titleSurface && <TitleSurface view={view} />}
      {Screen && <Screen view={view} />}
    </Stack>
  )
}
