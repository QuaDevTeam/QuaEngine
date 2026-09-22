import type { AppContext } from '../bootstrap'
import { monaco } from '../../features/source/monaco'

export function createAuthoringSourceEdits(context: Pick<AppContext, 'activeGitTab' | 'activeTab' | 'bridge' | 'diskUnavailable' | 'documentModel' | 'editor' | 'openDocument' | 'previewState' | 'project' | 'projectRelativePath' | 'saving' | 'seekPreview' | 'status' | 'visualEditor' | 'workspaceBusy'>) {
  async function applyPluginEdit(edit: import('@quajs/editor-core').EditorSourceEdit): Promise<void> {
    if (!context.project || edit.root !== context.project.root || context.workspaceBusy || context.saving)
      throw new Error('项目已切换或编辑器正忙，请稍后重试。')
    const root = context.project.root
    await context.openDocument(edit.path)
    if (context.project?.root !== root || !context.activeTab || context.projectRelativePath(context.activeTab.document.path) !== context.projectRelativePath(edit.path) || context.activeTab.unavailable)
      throw new Error('目标文档已不可用。')
    const tab = context.activeTab
    const disk = await context.bridge.readDocument(edit.path)
    if (context.project?.root !== root || context.activeTab !== tab || context.workspaceBusy || context.saving)
      throw new Error('编辑上下文已改变，请重试。')
    if (tab.dirty || tab.model.getValue() !== disk.text || disk.revision !== edit.revision || tab.document.revision !== edit.revision)
      throw new Error('源文件已有未保存或外部修改，请先处理并保存，再刷新编辑面板。')
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end < edit.start || edit.end > disk.text.length || disk.text.slice(edit.start, edit.end) !== edit.expectedText)
      throw new Error('源码索引已过期，请刷新后重试。')
    if ((disk.text.length - (edit.end - edit.start) + edit.newText.length) * 2 > 2 * 1024 * 1024)
      throw new Error('编辑结果超过文档大小上限。')
    const start = tab.model.getPositionAt(edit.start)
    const end = tab.model.getPositionAt(edit.end)
    context.editor.pushUndoStop()
    context.editor.executeEdits('editor-plugin', [{ range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: edit.newText }])
    context.editor.pushUndoStop()
    context.editor.setPosition(start)
    context.editor.revealLineInCenter(start.lineNumber)
    context.status('已应用到源文件，可撤销。保存后更新编辑面板')
  }

  async function openPreviewSource(request: import('@quajs/editor-core').PreviewSourceRequest, replay = false): Promise<void> {
    const source = request.source
    if (!source || !context.project || context.workspaceBusy || context.saving)
      throw new Error('此对象没有可编辑的 QS 来源；请从已注册的剧本开始预览。')
    const root = context.project.root
    const session = context.previewState.identity?.sessionId
    const relative = context.projectRelativePath(source.path)
    if (!relative.endsWith('.qs') || relative.startsWith('/') || relative.split('/').includes('..'))
      throw new Error('预览源码不属于当前项目。')
    await context.openDocument(relative, source.line, undefined, false, false)
    const model = context.editor.getModel()
    if (!model || context.project?.root !== root || context.projectRelativePath(context.documentModel?.path || '') !== relative || context.diskUnavailable || context.activeGitTab || context.workspaceBusy)
      throw new Error('编辑上下文已变化，请重新拾取。')
    const text = model.getValue()
    const version = model.getVersionId()
    const valid = () => context.editor.getModel() === model && model.getVersionId() === version && context.project?.root === root && context.previewState.identity?.sessionId === session && !context.previewState.reloading && !context.saving && !context.workspaceBusy && !context.diskUnavailable
    if (!Number.isSafeInteger(source.start) || !Number.isSafeInteger(source.end) || source.start < 0 || source.end < source.start || text.slice(source.start, source.end) !== source.expectedText)
      throw new Error('这句 QS 已变化；已打开源码，请保存并刷新预览后重新拾取。')
    const analysis = await context.bridge.analyzeDocument(relative, text)
    if (!valid())
      throw new Error('编辑上下文已变化，请重新拾取。')
    const step = analysis.authoring?.steps[source.stepIndex]
    if (!step || step.start !== source.start || step.end !== source.end)
      throw new Error('剧本步骤已变化，请刷新预览。')
    context.visualEditor.update(analysis.authoring, text)
    context.visualEditor.revealStep(step.index, request.kind)
    if (replay) {
      await context.seekPreview()
      return
    }
    if (request.text === undefined)
      return
    const field = step.fields.find(field => field.label === '文本')
    if (!field || field.kind !== 'text' || field.value !== request.expectedText || field.value.includes('${'))
      throw new Error('此对白含插值、富文本或已变化，请在 QS 表单中编辑。')
    if (/[\r\n]/u.test(request.text) || request.text.includes('${'))
      throw new Error('预览内编辑需使用单行纯文本；插值与多行内容请在 QS 中编辑。')
    const candidate = text.slice(0, field.start) + request.text + text.slice(field.end)
    if (candidate.length * 2 > 2 * 1024 * 1024)
      throw new Error('编辑结果超过文档大小上限。')
    const next = await context.bridge.analyzeDocument(relative, candidate)
    const shape = (data: typeof analysis) => JSON.stringify(data.authoring?.steps.map(item => [item.kind, item.decorators.map(value => value.name), item.fields.find(value => value.label === '说话角色')?.value]))
    if (!next.authoring || next.authoring.error || shape(next) !== shape(analysis) || next.authoring.steps[step.index]?.fields.find(value => value.label === '文本')?.value !== request.text)
      throw new Error('此文本会改变 QS 语法结构，请在源码中编辑。')
    if (!valid())
      throw new Error('源码在编辑期间已变化，请重新拾取。')
    const start = model.getPositionAt(field.start)
    const end = model.getPositionAt(field.end)
    context.editor.pushUndoStop()
    context.editor.executeEdits('preview-dialogue', [{ range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: request.text }])
    context.editor.pushUndoStop()
    context.visualEditor.update(next.authoring, candidate)
    context.visualEditor.revealStep(step.index, 'dialogue')
    context.status('已写入 QS 草稿，可撤销。保存后更新场景')
  }
  return { applyPluginEdit, openPreviewSource }
}
