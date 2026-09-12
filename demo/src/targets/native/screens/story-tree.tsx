/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Stack, Text, ui } from '@quajs/native-ui'
import type { NativeAppView } from '../native-app'
import { demoChapterLabel } from '../../../game/ui-presentation'

export function StoryTreeOverlay({ view }: { view: NativeAppView }) {
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-story-tree-backdrop" class="chapter-paper" onDismiss={ui.close('story-tree')} />
      <Panel id="native-story-tree-panel" x={180} y={98.5} width={1560} height={883}>
        <Text id="native-story-tree-title" class="chapter-title" x={216} y={132.5} width={1100} height={66}>章节选择</Text>
        <Text id="native-story-tree-subtitle" class="chapter-subtitle" x={216} y={214.5} width={1100} height={34}>{`已开启 ${view.storyTreeItems.filter(item => item.unlocked).length} / ${view.storyTreeItems.length} 章 · 选择章节，从章首重读`}</Text>
        <Panel class="parity-divider" x={216} y={282.5} width={1488} height={1} />
        {view.storyTreeItems.map((item, index) => {
          const x = 216 + Math.floor(index / 5) * 779, y = 307.5 + index % 5 * 128
          const titleHeight = item.disabled ? 34.5 : 43.5
          const bodyHeight = titleHeight + (item.description ? 40.5 : 0)
          const bodyY = y + (127 - bodyHeight) / 2
          return <Panel key={item.id} id={item.id} class={`chapter-row${item.current ? ' is-current' : ''}`} x={x} y={y} width={709} height={128} onClick={item.disabled ? undefined : ui.open(`chapter:${item.id}`)}>
            <Text class={`chapter-number${item.disabled ? ' is-locked' : ''}`} x={x + 16} y={y + 47.5} width={94} height={32}>{demoChapterLabel(item.chapter)}</Text>
            <Text class={item.disabled ? 'chapter-name is-locked' : 'chapter-name'} x={x + 132} y={bodyY} width={529} height={titleHeight}>{item.label}</Text>
            {item.description ? <Text class="chapter-description" x={x + 132} y={bodyY + titleHeight + 12} width={529} height={28.5}>{item.description}</Text> : null}
            {item.current ? <Text class="chapter-status" x={x + 633} y={y + 92} width={64} height={24}>上次读到</Text> : null}
          </Panel>
        })}
        <Button id="native-story-tree-close" class="chapter-close" x={1562} y={161.5} width={142} height={58} onClick={ui.close('story-tree')}>返回标题</Button>
      </Panel>
    </Stack>
  )
}
