import { DEMO_HUD_ACTIONS, DEMO_UI_METRICS } from '../../../game/ui-presentation'
/** @jsxImportSource @quajs/native-ui */
import { Button, Panel, Row, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function GameHud({ view }: { view: NativeAppView }) {
  return (
    <Stack class="game-hud">
      {view.screen === 'game' && <Row id="native-title-plate" class="title-plate">
        <Text id="native-title-plate-name" class="title-plate-name">{view.title}</Text>
        <Text id="native-title-plate-subtitle" class="title-plate-subtitle">{view.t('ui.hud.subtitle')}</Text>
      </Row>}
      <Panel id="native-quick-menu" class="quick-menu" x={1920 * 0.95 - DEMO_UI_METRICS.toolbarWidth} y={1080 * (1 - 0.05 - 0.1225) - 8 - DEMO_UI_METRICS.toolbarHeight} width={DEMO_UI_METRICS.toolbarWidth} height={DEMO_UI_METRICS.toolbarHeight}>
        {DEMO_HUD_ACTIONS.map((item, index) => <Button key={item.id} id={`native-game-hud-${item.id}`}
          class={((item.id === 'auto' && view.autoActive) || (item.id === 'skip' && view.skipActive)) ? 'quick-menu-action is-active' : 'quick-menu-action'}
          x={1920 * 0.95 - DEMO_UI_METRICS.toolbarWidth + 10 + DEMO_HUD_ACTIONS.slice(0, index).reduce((sum, item) => sum + item.width + DEMO_UI_METRICS.toolbarGap, 0)}
          y={1080 * (1 - 0.05 - 0.1225) - 8 - DEMO_UI_METRICS.toolbarHeight + 6} width={item.width} height={28}
          onClick={item.action === 'toggle' ? ui.toggle(item.target) : ui.open(item.target)}>{item.label}</Button>)}
      </Panel>
    </Stack>
  )
}
