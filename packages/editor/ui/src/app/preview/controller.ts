import type { PreviewCommand, PreviewState, PreviewTarget } from '@quajs/editor-core'
import type { AppContext } from '../bootstrap'
import { setIconButton } from '../../shared/icons'

export function createPreviewController(context: Pick<AppContext, 'bridge' | 'documentModel' | 'editor' | 'element' | 'nativePreview' | 'previewCommandBusy' | 'previewEmpty' | 'previewNeedsRestart' | 'previewRun' | 'previewState' | 'project' | 'projectRelativePath' | 'saveAll' | 'saving' | 'settings' | 'showError' | 'status' | 'tabs' | 'visualEditor' | 'workbench' | 'workspaceBusy'>) {
  let seeking = false
  async function run(): Promise<void> {
    if (context.workspaceBusy || context.saving)
      return
    await context.saveAll()
    await context.bridge.startPreview(context.element<HTMLSelectElement>('target').value as PreviewTarget)
    context.previewNeedsRestart = false
  }

  async function controlPreview(command: PreviewCommand): Promise<void> {
    if (context.previewCommandBusy || context.previewState.phase !== 'running' || !context.previewState.identity)
      return
    context.previewCommandBusy = true
    context.element<HTMLButtonElement>('preview-step').disabled = true
    context.element<HTMLButtonElement>('preview-seek').disabled = true
    const sessionId = context.previewState.identity.sessionId
    try {
      context.status(command.action === 'seek' ? '正在恢复状态并定位剧本…' : '正在单步预览…')
      const result = await context.bridge.previewCommand(sessionId, command)
      if (context.previewState.identity?.sessionId !== sessionId)
        return
      context.status(`${result.message}${result.path && result.stepIndex !== undefined && result.stepIndex >= 0 ? `，${result.path}，步骤 ${result.stepIndex + 1}` : ''}`)
    }
    finally {
      context.previewCommandBusy = false
      context.element<HTMLButtonElement>('preview-step').disabled = context.previewState.phase !== 'running'
      context.element<HTMLButtonElement>('preview-seek').disabled = !context.documentModel?.path.endsWith('.qs')
    }
  }

  async function seekPreview(line = context.editor.getPosition()?.lineNumber || 1): Promise<void> {
    if (seeking || !context.documentModel?.path.endsWith('.qs') || context.previewCommandBusy || context.workspaceBusy || context.saving)
      return
    const path = context.documentModel.path
    const root = context.project?.root
    const model = context.editor.getModel()
    if (!model || !Number.isInteger(line) || line < 1 || line > model.getLineCount() || !root || context.project?.pluginProject)
      return
    const needsRestart = context.tabs.some(tab => tab.dirty) || context.previewNeedsRestart || context.previewState.phase !== 'running'
    seeking = true
    try {
      await context.saveAll()
      const current = () => context.project?.root === root && context.documentModel?.path === path && context.editor.getModel() === model && !model.isDisposed()
      if (!current())
        return
      const version = model.getVersionId()
      const analysis = await context.bridge.analyzeDocument(path, model.getValue())
      if (!current() || model.getVersionId() !== version)
        return
      if (analysis.diagnostics.some(item => item.severity === 'error'))
        throw new Error('当前剧本存在静态编译错误，请先修复后预览。')
      const target = analysis.previewSteps.find(step => step.endLine >= line) || analysis.previewSteps.at(-1)
      if (!target)
        throw new Error('此文件没有可预览的对话或选择步骤。')
      if (needsRestart)
        await run()
      if (current() && model.getVersionId() === version)
        await controlPreview({ action: 'seek', path: context.projectRelativePath(path), stepIndex: target.index })
    }
    finally { seeking = false }
  }

  function setPreviewState(state: PreviewState): void {
    context.previewState = state
    if (state.identity)
      context.element<HTMLSelectElement>('target').value = state.identity.target
    setIconButton(context.element<HTMLButtonElement>('preview-mute'), state.muted ? 'muted' : 'volume', state.muted ? '取消预览静音' : '静音预览')
    context.element('preview-mute').setAttribute('aria-pressed', String(Boolean(state.muted)))
    context.workbench.previewChanged(state)
    context.previewNeedsRestart = false
    const building = state.phase === 'starting' && state.identity?.target === 'native' && !state.error
    context.element('preview-progress').hidden = !building
    context.element('preview-progress').dataset.stage = state.progress?.stage || 'build'
    context.element('preview-progress-label').textContent = state.progress?.label || '准备 Native 构建…'
    context.element('preview-progress-detail').textContent = state.progress?.detail || '正在启动项目构建脚本'
    context.element('preview-error-overlay').hidden = !state.renderError && !state.error
    context.element('preview-error-message').textContent = state.renderError || state.error || ''
    setIconButton(context.element<HTMLButtonElement>('preview-window'), state.detached ? 'redock' : 'popout', state.detached ? '返回预览面板' : '在独立窗口中预览')
    context.element<HTMLButtonElement>('stop').disabled = state.phase === 'idle'
    setIconButton(context.element<HTMLButtonElement>('run'), state.phase === 'running' ? 'refresh' : 'play', state.phase === 'running' ? '重启（F5）' : '运行（F5）')
    context.element<HTMLButtonElement>('preview-step').disabled = state.phase !== 'running' || context.previewCommandBusy
    context.nativePreview.setState(state.detached ? { phase: 'idle' } : state)
    updatePreviewBounds()
    if (state.error)
      context.showError(state.error)
  }

  function renderPreviewEmpty(borrowed = Boolean(context.workbench.animationScene.surface)): void {
    const state = context.previewState
    const building = state.phase === 'starting' && state.identity?.target === 'native' && !state.error
    context.element('preview-empty').hidden = !borrowed && (building || Boolean(state.error || state.renderError) || (state.phase === 'running' && !state.detached && !state.reloading))
    context.previewEmpty.heading.textContent = borrowed ? '正在动画编辑器中预览' : state.detached ? '预览已在独立窗口打开' : state.reloading ? '正在更新预览…' : state.phase === 'starting' ? '正在启动预览…' : state.phase === 'stopping' ? '正在停止预览…' : '预览尚未运行'
    context.previewEmpty.detail.textContent = borrowed ? '返回动画面板继续编辑和播放。' : state.detached ? '使用工具栏中的停靠按钮返回此处。' : state.phase === 'idle' ? context.project ? '运行项目，查看场景、对话和动画效果。' : '打开项目后，在这里预览故事效果。' : state.message || ''
    context.previewRun.hidden = borrowed || state.phase !== 'idle' || !context.project || context.element<HTMLButtonElement>('run').disabled
  }

  function updatePreviewBounds(): void {
    context.visualEditor.setVisible(context.workbench.dock.isVisible('properties'))
    context.editor.layout()
    context.workbench.writer.resize()
    const modalOpen = Boolean(context.project?.pluginProject) || context.workbench.interacting || (!context.workbench.animationScene.surface && !context.workbench.dock.isVisible('preview')) || Boolean(document.querySelector('dialog[open]'))
    context.nativePreview.suspended = modalOpen || Boolean(context.previewState.reloading || context.previewState.renderError || context.previewState.detached)
    const surface = context.workbench.animationScene.surface
    const { x, y, width, height } = (surface ?? context.element('preview')).getBoundingClientRect()
    renderPreviewEmpty(Boolean(surface))
    void context.bridge.setPreviewBounds({ x, y, width: modalOpen ? 0 : width, height: modalOpen ? 0 : height }).catch(context.showError)
  }
  return { run, controlPreview, seekPreview, setPreviewState, renderPreviewEmpty, updatePreviewBounds }
}
