import { DEMO_HUD_ACTIONS, DEMO_UI_METRICS, demoHudRect } from '../../../game/ui-presentation'
/** @jsxImportSource @quajs/native-ui */
import { Button, Panel, Row, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function GameHud({ view }: { view: NativeAppView }) {
  const toolbar = demoHudRect(view.layout)
  return (
    <Stack class="game-hud">
      {view.screen === 'game' && <Row id="native-title-plate" class="title-plate">
        <Text id="native-title-plate-name" class="title-plate-name">{view.title}</Text>
        <Text id="native-title-plate-subtitle" class="title-plate-subtitle">{view.t('ui.hud.subtitle')}</Text>
      </Row>}
      <Panel id="native-quick-menu" class="quick-menu" {...toolbar}>
        {DEMO_HUD_ACTIONS.map((item, index) => <Button key={item.id} id={`native-game-hud-${item.id}`}
          class={((item.id === 'auto' && view.autoActive) || (item.id === 'skip' && view.skipActive)) ? 'quick-menu-action is-active' : 'quick-menu-action'}
          x={toolbar.x + 10 + DEMO_HUD_ACTIONS.slice(0, index).reduce((sum, item) => sum + item.width + DEMO_UI_METRICS.toolbarGap, 0)}
          y={toolbar.y + 6} width={item.width} height={28}
          onClick={item.action === 'toggle' ? ui.toggle(item.target) : ui.open(item.target)}>{item.label}</Button>)}
      </Panel>
    </Stack>
  )
}
