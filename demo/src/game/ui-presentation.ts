/** Demo-owned presentation contract shared by Web and native shells. */
export const DEMO_HUD_ACTIONS = [
  { id: 'auto', label: 'AUTO', title: 'Auto mode', width: 47, action: 'toggle', target: 'auto' },
  { id: 'skip', label: 'SKIP', title: 'Skip read text', width: 47, action: 'toggle', target: 'skip' },
  { id: 'log', label: 'LOG', title: 'Backlog', width: 40, action: 'open', target: 'backlog' },
  { id: 'menu', label: 'MENU', title: 'Menu', width: 48, action: 'open', target: 'game-menu' },
] as const

export const DEMO_MENU_OPTIONS = { showBacklog: false, titleActionLabel: 'TITLE' } as const
export const DEMO_TITLE_CONFIRM = {
  title: '回到标题菜单？',
  subtitle: '当前进度不会自动保存',
  description: '回到标题菜单前建议先保存。继续返回后，故事运行状态会保留在后台，START 会回到当前进度。',
} as const

export const DEMO_UI_METRICS = {
  toolbarWidth: 214, toolbarHeight: 40, toolbarGap: 4,
  menuWidth: 460, menuHeight: 405,
  saveWidth: 980, saveHeight: 478,
  confirmWidth: 520, confirmHeight: 260,
  backdropTop: 42,
} as const

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
