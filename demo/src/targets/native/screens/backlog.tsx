/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Column, Panel, Scroll, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function BacklogOverlay({ view }: { view: NativeAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-backlog-backdrop" class="system-backdrop" onDismiss={ui.close('backlog')} />
      <Panel id="native-backlog-panel" class="list-panel list-panel--wide">
        <Text id="native-backlog-eyebrow" class="panel-eyebrow">{view.t('ui.backlog.eyebrow')}</Text>
        <Text id="native-backlog-title" class="panel-title">{view.t('ui.backlog.title')}</Text>
        <Scroll id="native-backlog-scroll" class="backlog-scroll" direction="vertical">
          <Column id="native-backlog-list" class="list-content">
            {view.backlogItems.map(item => (
              <Text key={item.id} id={item.id} class="backlog-line">{item.label}</Text>
            ))}
          </Column>
        </Scroll>
        <Button id="native-backlog-close" class="panel-close" onClick={ui.close('backlog')}>{view.t('ui.common.close')}</Button>
      </Panel>
    </Stack>
  )
}
