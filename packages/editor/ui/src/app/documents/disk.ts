import type { EditorDocument } from '@quajs/editor-core'
import type { AppContext } from '../bootstrap'

export function createDocumentsDisk(context: Pick<AppContext, 'activeGitTab' | 'bridge' | 'changingDocument' | 'diskDiff' | 'diskReadGeneration' | 'diskUnavailable' | 'diskVersion' | 'documentModel' | 'editor' | 'element' | 'pendingProjectChange' | 'previewNeedsRestart' | 'project' | 'projectRelativePath' | 'reviewedDisk' | 'saving' | 'scheduleAnalysis' | 'setDirty' | 'status' | 'updateProject' | 'workspaceBusy'>) {
  function closeDiskDiff(): void {
    context.diskDiff.close()
    context.element('editor').hidden = Boolean(context.activeGitTab)
    context.element('close-diff').hidden = true
    context.editor.layout()
  }

  function clearDiskChange(): void {
    ++context.diskReadGeneration
    context.diskVersion = undefined
    context.reviewedDisk = undefined
    context.element<HTMLButtonElement>('keep-local').disabled = true
    context.diskUnavailable = false
    context.element('disk-change').hidden = true
    closeDiskDiff()
  }

  function flushProjectChange(): void {
    if (context.workspaceBusy || context.saving || !context.pendingProjectChange)
      return
    const change = context.pendingProjectChange
    context.pendingProjectChange = undefined
    if (change.project.root !== context.project?.root)
      return
    if (change.paths.some(path => !path || /\.(?:qs|ts|json|yaml|yml)$/u.test(path)))
      context.previewNeedsRestart = true
    context.updateProject(change.project)
    context.scheduleAnalysis()
    const localPath = context.documentModel && context.projectRelativePath(context.documentModel.path)
    if (localPath && change.paths.some(path => !path || localPath === path || localPath.startsWith(`${path}/`)))
      void checkDiskDocument()
  }

  async function checkDiskDocument(): Promise<void> {
    if (!context.documentModel)
      return
    const base = context.documentModel
    const model = context.editor.getModel()
    const generation = ++context.diskReadGeneration
    let disk: EditorDocument | undefined
    try {
      disk = await context.bridge.readDocument(base.path)
    }
    catch {
    // File deletion, replacement and permission changes never discard the working buffer.
    }
    if (generation !== context.diskReadGeneration || context.documentModel !== base || model !== context.editor.getModel())
      return
    if (context.workspaceBusy || context.saving) {
      if (context.project)
        context.pendingProjectChange = { project: context.project, paths: [''] }
      return
    }
    if (disk && (disk.revision === base.revision || context.editor.getValue() === disk.text)) {
      if (context.editor.getValue() === disk.text)
        context.documentModel = disk
      clearDiskChange()
      context.setDirty(context.editor.getValue() !== context.documentModel.text)
      return
    }
    if (disk && context.editor.getValue() === base.text && model) {
      const view = context.editor.saveViewState()
      context.changingDocument = true
      try {
        context.documentModel = disk
        model.setValue(disk.text)
        if (view)
          context.editor.restoreViewState(view)
      }
      finally {
        context.changingDocument = false
      }
      clearDiskChange()
      context.setDirty(false)
      context.scheduleAnalysis()
      context.status('已同步磁盘上的修改')
      return
    }
    closeDiskDiff()
    context.diskVersion = disk
    context.reviewedDisk = undefined
    context.element<HTMLButtonElement>('keep-local').disabled = true
    context.diskUnavailable = !disk
    context.element('disk-change').hidden = false
    context.element('disk-message').textContent = disk ? '文件已被外部修改；未保存内容已保留。' : '磁盘文件已删除或不可读取；编辑内容已保留。'
    context.element<HTMLButtonElement>('compare-disk').disabled = !disk
    context.element<HTMLButtonElement>('reload-disk').disabled = !disk
    context.editor.layout()
    const position = context.editor.getPosition()
    if (position)
      context.editor.revealPositionInCenterIfOutsideViewport(position)
    context.setDirty(true)
  }
  return { closeDiskDiff, clearDiskChange, flushProjectChange, checkDiskDocument }
}
