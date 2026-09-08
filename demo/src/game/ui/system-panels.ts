import { defineComponent, h } from 'vue'
import { useQuaRenderer, useRendererActions } from '@quajs/renderer-vue'
import { QuaConfirmOverlay, QuaMenuOverlay, QuaOverlayLayer, QuaSaveLoadPanel } from '@quajs/renderer-vue/plugins/ui'
import { RenderToLogicEvents, isFilledSaveSlot, type SaveSlotProjection } from '@quajs/render-core'
import { DEMO_TITLE_CONFIRM, DEMO_GAME_ACTIONS } from '../ui-presentation'
import { DEMO_TITLE_REQUEST_EVENT, SAVE_LOAD_SLOT_COUNT } from '../config'
import { STORY_TREE_NODES } from '../content/story-tree'
import { createUiScene, DEMO_OVERLAY_PLACEMENTS } from './scene'

/** Demo skin over official readonly slot projections and pipeline intent actions. */
export const DemoSystemPanels = defineComponent({
  name: 'DemoSystemPanels',
  setup() {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const header = (title: string, subtitle: string, close: () => unknown) => h('header', { class: 'qua-ui-panel-header' }, [
      h('div', [h('h2', { class: 'qua-ui-panel-title' }, title), subtitle ? h('p', { class: 'qua-ui-panel-subtitle' }, subtitle) : null]),
      h('button', { class: 'qua-ui-panel-close', type: 'button', 'aria-label': '关闭', onClick: close }, '×'),
    ])
    const openFromMenu = async (id: string) => {
      if (id === 'continue') return actions.requestUiClose('menu')
      const elementId = id === 'save' || id === 'load' ? 'saveLoad' : id === 'title' ? 'titleConfirm' : 'settings'
      const placement = elementId === 'saveLoad' ? DEMO_OVERLAY_PLACEMENTS.saveLoad : DEMO_OVERLAY_PLACEMENTS.settings
      await actions.requestUiOpen(elementId, {
        ...placement, source: 'game-menu', mode: id,
        slotCount: SAVE_LOAD_SLOT_COUNT, showQuickActions: false,
        scene: createUiScene(`game:${elementId}`, 'overlay', 'game-modal', placement),
        ...(id === 'title' ? {
          ...DEMO_TITLE_CONFIRM, confirmLabel: '返回标题', cancelLabel: '继续阅读',
          confirmEvent: DEMO_TITLE_REQUEST_EVENT, closeOnConfirm: false,
        } : {}),
      })
      await actions.requestUiClose('menu')
    }
    return () => [
      h(QuaOverlayLayer, { handledElementIds: ['menu', 'saveLoad', 'confirm', 'titleConfirm', 'gameOver'] }),
      view.value.ui.overlays?.menu ? h('div', { class: 'qua-overlay-layer demo-system-layer', 'data-qua-input-ignore': '' }, [
        h(QuaMenuOverlay, null, { default: () => [
          header('菜单', String(view.value.ui.overlays?.menu?.subtitle || ''), () => actions.requestUiClose('menu')),
          h('div', { class: 'qua-menu-actions' }, DEMO_GAME_ACTIONS.map(item => h('button', {
            type: 'button', class: `qua-menu-action qua-menu-action--${item.id}`, onClick: () => openFromMenu(item.id),
          }, item.label))),
        ] }),
      ]) : null,
      view.value.ui.overlays?.saveLoad ? h('div', { class: 'qua-overlay-layer demo-system-layer', 'data-qua-input-ignore': '' }, [
        h(QuaSaveLoadPanel, null, { default: ({ mode, slots, overlay }: { mode: 'save' | 'load'; slots: SaveSlotProjection[]; overlay: Record<string, unknown> }) => [
          header(mode === 'save' ? '保存进度' : '读取存档', '', () => actions.requestUiClose('saveLoad')),
          h('div', { class: 'qua-save-load-mode-tabs' }, (overlay.source === 'main-menu' ? ['load'] : ['save', 'load']).map(tab => h('button', {
            type: 'button', class: ['qua-save-load-mode-tab', tab === mode ? 'is-active' : ''],
            onClick: () => actions.requestUiUpdate('saveLoad', { ...overlay, mode: tab }),
          }, tab === 'save' ? '保存' : '读取'))),
          h('ol', { class: 'qua-save-slot-grid' }, slots.map((slot, index) => {
            const filled = isFilledSaveSlot(slot)
            const chapter = STORY_TREE_NODES.find(node => node.chapter === slot.metadata?.chapterId)
            const choose = () => {
              if (mode === 'load') return actions.requestLoad(slot.slotId)
              if (!filled) return actions.requestSave(slot.slotId)
              return actions.requestUiOpen('confirm', {
                title: `覆盖存档 ${index + 1}？`, subtitle: chapter?.title || '已有阅读进度',
                description: '覆盖后无法恢复。',
                confirmLabel: '覆盖保存', cancelLabel: '取消',
                confirmEvent: RenderToLogicEvents.GAME_SAVE_REQUEST, confirmPayload: { slotId: slot.slotId },
                scene: createUiScene('game:overwrite', 'overlay', 'game-modal'), overlayStack: 'modal',
              })
            }
            return h('li', { class: 'qua-save-slot-item', key: slot.slotId }, [h('button', {
              type: 'button', class: ['qua-save-slot-button', filled ? 'is-filled' : 'is-empty'],
              disabled: mode === 'load' && !filled, 'data-save-slot-id': slot.slotId, onClick: choose,
            }, [
              h('span', { class: 'qua-save-slot-index' }, String(index + 1).padStart(2, '0')),
              h('span', { class: 'demo-slot-copy' }, [
                h('strong', filled ? chapter?.title || '阅读进度' : '空存档'),
                h('small', filled && slot.timestamp ? new Date(slot.timestamp).toLocaleString('zh-CN', { hour12: false }) : mode === 'save' ? '点击保存' : ''),
              ]),
            ])])
          })),
        ] }),
      ]) : null,
      ...['confirm', 'titleConfirm', 'gameOver'].filter(id => view.value.ui.overlays?.[id]).map(elementId =>
        h('div', { class: 'qua-overlay-layer demo-system-layer', 'data-overlay-stack': 'modal', 'data-qua-input-ignore': '' }, [
          h(QuaConfirmOverlay, { elementId }, { default: ({ overlay, confirm, cancel }: {
            overlay: Record<string, unknown>; confirm: () => Promise<void>; cancel: () => Promise<unknown>
          }) => [
            header(String(overlay.title || '确认操作'), String(overlay.subtitle || ''), cancel),
            h('p', { class: 'qua-confirm-description' }, String(overlay.description || '')),
            h('footer', { class: 'qua-confirm-actions' }, [
              h('button', { type: 'button', class: 'qua-confirm-action qua-confirm-action--cancel', onClick: cancel }, String(overlay.cancelLabel || '取消')),
              h('button', { type: 'button', class: 'qua-confirm-action qua-confirm-action--confirm', onClick: confirm }, String(overlay.confirmLabel || '确认')),
            ]),
          ] }),
        ])),
    ]
  },
})
