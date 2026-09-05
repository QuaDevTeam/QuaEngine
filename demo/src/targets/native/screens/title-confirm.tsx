import { DEMO_UI_METRICS, demoPanelRect } from '../../../game/ui-presentation'
/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Row, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function TitleConfirmDialog({ view }: { view: NativeAppView }) {
  const panel = demoPanelRect(DEMO_UI_METRICS.confirmWidth, DEMO_UI_METRICS.confirmHeight, true)
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-title-confirm-backdrop" class="system-backdrop" onDismiss={ui.close('title-confirm')} />
      <Panel id="native-title-confirm-panel" class="confirm-panel" {...panel}>
        <Text id="native-title-confirm-title" class="panel-title" x={panel.x + 21} y={panel.y + 21} width={420} height={38}>{view.t('ui.titleConfirm.title')}</Text>
        <Text id="native-title-confirm-subtitle" class="panel-subtitle" x={panel.x + 21} y={panel.y + 73} width={420} height={16}>{view.t('ui.titleConfirm.subtitle')}</Text>
        <Text id="native-title-confirm-description" class="confirm-description" x={panel.x + 21} y={panel.y + 122} width={478} height={48}>{view.t('ui.titleConfirm.description')}</Text>
        <Button id="native-title-confirm-close" class="parity-close" x={panel.x + 457} y={panel.y + 21} width={42} height={42} onClick={ui.close('title-confirm')}>×</Button>
        <Panel id="native-title-confirm-divider" class="parity-divider" x={panel.x + 21} y={panel.y + 103} width={478} height={1} />
        <Row id="native-title-confirm-actions" class="confirm-actions" x={panel.x + 235} y={panel.y + 188} width={264} height={40}>
          <Button id="native-title-confirm-cancel" class="confirm-cancel" width={128} height={40} onClick={ui.close('title-confirm')}>{view.t('ui.common.cancel')}</Button>
          <Button id="native-title-confirm-confirm" class="confirm-accept" width={128} height={40} onClick={ui.open('title')}>{view.t('ui.common.title')}</Button>
        </Row>
      </Panel>
    </Stack>
  )
}
