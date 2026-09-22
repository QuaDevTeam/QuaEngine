import type { EditorFileOperation } from '@quajs/editor-core'
import type { AppContext } from '../bootstrap'
import { documentLanguage, monaco } from '../../features/source/monaco'

export function createDocumentsFiles(context: Pick<AppContext, 'activeTab' | 'analysisGeneration' | 'analysisTimer' | 'bridge' | 'checkDiskDocument' | 'clearDiskChange' | 'diskReadGeneration' | 'diskUnavailable' | 'documentModel' | 'editor' | 'flushProjectChange' | 'hideGitDiff' | 'openDocument' | 'previewNeedsRestart' | 'project' | 'projectRelativePath' | 'renderTabs' | 'saving' | 'scheduleAnalysis' | 'setDirty' | 'showError' | 'status' | 'tabs' | 'updateProject' | 'workbench' | 'workspaceBusy'>) {
  async function mutateFiles(operation: EditorFileOperation, openCreated = true): Promise<boolean> {
    if (!context.project || context.workspaceBusy || context.saving)
      throw new Error('请等待当前文件操作完成。')
    const root = context.project.root
    context.workspaceBusy = true
    ++context.analysisGeneration
    ++context.diskReadGeneration
    clearTimeout(context.analysisTimer)
    context.editor.updateOptions({ readOnly: true })
    context.status('正在处理文件…')
    try {
      const result = await context.bridge.fileOperation(root, operation)
      if (!result.applied || context.project.root !== root)
        return false
      context.hideGitDiff()
      context.clearDiskChange()
      if (operation.kind === 'move' || operation.kind === 'delete') {
        for (const tab of context.tabs) {
          const path = context.projectRelativePath(tab.document.path)
          if (path !== operation.path && !path.startsWith(`${operation.path}/`))
            continue
          if (operation.kind === 'move') {
            const nextPath = `${root.replaceAll('\\', '/')}/${operation.destination}${path.slice(operation.path.length)}`
            tab.document = { ...tab.document, path: nextPath }
            monaco.editor.setModelLanguage(tab.model, documentLanguage(nextPath))
            tab.unavailable = false
          }
          else {
            tab.unavailable = true
          }
        }
        if (context.activeTab) {
          context.documentModel = context.activeTab.document
          context.diskUnavailable = context.activeTab.unavailable
          context.setDirty(context.activeTab.dirty)
        }
        context.renderTabs()
      }
      if (result.project)
        context.updateProject(result.project)
      context.previewNeedsRestart = true
      if ('destination' in operation) {
        context.workbench.revealFile(operation.destination)
        if (operation.kind === 'move' && context.documentModel)
          context.workbench.documentMoved(context.projectRelativePath(context.documentModel.path))
        if (openCreated && operation.kind === 'create-file' && result.project?.files.includes(operation.destination)) {
          setTimeout(() => {
            if (context.project?.root === root)
              void context.openDocument(operation.destination).catch(context.showError)
          }, 0)
        }
      }
      context.status(operation.kind === 'delete' ? '已移至废纸篓；打开的编辑内容已保留' : '文件操作完成')
      return true
    }
    finally {
      context.workspaceBusy = false
      context.editor.updateOptions({ readOnly: false })
      context.flushProjectChange()
      void context.checkDiskDocument()
      context.scheduleAnalysis()
    }
  }
  return { mutateFiles }
}
