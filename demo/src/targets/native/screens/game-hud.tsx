/** @jsxImportSource @quajs/native-ui */
import { Button, Panel, Row, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function GameHud({ view }: { view: NativeAppView }) {
  return (
    <Stack class="game-hud">
      <Row id="native-title-plate" class="title-plate">
        <Text id="native-title-plate-name" class="title-plate-name">{view.title}</Text>
        <Text id="native-title-plate-subtitle" class="title-plate-subtitle">{view.t('ui.hud.subtitle')}</Text>
      </Row>
      <Panel id="native-quick-menu" class="quick-menu">
        <Button id="native-game-hud-auto" class={view.autoActive ? 'quick-menu-action is-active' : 'quick-menu-action'} onClick={ui.toggle('auto')}>AUTO</Button>
        <Button id="native-game-hud-skip" class={view.skipActive ? 'quick-menu-action is-active' : 'quick-menu-action'} onClick={ui.toggle('skip')}>SKIP</Button>
        <Button id="native-game-hud-log" class="quick-menu-action" onClick={ui.open('backlog')}>{view.t('ui.hud.log')}</Button>
        <Button id="native-game-hud-menu" class="quick-menu-action" onClick={ui.open('game-menu')}>{view.t('ui.hud.menu')}</Button>
      </Panel>
    </Stack>
  )
}
