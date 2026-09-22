import type { EditorDocument } from '@quajs/editor-core'
import { documentLanguage, monaco } from './monaco'

interface PeekEntry { model: Promise<monaco.editor.ITextModel>, value?: monaco.editor.ITextModel, users: number }
/** Monaco's standalone resolver only knows already-created models. */
export class PeekModels {
  private readonly entries = new Map<string, PeekEntry>()
  private generation = 0
  constructor(private readonly read: (path: string) => Promise<EditorDocument>, private readonly find: (path: string) => monaco.editor.ITextModel | undefined) {}

  async createModelReference(resource: monaco.Uri) {
    const key = resource.toString()
    let entry = this.entries.get(key)
    if (!entry) {
      const open = monaco.editor.getModel(resource) || this.find(resource.fsPath)
      if (open)
        return { object: { textEditorModel: open }, dispose() {} }
      if (resource.scheme !== 'file')
        throw new Error('预览定义仅支持项目内文件。')
      if (this.entries.size >= 8)
        throw new Error('同时预览的定义文件过多，请关闭当前预览后重试。')
      const generation = this.generation
      const model = this.read(resource.fsPath).then((document) => {
        if (generation !== this.generation)
          throw new Error('项目已切换。')
        // Ephemeral, read-only peek content; never a tab or an authoritative draft.
        const value = monaco.editor.createModel(document.text, documentLanguage(document.path), resource)
        entry!.value = value
        return value
      })
      entry = { model, users: 0 }
      this.entries.set(key, entry)
    }
    entry.users++
    const release = (): void => {
      if (--entry.users === 0) {
        if (this.entries.get(key) === entry)
          this.entries.delete(key)
        entry.value?.dispose()
      }
    }
    try {
      const model = await entry.model
      let disposed = false
      return { object: { textEditorModel: model }, dispose() {
        if (!disposed) {
          disposed = true
          release()
        }
      } }
    }
    catch (error) {
      release()
      throw error
    }
  }

  clear(): void {
    this.generation++
    for (const entry of this.entries.values()) entry.value?.dispose()
    this.entries.clear()
  }
}
