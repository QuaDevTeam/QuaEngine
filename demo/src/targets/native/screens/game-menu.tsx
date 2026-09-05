/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Column, Panel, Stack, Text } from '@quajs/native-ui'
import { createMenuActionPresentation } from '@quajs/render-core'
import { ui } from '@quajs/native-ui'
import { DEMO_MENU_OPTIONS, DEMO_UI_METRICS, demoPanelRect } from '../../../game/ui-presentation'
import type { NativeAppView } from '../native-app'

export function GameMenuOverlay({ view }: { view: NativeAppView }) {
  const panel = demoPanelRect(DEMO_UI_METRICS.menuWidth, DEMO_UI_METRICS.menuHeight, true)
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-game-menu-backdrop" class="system-backdrop" onDismiss={ui.close('game-menu')} />
      <Panel id="native-game-menu-panel" class="game-menu-panel" {...panel}>
        <Text id="native-game-menu-title" class="panel-title" x={panel.x + 29} y={panel.y + 29} width={330} height={38}>{view.t('ui.gameMenu.menu')}</Text>
        <Text id="native-game-menu-subtitle" class="panel-subtitle" x={panel.x + 29} y={panel.y + 79} width={330} height={16}>{view.gameMenuSubtitle}</Text>
        <Button id="native-game-menu-header-close" class="parity-close" x={panel.x + panel.width - 71} y={panel.y + 29} width={42} height={42} onClick={ui.close('game-menu')}>×</Button>
        <Panel id="native-game-menu-divider" class="parity-divider" x={panel.x + 29} y={panel.y + 105} width={402} height={1} />
        <Column id="native-game-menu-actions" class="game-menu-actions" x={panel.x + 29} y={panel.y + 124} width={402} height={252}>
          {createMenuActionPresentation(DEMO_MENU_OPTIONS).map(action => (
            <Button id={`native-game-menu-${action.id === 'continue' ? 'close' : action.id === 'title' ? 'title-action' : action.id}`} key={action.id} class="panel-action" width={402} height={44}
              onClick={action.id === 'continue' ? ui.close('game-menu')
                : action.id === 'title' ? ui.open('title-confirm')
                : ui.open(action.id)}>{action.label}</Button>
          ))}
        </Column>
      </Panel>
    </Stack>
  )
}
