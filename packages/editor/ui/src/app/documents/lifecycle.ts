import type { EditorDocument } from '@quajs/editor-core'
import type { AppContext } from '../bootstrap'
import { canFormat, documentLanguage, monaco } from '../../features/source/monaco'

export function createDocumentsLifecycle(context: Pick<AppContext, 'activeGitTab' | 'activeTab' | 'analysisGeneration' | 'analysisTimer' | 'analyzedPath' | 'bridge' | 'changingDocument' | 'checkDiskDocument' | 'clearDiskChange' | 'dialogueColors' | 'dirty' | 'diskUnavailable' | 'documentDiagnostics' | 'documentModel' | 'editor' | 'element' | 'flushProjectChange' | 'hideGitDiff' | 'openGeneration' | 'previewCommandBusy' | 'projectRelativePath' | 'renderTabs' | 'reportDirty' | 'saving' | 'scheduleAnalysis' | 'settings' | 'status' | 'tabs' | 'workbench' | 'workspaceBusy'>) {
  async function openDocument(path: string, line?: number, column?: number, forceReload = false, focus = true, followSource = true): Promise<void> {
    if (focus)
      context.workbench.dock.open('source')
    if (context.workspaceBusy || context.saving)
      return
    context.workspaceBusy = true
    context.hideGitDiff()
    context.editor.updateOptions({ readOnly: true })
    try {
      await replaceDocument(path, line, column, forceReload, focus)
      if (followSource && context.documentModel && context.projectRelativePath(context.documentModel.path) === context.projectRelativePath(path)) {
        const position = context.editor.getPosition()
        context.workbench.documentOpened(context.projectRelativePath(context.documentModel.path), position?.lineNumber, position?.column)
      }
      context.element('document-tabs').querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    finally {
      context.workspaceBusy = false
      context.editor.updateOptions({ readOnly: false })
      context.flushProjectChange()
      void context.checkDiskDocument()
    }
  }

  async function replaceDocument(path: string, line?: number, column?: number, forceReload = false, focus = true): Promise<void> {
    if (!forceReload && context.documentModel && context.projectRelativePath(path) === context.projectRelativePath(context.documentModel.path)) {
      if (line) {
        context.editor.setPosition({ lineNumber: line, column: column || 1 })
        context.editor.revealLineInCenter(line)
      }
      if (focus)
        context.editor.focus()
      return
    }
    if (forceReload && context.dirty && !await context.bridge.confirmDiscard())
      return
    const existing = context.tabs.find(tab => context.projectRelativePath(tab.document.path) === context.projectRelativePath(path))
    const generation = ++context.openGeneration
    const next = !forceReload && existing ? existing.document : await context.bridge.readDocument(path)
    if (generation !== context.openGeneration)
      return
    if (!existing) {
    // Keep a single editor and bound dormant buffers. Never evict unsaved work.
      while (context.tabs.length >= 24 || context.tabs.reduce((size, tab) => size + tab.model.getValueLength() * 2, 0) + next.text.length * 2 > 24 * 1024 * 1024) {
        const disposable = context.tabs.find(tab => !tab.dirty && tab !== context.activeTab)
        if (!disposable)
          throw new Error('打开的文档已达到内存上限，请保存并关闭部分 Tab。')
        context.tabs.splice(context.tabs.indexOf(disposable), 1)
        disposable.model.dispose()
      }
    }
    if (context.activeTab)
      context.activeTab.view = context.editor.saveViewState()
    ++context.analysisGeneration
    clearTimeout(context.analysisTimer)
    context.clearDiskChange()
    context.documentDiagnostics = []
    context.analyzedPath = undefined
    context.dialogueColors.clear()
    context.changingDocument = true
    try {
      const tab = existing || { document: next, model: monaco.editor.createModel(next.text, documentLanguage(next.path), monaco.Uri.file(next.path).with({ fragment: crypto.randomUUID() })), view: null, dirty: false, unavailable: false }
      if (!existing)
        context.tabs.push(tab)
      if (forceReload) {
        tab.document = next
        tab.model.setValue(next.text)
        tab.dirty = false
        tab.unavailable = false
      }
      context.activeTab = tab
      context.documentModel = tab.document
      context.editor.setModel(tab.model)
      context.settings.apply()
      context.diskUnavailable = tab.unavailable
      setDirty(tab.dirty)
      context.element('editor-empty').hidden = true
      context.element<HTMLButtonElement>('format').disabled = !canFormat(next.path)
      if (tab.view)
        context.editor.restoreViewState(tab.view)
      if (line || !tab.view) {
        context.editor.setPosition({ lineNumber: Math.max(1, line || 1), column: Math.max(1, column || 1) })
        context.editor.revealLineInCenter(Math.max(1, line || 1))
      }
      if (focus)
        context.editor.focus()
    }
    finally {
      context.changingDocument = false
    }
    context.scheduleAnalysis()
  }

  async function saveDocument(comparedDisk?: EditorDocument): Promise<void> {
    if (context.activeGitTab || !context.documentModel || !context.dirty || context.saving || context.workspaceBusy)
      return
    if (context.diskUnavailable)
      throw new Error('磁盘文件不可读取；当前内容仍保留，请先恢复文件。')
    const path = context.documentModel.path
    const model = context.editor.getModel()
    context.saving = true
    try {
      if (comparedDisk && comparedDisk.path !== path)
        throw new Error('比较版本已失效，请重新比较。')
      if (context.settings.value.formatOnSave && !comparedDisk)
        await context.editor.getAction('editor.action.formatDocument')?.run()
      const saved = await context.bridge.saveDocument({ ...context.documentModel, revision: comparedDisk?.revision ?? context.documentModel.revision, text: context.editor.getValue() })
      if (context.documentModel?.path !== path || context.editor.getModel() !== model)
        return
      context.documentModel = saved
      context.clearDiskChange()
      setDirty(context.editor.getValue() !== saved.text)
      context.status('已保存')
    }
    finally {
      context.saving = false
      context.flushProjectChange()
    }
  }

  function setDirty(next: boolean): void {
    context.dirty = next
    if (context.activeTab) {
      context.activeTab.dirty = next
      context.activeTab.document = context.documentModel!
      context.activeTab.unavailable = context.diskUnavailable
    }
    context.reportDirty()
    context.renderTabs()
    context.element<HTMLButtonElement>('save').disabled = !context.documentModel || !next || context.diskUnavailable
    context.element<HTMLButtonElement>('preview-seek').disabled = !context.documentModel?.path.endsWith('.qs') || context.previewCommandBusy
  }
  return { openDocument, replaceDocument, saveDocument, setDirty }
}
