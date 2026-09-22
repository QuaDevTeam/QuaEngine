/** @jsxImportSource @quajs/native-ui */
import type { DemoAppView } from '../app'
import { Backdrop, Box, Image, Stack, ui } from '@quajs/native-ui'

export function TitleSurface({ view }: { view: DemoAppView }) {
  return (
    <Stack id="native-title-surface" class="title-surface">
      {view.screen === 'title' && <Backdrop id="native-title-input-blocker" class="title-input-blocker" onDismiss={ui.block('title')} />}
      <Image id="native-title-background" class="title-background" src="ui/title-menu-background.webp" />
      <Box id="native-title-linear-scrim" class="title-linear-scrim" />
    </Stack>
  )
}
