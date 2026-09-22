import type { EditorProject, PreviewTarget } from '@quajs/editor-core'
import type { AppContext } from '../bootstrap'
import { monaco } from '../../features/source/monaco'

export function createProjectLifecycle(context: Pick<AppContext, 'activeTab' | 'analysisGeneration' | 'analysisTimer' | 'analyzedPath' | 'app' | 'bridge' | 'checkTimer' | 'checkedDiagnostics' | 'clearDiskChange' | 'dialogueColors' | 'diskUnavailable' | 'documentDiagnostics' | 'documentModel' | 'editor' | 'element' | 'explorerEmpty' | 'flushProjectChange' | 'gitTabs' | 'hideGitDiff' | 'languageService' | 'mayDiscard' | 'peekModels' | 'problems' | 'project' | 'projectRelativePath' | 'renderDiagnostics' | 'renderPreviewEmpty' | 'saving' | 'setCheckIndicator' | 'setDirty' | 'setup' | 'showError' | 'status' | 'tabs' | 'updatePreviewBounds' | 'visualEditor' | 'welcome' | 'welcomeFind' | 'workbench' | 'workspaceBusy'>) {
  function setProject(next: EditorProject): void {
    context.peekModels.clear()
    context.hideGitDiff()
    context.gitTabs.length = 0
    ++context.analysisGeneration
    clearTimeout(context.analysisTimer)
    context.project = next
    context.documentDiagnostics = []
    context.checkedDiagnostics = []
    context.analyzedPath = undefined
    context.dialogueColors.reset()
    context.clearDiskChange()
    context.documentModel = undefined
    context.editor.setModel(null)
    context.workbench.documentClosed()
    for (const tab of context.tabs) tab.model.dispose()
    context.tabs.length = 0
    context.activeTab = undefined
    context.setDirty(false)
    context.element('editor-empty').hidden = false
    context.element<HTMLInputElement>('file-search').value = ''
    context.element<HTMLButtonElement>('format').disabled = true
    updateProject(next)
    context.status(next.root)
  }

  function updateProject(next: EditorProject): void {
    context.project = next
    context.welcome.heading.textContent = '尚未打开文件'
    context.welcome.detail.textContent = '从左侧选择文件，或按 ⌘ / Ctrl P 快速查找。'
    context.welcomeFind.hidden = false
    context.element('welcome-open').hidden = true
    context.element('welcome-create').hidden = true
    context.explorerEmpty.element.hidden = true
    context.problems.setProject(true)
    context.setup.update(next)
    context.app.classList.toggle('plugin-project', Boolean(next.pluginProject))
    context.workbench.update(next)
    context.updatePreviewBounds()
    const target = context.element<HTMLSelectElement>('target')
    for (const option of target.options)
      option.disabled = !next.targets[option.value as PreviewTarget].enabled
    if (!next.targets[target.value as PreviewTarget].enabled)
      target.value = next.targets.web.enabled ? 'web' : 'native'
    context.element<HTMLButtonElement>('run').disabled = !next.targets[target.value as PreviewTarget].enabled
    context.renderPreviewEmpty()
    context.renderDiagnostics([...next.diagnostics, ...context.documentDiagnostics])
    clearTimeout(context.checkTimer)
    context.problems.setChecking(true)
    context.setCheckIndicator('checking', '准备检查…')
    context.checkTimer = setTimeout(() => void context.bridge.checkProject(next.root).catch(context.showError), 350)
  }

  async function openProject(request?: import('@quajs/editor-core').EditorCreateProject): Promise<void> {
    if (context.workspaceBusy || context.saving)
      return
    context.workspaceBusy = true
    context.editor.updateOptions({ readOnly: true })
    try {
      if (!await context.mayDiscard())
        return
      context.status('正在读取项目…')
      const next = request ? await context.bridge.createProject(request) : await context.bridge.openProject()
      if (next)
        setProject(next)
      else
        context.status('就绪')
    }
    catch (error) {
      context.showError(error)
      if (request)
        throw error
    }
    finally {
      context.workspaceBusy = false
      context.editor.updateOptions({ readOnly: false })
      context.flushProjectChange()
    }
  }

  function scheduleAnalysis(): void {
    const generation = ++context.analysisGeneration
    clearTimeout(context.analysisTimer)
    context.analysisTimer = setTimeout(() => {
      const model = context.editor.getModel()
      if (!context.documentModel || !model || context.diskUnavailable || context.workspaceBusy)
        return
      const path = context.documentModel.path
      const text = model.getValue()
      void context.languageService.sync().then(() => context.bridge.analyzeDocument(path, text)).then((analysis) => {
        if (generation !== context.analysisGeneration || model.isDisposed())
          return
        context.visualEditor.update(analysis.authoring, text)
        const diagnostics = analysis.diagnostics
        context.dialogueColors.apply(analysis.dialogueHighlights)
        context.analyzedPath = context.projectRelativePath(path)
        monaco.editor.setModelMarkers(model, 'document-language', diagnostics.map(diagnostic => ({
          message: diagnostic.message,
          code: diagnostic.code,
          severity: diagnostic.severity === 'error' ? monaco.MarkerSeverity.Error : diagnostic.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
          startLineNumber: Math.max(1, diagnostic.line || 1),
          endLineNumber: Math.max(1, diagnostic.endLine || diagnostic.line || 1),
          startColumn: Math.max(1, diagnostic.column || 1),
          endColumn: Math.max(1, diagnostic.endColumn || (diagnostic.column || 1) + 1),
        })))
        context.documentDiagnostics = diagnostics
        context.renderDiagnostics([...(context.project?.diagnostics ?? []), ...diagnostics])
      }).catch((error) => {
        if (generation === context.analysisGeneration && !model.isDisposed())
          context.showError(error)
      })
    }, 280)
  }
  return { setProject, updateProject, openProject, scheduleAnalysis }
}
