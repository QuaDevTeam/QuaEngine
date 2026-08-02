/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Row, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function TitleConfirmDialog({ view }: { view: NativeAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-title-confirm-backdrop" class="system-backdrop" onDismiss={ui.close('title-confirm')} />
      <Panel id="native-title-confirm-panel" class="confirm-panel">
        <Text id="native-title-confirm-title" class="panel-title">{view.t('ui.titleConfirm.title')}</Text>
        <Text id="native-title-confirm-subtitle" class="panel-subtitle">{view.t('ui.titleConfirm.subtitle')}</Text>
        <Text id="native-title-confirm-description" class="confirm-description">{view.t('ui.titleConfirm.description')}</Text>
        <Row id="native-title-confirm-actions" class="confirm-actions">
          <Button id="native-title-confirm-cancel" class="confirm-cancel" onClick={ui.close('title-confirm')}>{view.t('ui.common.cancel')}</Button>
          <Button id="native-title-confirm-confirm" class="confirm-accept" onClick={ui.open('title')}>{view.t('ui.common.title')}</Button>
        </Row>
      </Panel>
    </Stack>
  )
}
