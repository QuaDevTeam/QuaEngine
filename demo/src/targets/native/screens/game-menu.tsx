/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Column, Panel, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function GameMenuOverlay({ view }: { view: NativeAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-game-menu-backdrop" class="system-backdrop" onDismiss={ui.close('game-menu')} />
      <Panel id="native-game-menu-panel" class="game-menu-panel">
        <Text id="native-game-menu-title" class="panel-title">{view.t('ui.gameMenu.menu')}</Text>
        <Text id="native-game-menu-subtitle" class="panel-subtitle">{view.gameMenuSubtitle}</Text>
        <Column id="native-game-menu-actions" class="game-menu-actions">
          <Button id="native-game-menu-save" class="panel-action" onClick={ui.open('save')}>{view.t('ui.common.save')}</Button>
          <Button id="native-game-menu-load" class="panel-action" onClick={ui.open('load')}>{view.t('ui.common.load')}</Button>
          <Button id="native-game-menu-settings" class="panel-action" onClick={ui.open('settings')}>{view.t('ui.common.config')}</Button>
          <Button id="native-game-menu-backlog" class="panel-action" onClick={ui.open('backlog')}>{view.t('ui.common.backlog')}</Button>
          <Button id="native-game-menu-title-action" class="panel-action title-action" onClick={ui.open('title-confirm')}>{view.t('ui.common.title')}</Button>
          <Button id="native-game-menu-close" class="panel-action" onClick={ui.close('game-menu')}>{view.t('ui.common.close')}</Button>
        </Column>
      </Panel>
    </Stack>
  )
}
