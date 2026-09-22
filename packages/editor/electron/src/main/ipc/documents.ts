import type {
  EditorDocument,
  EditorLanguageRequest,
} from '@quajs/editor-core'
import type { MainServices } from './services.js'
import {
  dialog,
} from 'electron'

export function registerDocumentsIpc(context: Pick<MainServices, 'handle' | 'project' | 'pluginOperation' | 'documentDirty' | 'window'>): void {
  context.handle('editor:read', (path: string) => context.project.request('read', path))
  context.handle('editor:save', (document: EditorDocument) => {
    if (context.pluginOperation)
      throw new Error('插件安装期间暂停文件保存。')
    return context.project.request('save', document)
  })
  context.handle('editor:dirty', (dirty: boolean) => {
    context.documentDirty = dirty === true
  })
  context.handle('editor:confirm-discard', async () => {
    const result = await dialog.showMessageBox(context.window, {
      type: 'question',
      message: '存在尚未保存的文档',
      detail: '是否放弃当前修改？',
      buttons: ['继续编辑', '放弃修改'],
      defaultId: 0,
      cancelId: 0,
    })
    return result.response === 1
  })
  context.handle('editor:analyze', (path: string, text: string) =>
    context.project.request('analyze', path, text))
  context.handle('editor:complete', (request: EditorLanguageRequest) =>
    context.project.request('complete', request))
  context.handle('editor:signature', (request: EditorLanguageRequest) =>
    context.project.request('signature', request))
  context.handle('editor:hover', (request: EditorLanguageRequest) =>
    context.project.request('hover', request))
  context.handle('editor:define', (request: EditorLanguageRequest) =>
    context.project.request('define', request))
  context.handle(
    'editor:format',
    (
      path: string,
      text: string,
      options: { tabSize: number, insertSpaces: boolean },
    ) => context.project.request('format', path, text, options),
  )
}
