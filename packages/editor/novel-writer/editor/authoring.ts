import type { EditorAuthoringRequest, EditorProject, EditorWritingApply, EditorWritingBridge, EditorWritingContext, EditorWritingDocument } from '@quajs/editor-core'
import type { BrowserWindow, IpcMainEvent } from 'electron'
import { ipcMain } from 'electron'
import { dialogues, proseToQuaScript, rewriteDialogue, sourceToProse } from './source.js'
import { applyAdaptation, writingDocumentSchema } from './adaptation.js'

export class WritingAuthoring {
  private counter = 0
  private readonly pending = new Map<number, { resolve: (value: EditorWritingDocument | undefined) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout> }>()
  constructor(private readonly window: BrowserWindow, private readonly project: () => EditorProject | undefined, private readonly context: (root: string) => Promise<EditorWritingContext>) {
    ipcMain.on('editor:authoring-reply', this.reply)
  }

  private readonly reply = (event: IpcMainEvent, value: { id: number, result?: EditorWritingDocument, error?: string }): void => {
    if (event.sender !== this.window.webContents || event.senderFrame !== event.sender.mainFrame || !value)
      return
    const pending = this.pending.get(value.id)
    if (!pending) return
    this.pending.delete(value.id)
    clearTimeout(pending.timer)
    if (value.error) pending.reject(new Error(value.error.slice(0, 1000)))
    else pending.resolve(value.result)
  }

  private request(request: Omit<Extract<EditorAuthoringRequest, { kind: 'capture' }>, 'id' | 'deadline'> | Omit<Extract<EditorAuthoringRequest, { kind: 'apply' | 'validate' }>, 'id' | 'deadline'>): Promise<EditorWritingDocument | undefined> {
    if (this.pending.size >= 4)
      return Promise.reject(new Error('编辑请求处理中，请稍后重试。'))
    const id = ++this.counter
    const deadline = Date.now() + 60000
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('编辑器未响应。请检查源文件后重试。'))
      }, 60000)
      this.pending.set(id, { resolve, reject, timer })
      this.window.webContents.send('editor:authoring-request', { ...request, id, deadline })
    })
  }

  readonly bridge: Omit<EditorWritingBridge, 'onProjectChange'> = {
    context: async () => {
      const project = this.project()
      if (!project) throw new Error('请先在编辑器中打开项目。')
      const context = await this.context(project.root)
      if (this.project()?.root !== project.root) throw new Error('项目已切换。')
      return context
    },
    capture: async () => {
      const root = this.project()?.root
      const document = await this.request({ kind: 'capture' })
      if (!document || !root || document.root !== root || this.project()?.root !== root)
        throw new Error('请打开当前项目的 QS 文件。')
      return { document, prose: sourceToProse(document) }
    },
    convert: async prose => proseToQuaScript(prose),
    validate: async ({ base, text }) => {
      writingDocumentSchema.parse(base)
      if (this.project()?.root !== base.root) throw new Error('项目已切换。')
      if (text !== undefined && (typeof text !== 'string' || text.length > 1048576)) throw new Error('无效的 QS 内容。')
      const result = await this.request({ kind: 'validate', value: { root: base.root, path: base.path, text: text ?? base.text, base } })
      if (!result || this.project()?.root !== base.root) throw new Error('项目已切换。')
      return result
    },
    apply: async (request) => {
      if (!request || typeof request.root !== 'string' || this.project()?.root !== request.root)
        throw new Error('项目已切换，请重新提取项目上下文。')
      if (typeof request.path !== 'string' || !request.path.endsWith('.qs') || request.path.length > 4096)
        throw new Error('目标必须是项目中的 QS 文件。')
      if (!['create', 'append', 'rewrite'].includes(request.mode))
        throw new Error('无效的 QS 写入模式。')
      let text: string
      let selection: { start: number, end: number } | undefined
      if (request.mode === 'create') {
        if (request.base) throw new Error('新建文件不能携带源文件快照。')
        text = proseToQuaScript(request.prose)
      }
      else {
        const base = request.base
        if (!base || base.root !== request.root || base.path !== request.path || typeof base.text !== 'string' || base.text.length > 1048576
          || !Number.isInteger(base.start) || !Number.isInteger(base.end) || base.start < 0 || base.end < base.start || base.end > base.text.length)
          throw new Error('请先从当前 QS 取稿，建立回写快照。')
        if (request.mode === 'rewrite' && request.plan) {
          const adapted = applyAdaptation(base, request.prose, request.plan)
          text = adapted.text
          selection = adapted.selection
        }
        else text = request.mode === 'append' ? `${base.text}${base.text.endsWith('\n') ? '\n' : '\n\n'}${proseToQuaScript(request.prose)}` : rewriteDialogue(base, request.prose)
        dialogues(text)
      }
      if (text.length > 1048576) throw new Error('结果超过文档大小上限。')
      const value: EditorWritingApply = { root: request.root, path: request.path, text, base: request.base, selection }
      const result = await this.request({ kind: 'apply', value })
      if (!result) throw new Error('未收到回写结果，请检查编辑器。')
      return result
    },
  }

  dispose(): void {
    ipcMain.removeListener('editor:authoring-reply', this.reply)
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('写作插件已关闭。'))
    }
    this.pending.clear()
  }
}
