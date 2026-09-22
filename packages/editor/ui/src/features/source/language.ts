import type { EditorBridge, EditorRange } from '@quajs/editor-core'
import { monaco } from './monaco'

export function monacoRange(range: EditorRange): monaco.Range {
  return new monaco.Range(range.start.line, range.start.column, range.end.line, range.end.column)
}
export function connectLanguageService(
  bridge: EditorBridge,
  editor: monaco.editor.IStandaloneCodeEditor,
  openDocument: (path: string, line?: number, column?: number) => Promise<void>,
  onError: (error: unknown) => void,
  documentPath: (model: monaco.editor.ITextModel) => string | undefined,
  workspace: () => { root: string, documents: { path: string, model: monaco.editor.ITextModel }[] } | undefined,
): monaco.IDisposable & { sync: () => Promise<void> } {
  let syncKey = ''
  let syncing = Promise.resolve()
  function sync(): Promise<void> {
    const state = workspace()
    if (!state)
      return Promise.resolve()
    const key = JSON.stringify([state.root, ...state.documents.map(item => [item.path, item.model.id, item.model.getVersionId()])])
    if (key === syncKey)
      return syncing
    syncKey = key
    const documents = state.documents.map(item => ({ path: item.path, text: item.model.getValue() }))
    syncing = syncing.catch(() => {}).then(() => bridge.syncDocuments(state.root, documents)).catch((error) => {
      if (syncKey === key)
        syncKey = ''
      throw error
    })
    return syncing
  }
  const selector = ['quascript', 'typescript', 'javascript', 'json', 'jsonc', 'yaml', 'markdown', 'css', 'scss', 'html'].map(language => ({ language, scheme: 'file' }))
  const request = (model: monaco.editor.ITextModel, position: monaco.Position) => ({
    path: documentPath(model)!,
    text: model.getValue(),
    position: { line: position.lineNumber, column: position.column },
  })
  const current = (model: monaco.editor.ITextModel, version: number, token: monaco.CancellationToken) =>
    !token.isCancellationRequested && !model.isDisposed() && model.getVersionId() === version
  async function query<T>(model: monaco.editor.ITextModel, token: monaco.CancellationToken, action: () => Promise<T>): Promise<T | undefined> {
    const path = documentPath(model)
    if (!path || token.isCancellationRequested)
      return undefined
    const version = model.getVersionId()
    try {
      await sync()
      if (!current(model, version, token) || documentPath(model) !== path)
        return undefined
      const result = await action()
      return current(model, version, token) && documentPath(model) === path ? result : undefined
    }
    catch (error) {
      if (current(model, version, token) && documentPath(model) === path)
        onError(error)
      return undefined
    }
  }
  const disposables = [
    monaco.languages.registerCompletionItemProvider(selector, {
      triggerCharacters: ['@', '$', '{', '.', ' ', '"', '\'', '/', '#', ':', '(', ','],
      async provideCompletionItems(model, position, _context, token) {
        const items = await query(model, token, () => bridge.completeDocument(request(model, position)))
        if (!items)
          return { suggestions: [] }
        const word = model.getWordUntilPosition(position)
        const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
        const quoted = /["']([^"'\\]*)$/.exec(before)
        return { suggestions: items.map((item) => {
          const startColumn = item.kind === 'decorator'
            ? before.lastIndexOf('@') + 2
            : quoted && (item.kind === 'asset' || item.kind === 'value') ? position.column - quoted[1].length : word.startColumn
          const insertText = item.insertText || item.label
          return {
            ...item,
            kind: completionKind(item.kind),
            documentation: item.documentation ? { value: item.documentation, isTrusted: false, supportHtml: false } : undefined,
            insertText,
            insertTextRules: (item.snippet ?? /\$\{\d+(?::[^}]*)?\}/.test(insertText)) ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            range: item.range ? monacoRange(item.range) : new monaco.Range(position.lineNumber, startColumn, position.lineNumber, word.endColumn),
          }
        }) }
      },
    }),
    monaco.languages.registerSignatureHelpProvider({ language: 'quascript', scheme: 'file' }, {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [')'],
      async provideSignatureHelp(model, position, token) {
        const value = await query(model, token, () => bridge.signatureDocument(request(model, position)))
        return value ? { value, dispose() {} } : undefined
      },
    }),
    monaco.languages.registerHoverProvider(selector, {
      async provideHover(model, position, token) {
        const hover = await query(model, token, () => bridge.hoverDocument(request(model, position)))
        if (!hover)
          return undefined
        return { contents: [{ value: hover.contents, isTrusted: false, supportHtml: false }], range: hover.range ? monacoRange(hover.range) : undefined }
      },
    }),
    monaco.languages.registerDefinitionProvider(selector, {
      async provideDefinition(model, position, token) {
        const definitions = await query(model, token, () => bridge.defineDocument(request(model, position)))
        if (!definitions)
          return []
        return definitions.map((definition) => {
          const open = workspace()?.documents.find(item => item.path === definition.path)
          return { uri: open?.model.uri || monaco.Uri.file(definition.path), range: monacoRange(definition.range) }
        })
      },
    }),
    monaco.languages.registerDocumentFormattingEditProvider(selector, {
      async provideDocumentFormattingEdits(model, options, token) {
        const edits = await query(model, token, () => bridge.formatDocument(documentPath(model)!, model.getValue(), options))
        return edits?.map(edit => ({ range: monacoRange(edit.range), text: edit.newText })) ?? []
      },
    }),
    monaco.editor.registerEditorOpener({
      async openCodeEditor(source, resource, location) {
        if (source !== editor || resource.scheme !== 'file')
          return false
        const line = location && ('startLineNumber' in location ? location.startLineNumber : location.lineNumber)
        const column = location && ('startColumn' in location ? location.startColumn : location.column)
        try {
          const path = workspace()?.documents.find(item => item.model.uri.toString() === resource.toString())?.path || resource.fsPath
          await openDocument(path, line, column)
        }
        catch (error) {
          onError(error)
        }
        return true
      },
    }),
  ]
  return { sync, dispose: () => disposables.forEach(disposable => disposable.dispose()) }
}

function completionKind(kind: string): monaco.languages.CompletionItemKind {
  const kinds: Record<string, monaco.languages.CompletionItemKind> = {
    asset: monaco.languages.CompletionItemKind.File,
    character: monaco.languages.CompletionItemKind.Value,
    decorator: monaco.languages.CompletionItemKind.Function,
    class: monaco.languages.CompletionItemKind.Class,
    enum: monaco.languages.CompletionItemKind.Enum,
    function: monaco.languages.CompletionItemKind.Function,
    interface: monaco.languages.CompletionItemKind.Interface,
    keyword: monaco.languages.CompletionItemKind.Keyword,
    method: monaco.languages.CompletionItemKind.Method,
    module: monaco.languages.CompletionItemKind.Module,
    property: monaco.languages.CompletionItemKind.Property,
    type: monaco.languages.CompletionItemKind.TypeParameter,
    value: monaco.languages.CompletionItemKind.EnumMember,
    variable: monaco.languages.CompletionItemKind.Variable,
  }
  return kinds[kind] ?? monaco.languages.CompletionItemKind.Text
}
