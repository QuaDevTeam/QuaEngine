/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Stack, Text, ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'
import { demoPanelRect } from '../../../game/ui-presentation'

export function StoryTreeOverlay({ view }: { view: NativeAppView }) {
  const panel = demoPanelRect(1560, 900, false)
  const gap = 36
  const width = (panel.width - 88 - gap) / 2
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-story-tree-backdrop" class="system-backdrop" onDismiss={ui.close('story-tree')} />
      <Panel id="native-story-tree-panel" class="list-panel" {...panel}>
        <Text id="native-story-tree-title" class="panel-title" x={panel.x + 44} y={panel.y + 32} width={1100} height={64}>{view.t('ui.storyTree.title')}</Text>
        {view.storyTreeItems.map((item, index) => (
          <Button key={item.id} id={item.id} class="chapter-action" x={panel.x + 44 + Math.floor(index / 5) * (width + gap)} y={panel.y + 140 + index % 5 * 124} width={width} height={104} disabled={item.disabled} onClick={ui.open(`chapter:${item.id}`)}>{item.label}</Button>
        ))}
        <Button id="native-story-tree-close" class="parity-close" x={panel.x + panel.width - 94} y={panel.y + 32} width={50} height={50} onClick={ui.close('story-tree')}>×</Button>
      </Panel>
    </Stack>
  )
}
