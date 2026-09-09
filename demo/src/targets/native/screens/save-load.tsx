/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, Stack, Text } from '@quajs/native-ui'
import { save, ui } from '@quajs/native-ui'
import { isFilledSaveSlot } from '@quajs/render-core'
import { DEMO_UI_METRICS, demoPanelRect } from '../../../game/ui-presentation'
import { STORY_TREE_NODES } from '../../../game/content/story-tree'
import type { NativeAppView } from '../native-app'

export function SaveLoadOverlay({ view }: { view: NativeAppView }) {
  const panel = demoPanelRect(DEMO_UI_METRICS.saveWidth, DEMO_UI_METRICS.saveHeight, !view.titleSurface)
  const left = panel.x + 44
  const contentWidth = panel.width - 88
  const cardWidth = (contentWidth - 32) / 3
  const gridTop = panel.y + 222
  return <Stack class="system-overlay">
    <Backdrop id="native-save-load-backdrop" class="system-backdrop" onDismiss={ui.close('save-load')} />
    <Panel id="native-save-load-panel" class="save-panel" {...panel}>
      <Text id="native-save-load-title" class="panel-title" x={left} y={panel.y + 36} width={600} height={64}>{view.saveLoadMode === 'save' ? '保存进度' : '读取存档'}</Text>
      <Text id="native-save-load-subtitle" class="panel-subtitle" x={left} y={panel.y + 108} width={600} height={24}>选择存档位置</Text>
      <Button id="native-save-load-close" class="parity-close" x={panel.x + panel.width - 73} y={panel.y + 36} width={42} height={42} onClick={ui.close('save-load')}>×</Button>
      <Panel id="native-save-load-divider" class="parity-divider" x={left} y={panel.y + 152} width={contentWidth} height={1} />
      <Panel id="native-save-tabs" class="save-tabs" x={left} y={panel.y + 170} width={contentWidth} height={48} />
      {(view.titleSurface ? ['load'] as const : ['save', 'load'] as const).map((mode, index) => <Button id={`native-save-mode-${mode}`} key={mode}
        class={view.saveLoadMode === mode ? 'save-tab is-active' : 'save-tab'}
        x={left + 1 + index * 160} y={panel.y + 170} width={160} height={48} onClick={ui.open(mode)}>{mode === 'save' ? '保存进度' : '读取存档'}</Button>)}
      {view.saveSlotItems.map((slot, index) => {
        const x = left + (index % 3) * (cardWidth + 16)
        const y = gridTop + Math.floor(index / 3) * 170
        const disabled = view.saveLoadMode === 'load' && !isFilledSaveSlot(slot)
        return <Panel key={slot.slotId} id={slot.slotId} class={disabled ? 'save-card is-disabled' : 'save-card'}
          x={x} y={y} width={cardWidth} height={154} onClick={disabled ? undefined : save.select(slot.slotId)}>
          <Panel id={`${slot.slotId}-index-box`} class="save-index-box" x={x + 13} y={y + 28} width={50} height={70} />
          <Text id={`${slot.slotId}-index`} class="save-index" x={x + 13} y={y + 28} width={50} height={70}>{String(index + 1).padStart(2, '0')}</Text>
          <Text id={`${slot.slotId}-name`} class="save-name" x={x + 82} y={y + 28} width={cardWidth - 100} height={38}>{isFilledSaveSlot(slot) ? STORY_TREE_NODES.find(node => node.chapter === slot.metadata?.chapterId)?.title || '阅读进度' : '空存档'}</Text>
          <Text id={`${slot.slotId}-meta`} class="save-meta" x={x + 82} y={y + 78} width={cardWidth - 100} height={24}>{slot.timestamp ? String(slot.timestamp).slice(0, 19) : view.saveLoadMode === 'save' ? '点击保存到这里' : '尚未保存'}</Text>
        </Panel>
      })}
    </Panel>
  </Stack>
}

export function SaveConfirmDialog({ view }: { view: NativeAppView }) {
  return <Stack class="system-overlay">
    <Backdrop id="native-save-confirm-backdrop" class="system-backdrop" onDismiss={ui.close('save-confirm')} />
    <Panel id="native-save-confirm-panel" class="confirm-panel" x={560} y={350} width={800} height={380}>
      <Text class="panel-title" x={604} y={382} width={712} height={64}>覆盖这个存档？</Text>
      <Text class="confirm-description" x={604} y={480} width={712} height={70}>覆盖后无法恢复。</Text>
      <Button id="native-save-confirm-cancel" class="confirm-cancel" x={930} y={632} width={186} height={60} onClick={ui.close('save-confirm')}>取消</Button>
      <Button id="native-save-confirm-accept" class="confirm-accept" x={1130} y={632} width={186} height={60} onClick={ui.open(`save-overwrite:${view.pendingSaveSlotId}`)}>覆盖保存</Button>
    </Panel>
  </Stack>
}
