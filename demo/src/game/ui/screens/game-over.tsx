import type { DemoAppView } from '../app'
/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Row, Stack, Text, ui } from '@quajs/native-ui'

export function GameOverDialog({ view }: { view: DemoAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-game-over-backdrop" class="system-backdrop" onDismiss={ui.close('game-over')} />
      <Panel id="native-game-over-panel" class="confirm-panel">
        <Text id="native-game-over-title" class="panel-title" role="heading">{view.gameOverTitle}</Text>
        <Text id="native-game-over-subtitle" class="panel-subtitle">{view.gameOverSubtitle}</Text>
        <Text id="native-game-over-description" class="confirm-description">{view.gameOverDescription}</Text>
        <Row id="native-game-over-actions" class="confirm-actions">
          <Button id="native-game-over-close" class="confirm-cancel" onClick={ui.close('game-over')}>{view.t('ui.common.close')}</Button>
          <Button id="native-game-over-title-action" class="confirm-accept" onClick={ui.open('title')}>{view.t('ui.common.title')}</Button>
        </Row>
      </Panel>
    </Stack>
  )
}
