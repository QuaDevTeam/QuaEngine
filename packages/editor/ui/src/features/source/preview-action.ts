import type { monaco } from './monaco'

/** Preserve the clicked row even when it is inside an existing selection. */
export function registerPreviewAction(editor: monaco.editor.IStandaloneCodeEditor, seek: (line: number) => Promise<void>): void {
  let clicked: { model: monaco.editor.ITextModel, line: number } | undefined
  const reset = () => {
    clicked = undefined
  }
  const subscriptions = [
    editor.onMouseDown(reset),
    editor.onKeyDown(reset),
    editor.onDidChangeModel(reset),
    editor.onContextMenu((event) => {
      const model = editor.getModel()
      clicked = model && event.target.position ? { model, line: event.target.position.lineNumber } : undefined
    }),
    editor.addAction({
      id: 'qua.preview.runToLine',
      label: '运行到此行',
      precondition: 'editorLangId == quascript && !editorReadonly',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 0,
      run: async (target) => {
        const model = target.getModel()
        const line = clicked?.model === model ? clicked.line : target.getPosition()?.lineNumber
        reset()
        if (model?.getLanguageId() === 'quascript' && line)
          await seek(line)
      },
    }),
  ]
  editor.onDidDispose(() => subscriptions.forEach(subscription => subscription.dispose()))
}
