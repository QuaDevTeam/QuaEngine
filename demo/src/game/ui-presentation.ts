import type { ViewLayoutProjection } from '@quajs/render-core'

/** Demo-owned presentation contract shared by Web and native shells. */
export const DEMO_HUD_ACTIONS = [
  { id: 'auto', label: '自动', title: '自动阅读', width: 47, action: 'toggle', target: 'auto' },
  { id: 'skip', label: '快进', title: '按设置快进；遇到选项停止', width: 47, action: 'toggle', target: 'skip' },
  { id: 'log', label: '记录', title: '查看已读对白', width: 40, action: 'open', target: 'backlog' },
  { id: 'menu', label: '菜单', title: '保存、读取与设置', width: 48, action: 'open', target: 'game-menu' },
] as const

export const DEMO_MENU_OPTIONS = { showBacklog: false, titleActionLabel: 'TITLE' } as const
export const DEMO_TITLE_CONFIRM = {
  title: '返回标题？',
  subtitle: '',
  description: '当前进度会自动保存。下次可选择“继续阅读”。',
} as const

export const DEMO_UI_METRICS = {
  toolbarWidth: 214, toolbarHeight: 40, toolbarGap: 4,
  menuWidth: 460, menuHeight: 405,
  saveWidth: 980, saveHeight: 478,
  confirmWidth: 520, confirmHeight: 260,
  backdropTop: 42,
} as const

/** The HUD uses the same aspect safe area and 5% inset as the dialogue panel. */
export function demoHudRect(layout: Readonly<ViewLayoutProjection>) {
  const stageWidth = layout.height * layout.aspectRatio
  const safeWidth = Math.min(stageWidth, layout.height * layout.minAspectRatio)
  const safeX = (stageWidth - safeWidth) / 2
  return {
    x: safeX + safeWidth * 0.95 - DEMO_UI_METRICS.toolbarWidth,
    y: layout.height * (1 - 0.05 - 0.1225) - 8 - DEMO_UI_METRICS.toolbarHeight,
    width: DEMO_UI_METRICS.toolbarWidth,
    height: DEMO_UI_METRICS.toolbarHeight,
  }
}

export function demoPanelRect(width: number, height: number, inGame: boolean, stageWidth = 1920, stageHeight = 1080) {
  const top = DEMO_UI_METRICS.backdropTop
  const bottom = inGame ? stageHeight * (0.05 + 0.1225) + 8 + DEMO_UI_METRICS.toolbarHeight + 14 : top
  const panelWidth = Math.min(width, stageWidth - top * 2)
  const panelHeight = Math.min(height, stageHeight - top - bottom)
  return { x: (stageWidth - panelWidth) / 2, y: top + (stageHeight - top - bottom - panelHeight) / 2, width: panelWidth, height: panelHeight }
}

/** Application action policy, independent of DOM/QUI. Called by pipeline handlers. */
export async function toggleDemoFlowControl(engine: {
  getFlowControlState(): { mode: string }
  startAuto(): Promise<unknown>
  stopAuto(): Promise<unknown>
  startSkip(): Promise<unknown>
  stopSkip(): Promise<unknown>
}, mode: 'auto' | 'skip') {
  const active = engine.getFlowControlState().mode === mode
  if (mode === 'auto') return active ? engine.stopAuto() : engine.startAuto()
  if (engine.getFlowControlState().mode === 'auto') await engine.stopAuto()
  return active ? engine.stopSkip() : engine.startSkip()
}

export const DEMO_GAME_ACTIONS = [
  { id: 'continue', label: '继续阅读' }, { id: 'save', label: '保存进度' },
  { id: 'load', label: '读取存档' }, { id: 'settings', label: '设置' },
  { id: 'title', label: '返回标题' },
] as const
