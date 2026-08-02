/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Column, Panel, Stack, Text } from '@quajs/native-ui'
import { ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'

export function StoryTreeOverlay({ view }: { view: NativeAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-story-tree-backdrop" class="system-backdrop" onDismiss={ui.close('story-tree')} />
      <Panel id="native-story-tree-panel" class="list-panel list-panel--wide">
        <Text id="native-story-tree-eyebrow" class="panel-eyebrow">{view.t('ui.storyTree.eyebrow')}</Text>
        <Text id="native-story-tree-title" class="panel-title">{view.t('ui.storyTree.title')}</Text>
        <Column id="native-story-tree-list" class="list-content">
          {view.storyTreeItems.map(item => (
            <Text key={item.id} id={item.id} class="list-line">{item.label}</Text>
          ))}
        </Column>
        <Button id="native-story-tree-close" class="panel-close" onClick={ui.close('story-tree')}>{view.t('ui.common.close')}</Button>
      </Panel>
    </Stack>
  )
}
