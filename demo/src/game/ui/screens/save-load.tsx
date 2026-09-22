import type { DemoAppView } from '../app'
/** @jsxImportSource @quajs/native-ui */
import { Backdrop, Button, Panel, save, Stack, Text, ui } from '@quajs/native-ui'
import { isFilledSaveSlot } from '@quajs/render-core'
import { STORY_TREE_NODES } from '../../content/story-tree'
import { DEMO_UI_METRICS, demoPanelRect, demoSaveTimestamp } from '../../ui-presentation'

export function SaveLoadOverlay({ view }: { view: DemoAppView }) {
  const panel = demoPanelRect(DEMO_UI_METRICS.saveWidth, DEMO_UI_METRICS.saveHeight, !view.titleSurface)
  const left = panel.x + 53
  const contentWidth = panel.width - 106
  const cardWidth = (contentWidth - 32) / 3
  const gridTop = panel.y + 150
  return (
    <Stack class="system-overlay">
      <Backdrop id="native-save-load-backdrop" class="system-backdrop" onDismiss={ui.close('save-load')} />
      <Panel id="native-save-load-panel" class="save-panel" {...panel}>
        <Text id="native-save-load-title" class="panel-title" role="heading" x={left} y={panel.y + 45} width={600} height={54}>{view.saveLoadMode === 'save' ? '保存进度' : '读取存档'}</Text>
        <Button id="native-save-load-close" class="parity-close" ariaLabel="关闭" x={panel.x + panel.width - 105} y={panel.y + 45} width={52} height={52} onClick={ui.close('save-load')}>×</Button>
        <Panel id="native-save-load-divider" class="parity-divider" x={left} y={panel.y + 125} width={contentWidth} height={1} />
        {view.saveSlotItems.map((slot, index) => {
          const x = left + (index % 3) * (cardWidth + 16)
          const y = gridTop + Math.floor(index / 3) * (518 / 3 + 16)
          const disabled = view.saveLoadMode === 'load' && !isFilledSaveSlot(slot)
          const meta = slot.timestamp ? demoSaveTimestamp(slot.timestamp) : view.saveLoadMode === 'save' ? '点击保存' : ''
          const copyY = y + (518 / 3 - (meta ? 69.6 : 45.6)) / 2
          return (
            <Panel
              key={slot.slotId}
              id={slot.slotId}
              role="button"
              class={['save-card', !isFilledSaveSlot(slot) ? 'is-empty' : '', disabled ? 'is-disabled' : ''].join(' ')}
              x={x}
              y={y}
              width={cardWidth}
              height={518 / 3}
              onClick={disabled ? undefined : save.select(slot.slotId)}
            >
              <Panel id={`${slot.slotId}-index-box`} class="save-index-box" x={x + 23} y={y + (518 / 3 - 54) / 2} width={46} height={54} />
              <Text id={`${slot.slotId}-index`} class="save-index" x={x + 23} y={y + (518 / 3 - 54) / 2} width={46} height={54}>{String(index + 1).padStart(2, '0')}</Text>
              <Text id={`${slot.slotId}-name`} class="save-name" x={x + 89} y={copyY} width={cardWidth - 112} height={33.6}>{isFilledSaveSlot(slot) ? STORY_TREE_NODES.find(node => node.chapter === slot.metadata?.chapterId)?.title || '阅读进度' : '空存档'}</Text>
              <Text id={`${slot.slotId}-meta`} class="save-meta" x={x + 89} y={copyY + 45.6} width={cardWidth - 112} height={24}>{meta}</Text>
            </Panel>
          )
        })}
      </Panel>
    </Stack>
  )
}

export function SaveConfirmDialog({ view }: { view: DemoAppView }) {
  const slot = view.saveSlotItems.find(slot => slot.slotId === view.pendingSaveSlotId)
  const number = view.saveSlotItems.findIndex(slot => slot.slotId === view.pendingSaveSlotId) + 1
  const subtitle = STORY_TREE_NODES.find(node => node.chapter === slot?.metadata?.chapterId)?.title || '已有阅读进度'
  const panel = demoPanelRect(800, 385.3, true)
  const left = panel.x + 53
  return (
    <Stack class="system-overlay">
      <SaveLoadOverlay view={view} />
      <Backdrop id="native-save-confirm-backdrop" class="system-backdrop" onDismiss={ui.close('save-confirm')} />
      <Panel id="native-save-confirm-panel" class="confirm-panel" {...panel}>
        <Text class="panel-title" role="heading" x={left} y={panel.y + 45} width={600} height={54}>{`覆盖存档 ${number}？`}</Text>
        <Text class="panel-subtitle" x={left} y={panel.y + 111} width={600} height={30.6}>{subtitle}</Text>
        <Button id="native-save-confirm-close" class="parity-close" ariaLabel="关闭" x={panel.x + 695} y={panel.y + 45} width={52} height={52} onClick={ui.close('save-confirm')}>×</Button>
        <Panel class="parity-divider" x={left} y={panel.y + 167.6} width={694} height={1} />
        <Text class="confirm-description" x={left} y={panel.y + 198.6} width={694} height={43.7}>覆盖后无法恢复。</Text>
        <Button id="native-save-confirm-cancel" class="confirm-cancel" x={panel.x + 507} y={panel.y + 284.3} width={92} height={56} onClick={ui.close('save-confirm')}>取消</Button>
        <Button id="native-save-confirm-accept" class="confirm-accept" x={panel.x + 613} y={panel.y + 284.3} width={134} height={56} onClick={ui.open(`save-overwrite:${view.pendingSaveSlotId}`)}>覆盖保存</Button>
      </Panel>
    </Stack>
  )
}
