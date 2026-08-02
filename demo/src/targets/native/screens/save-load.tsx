/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Column, Panel, Stack, Text } from '@quajs/native-ui'
import { save, ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function SaveLoadOverlay({ view }: { view: NativeAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-save-load-backdrop" class="system-backdrop" onDismiss={ui.close('save-load')} />
      <Panel id="native-save-load-panel" class="list-panel">
        <Text id="native-save-load-eyebrow" class="panel-eyebrow">{view.t('ui.saveLoad.eyebrow')}</Text>
        <Text id="native-save-load-title" class="panel-title">{view.saveLoadTitle}</Text>
        <Column id="native-save-load-list" class="list-content">
          {view.saveSlotItems.map(item => (
            <Button key={item.id} id={item.id} class="list-line"
              onClick={save.select(item.id)}>{item.label}</Button>
          ))}
        </Column>
        <Button id="native-save-load-close" class="panel-close" onClick={ui.close('save-load')}>{view.t('ui.common.close')}</Button>
      </Panel>
    </Stack>
  )
}
