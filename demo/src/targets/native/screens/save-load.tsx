/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Stack, Text } from '@quajs/native-ui'
import { save, ui } from '@quajs/native-ui'
import { isFilledSaveSlot } from '@quajs/render-core'
import { DEMO_UI_METRICS, demoPanelRect } from '../../../game/ui-presentation'
import { STORY_TREE_NODES } from '../../../game/content/story-tree'
import type { NativeAppView } from '../native-app'

export function SaveLoadOverlay({ view }: { view: NativeAppView }) {
  const panel = demoPanelRect(DEMO_UI_METRICS.saveWidth, DEMO_UI_METRICS.saveHeight, !view.titleSurface)
  const left = panel.x + 31
  const contentWidth = panel.width - 62
  const cardWidth = (contentWidth - 20) / 3
  const gridTop = panel.y + 31 + 73 + 18 + 36 + 18
  return <Stack class="system-overlay">
    <Backdrop id="native-save-load-backdrop" class="system-backdrop" onDismiss={ui.close('save-load')} />
    <Panel id="native-save-load-panel" class="save-panel" {...panel}>
      <Text id="native-save-load-title" class="panel-title" x={left} y={panel.y + 31} width={600} height={38}>{view.saveLoadMode === 'save' ? '保存进度' : '读取存档'}</Text>
      <Text id="native-save-load-subtitle" class="panel-subtitle" x={left} y={panel.y + 83} width={600} height={14}>选择存档位置</Text>
      <Button id="native-save-load-close" class="parity-close" x={panel.x + panel.width - 73} y={panel.y + 31} width={42} height={42} onClick={ui.close('save-load')}>×</Button>
      <Panel id="native-save-load-divider" class="parity-divider" x={left} y={panel.y + 103} width={contentWidth} height={1} />
      <Panel id="native-save-tabs" class="save-tabs" x={left} y={panel.y + 122} width={contentWidth} height={36} />
      {(view.titleSurface ? ['load'] as const : ['save', 'load'] as const).map((mode, index) => <Button id={`native-save-mode-${mode}`} key={mode}
        class={view.saveLoadMode === mode ? 'save-tab is-active' : 'save-tab'}
        x={left + 1 + index * 96} y={panel.y + 123} width={96} height={34} onClick={ui.open(mode)}>{mode === 'save' ? '保存进度' : '读取存档'}</Button>)}
      {view.saveSlotItems.map((slot, index) => {
        const x = left + (index % 3) * (cardWidth + 10)
        const y = gridTop + Math.floor(index / 3) * 92
        const disabled = view.saveLoadMode === 'load' && !isFilledSaveSlot(slot)
        return <Panel key={slot.slotId} id={slot.slotId} class={disabled ? 'save-card is-disabled' : 'save-card'}
          x={x} y={y} width={cardWidth} height={82} onClick={disabled ? undefined : save.select(slot.slotId)}>
          <Panel id={`${slot.slotId}-index-box`} class="save-index-box" x={x + 13} y={y + 13} width={32} height={32} />
          <Text id={`${slot.slotId}-index`} class="save-index" x={x + 13} y={y + 13} width={32} height={32}>{String(index + 1).padStart(2, '0')}</Text>
          <Text id={`${slot.slotId}-name`} class="save-name" x={x + 59} y={y + 13} width={cardWidth - 72} height={20}>{isFilledSaveSlot(slot) ? STORY_TREE_NODES.find(node => node.chapter === slot.metadata?.chapterId)?.title || '阅读进度' : '空存档'}</Text>
          <Text id={`${slot.slotId}-meta`} class="save-meta" x={x + 59} y={y + 39} width={cardWidth - 72} height={14}>{slot.timestamp ? String(slot.timestamp).slice(0, 19) : view.saveLoadMode === 'save' ? '点击保存到这里' : '尚未保存'}</Text>
        </Panel>
      })}
    </Panel>
  </Stack>
}

export function SaveConfirmDialog({ view }: { view: NativeAppView }) {
  return <Stack class="system-overlay">
    <Backdrop id="native-save-confirm-backdrop" class="system-backdrop" onDismiss={ui.close('save-confirm')} />
    <Panel id="native-save-confirm-panel" class="confirm-panel" x={680} y={350} width={560} height={300}>
      <Text class="panel-title" x={710} y={380} width={500} height={48}>覆盖这个存档？</Text>
      <Text class="confirm-description" x={710} y={450} width={500} height={60}>覆盖后无法恢复。</Text>
      <Button id="native-save-confirm-cancel" class="panel-action" x={710} y={550} width={220} height={48} onClick={ui.close('save-confirm')}>取消</Button>
      <Button id="native-save-confirm-accept" class="panel-action" x={950} y={550} width={260} height={48} onClick={ui.open(`save-overwrite:${view.pendingSaveSlotId}`)}>覆盖保存</Button>
    </Panel>
  </Stack>
}
