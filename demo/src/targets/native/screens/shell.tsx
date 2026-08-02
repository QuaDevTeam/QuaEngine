/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Box, Image, Stack } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

// Always-present vignette overlay (radial + linear gradient layers)
export function ShellVignette() {
  return (
    <Stack id="native-shell-vignette" class="shell-vignette">
      <Box id="native-shell-vignette-radial" class="shell-vignette-radial" />
      <Box id="native-shell-vignette-linear" class="shell-vignette-linear" />
    </Stack>
  )
}

// Background image + scrims — visible whenever view.titleSurface is true,
// regardless of which menu screen is active.
export function TitleSurface({ view }: { view: NativeAppView }) {
  return (
    <Stack id="native-title-surface" class="title-surface">
      {view.screen === 'title' && (
        <Backdrop id="native-title-input-blocker" class="title-input-blocker"
          onDismiss={ui.block('title')} />
      )}
      <Image id="native-title-background" class="title-background"
        src="ui/menu-route.jpg" />
      <Box id="native-title-linear-scrim" class="title-linear-scrim" />
      <Box id="native-title-radial-scrim" class="title-radial-scrim" />
    </Stack>
  )
}
