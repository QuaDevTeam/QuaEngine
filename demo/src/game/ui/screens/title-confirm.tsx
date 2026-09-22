import type { DemoAppView } from '../app'
/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Row, Stack, Text, ui } from '@quajs/native-ui'
import { DEMO_UI_METRICS, demoPanelRect } from '../../ui-presentation'

export function TitleConfirmDialog({ view }: { view: DemoAppView }) {
  const panel = demoPanelRect(DEMO_UI_METRICS.confirmWidth, DEMO_UI_METRICS.confirmHeight, true)
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-title-confirm-backdrop" class="system-backdrop" onDismiss={ui.close('title-confirm')} />
      <Panel id="native-title-confirm-panel" class="confirm-panel" {...panel}>
        <Text id="native-title-confirm-title" class="panel-title" role="heading" x={panel.x + 53} y={panel.y + 45} width={590} height={54}>{view.t('ui.titleConfirm.title')}</Text>
        <Text id="native-title-confirm-description" class="confirm-description" x={panel.x + 53} y={panel.y + 156} width={694} height={43.7}>{view.t('ui.titleConfirm.description')}</Text>
        <Button id="native-title-confirm-close" class="parity-close" ariaLabel="关闭" x={panel.x + 695} y={panel.y + 45} width={52} height={52} onClick={ui.close('title-confirm')}>×</Button>
        <Panel id="native-title-confirm-divider" class="parity-divider" x={panel.x + 53} y={panel.y + 125} width={694} height={1} />
        <Row id="native-title-confirm-actions" class="confirm-actions" x={panel.x + 465} y={panel.y + 241.7} width={282} height={56}>
          <Button id="native-title-confirm-cancel" class="confirm-cancel" width={134} height={56} onClick={ui.close('title-confirm')}>继续阅读</Button>
          <Button id="native-title-confirm-confirm" class="confirm-accept" width={134} height={56} onClick={ui.open('title')}>{view.t('ui.common.title')}</Button>
        </Row>
      </Panel>
    </Stack>
  )
}
