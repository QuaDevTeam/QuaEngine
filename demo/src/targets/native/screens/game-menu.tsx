/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Column, Panel, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import { DEMO_GAME_ACTIONS, DEMO_UI_METRICS, demoPanelRect } from '../../../game/ui-presentation'
import type { NativeAppView } from '../native-app'

export function GameMenuOverlay({ view }: { view: NativeAppView }) {
  const panel = demoPanelRect(DEMO_UI_METRICS.menuWidth, DEMO_UI_METRICS.menuHeight, true)
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-game-menu-backdrop" class="system-backdrop" onDismiss={ui.close('game-menu')} />
      <Panel id="native-game-menu-panel" class="game-menu-panel" {...panel}>
        <Text id="native-game-menu-title" class="panel-title" x={panel.x + 44} y={panel.y + 38} width={510} height={64}>{view.t('ui.gameMenu.menu')}</Text>
        <Text id="native-game-menu-subtitle" class="panel-subtitle" x={panel.x + 44} y={panel.y + 106} width={510} height={32}>{view.gameMenuSubtitle}</Text>
        <Button id="native-game-menu-header-close" class="parity-close" x={panel.x + panel.width - 71} y={panel.y + 38} width={42} height={42} onClick={ui.close('game-menu')}>×</Button>
        <Panel id="native-game-menu-divider" class="parity-divider" x={panel.x + 44} y={panel.y + 154} width={612} height={1} />
        <Column id="native-game-menu-actions" class="game-menu-actions" x={panel.x + 44} y={panel.y + 182} width={612} height={390}>
          {DEMO_GAME_ACTIONS.map(action => (
            <Button id={`native-game-menu-${action.id === 'continue' ? 'close' : action.id === 'title' ? 'title-action' : action.id}`} key={action.id} class="panel-action" width={612} height={62}
              onClick={action.id === 'continue' ? ui.close('game-menu')
                : action.id === 'title' ? ui.open('title-confirm')
                : ui.open(action.id)}>{action.label}</Button>
          ))}
        </Column>
      </Panel>
    </Stack>
  )
}
