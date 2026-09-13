/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Grid, Panel, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function GalleryOverlay({ view }: { view: NativeAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-gallery-backdrop" class="system-backdrop" onDismiss={ui.close('gallery')} />
      <Panel id="native-gallery-panel" class="list-panel list-panel--wide">
        <Text id="native-gallery-eyebrow" class="panel-eyebrow">{view.t('ui.gallery.eyebrow')}</Text>
        <Text id="native-gallery-title" class="panel-title">{view.t('ui.gallery.title')}</Text>
        <Grid id="native-gallery-grid" class="gallery-grid" columns={4}>
          {view.galleryItems.map(item => (
            <Button key={item.id} id={item.id} class="gallery-item"
              onClick={ui.open(`gallery/item/${item.id}`)}>{item.label}</Button>
          ))}
        </Grid>
        <Button id="native-gallery-close" class="panel-close" onClick={ui.close('gallery')}>{view.t('ui.common.close')}</Button>
      </Panel>
    </Stack>
  )
}
