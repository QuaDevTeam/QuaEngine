/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Row, Stack, Text, ui } from '@quajs/native-ui'
import { DEMO_QUIT_CONFIRM, DEMO_UI_METRICS, demoPanelRect } from '../../ui-presentation'

export function QuitConfirmDialog() {
  const panel = demoPanelRect(DEMO_UI_METRICS.confirmWidth, DEMO_UI_METRICS.confirmHeight, false)
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-quit-confirm-backdrop" class="system-backdrop" onDismiss={ui.close('quit-confirm')} />
      <Panel id="native-quit-confirm-panel" class="confirm-panel" {...panel}>
        <Text id="native-quit-confirm-title" class="panel-title" role="heading" x={panel.x + 53} y={panel.y + 45} width={590} height={54}>{DEMO_QUIT_CONFIRM.title}</Text>
        <Text id="native-quit-confirm-description" class="confirm-description" x={panel.x + 53} y={panel.y + 156} width={694} height={43.7}>{DEMO_QUIT_CONFIRM.description}</Text>
        <Button id="native-quit-confirm-close" class="parity-close" ariaLabel="关闭" x={panel.x + 695} y={panel.y + 45} width={52} height={52} onClick={ui.close('quit-confirm')}>×</Button>
        <Panel class="parity-divider" x={panel.x + 53} y={panel.y + 125} width={694} height={1} />
        <Row class="confirm-actions" x={panel.x + 465} y={panel.y + 241.7} width={282} height={56}>
          <Button id="native-quit-confirm-cancel" class="confirm-cancel" width={134} height={56} onClick={ui.close('quit-confirm')}>{DEMO_QUIT_CONFIRM.cancelLabel}</Button>
          <Button id="native-quit-confirm-confirm" class="confirm-accept" width={134} height={56} onClick={ui.open('quit')}>{DEMO_QUIT_CONFIRM.confirmLabel}</Button>
        </Row>
      </Panel>
    </Stack>
  )
}
