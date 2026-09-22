import { registerQuaScriptMonacoLanguage } from '@quajs/language-server/editor'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker'
import { createTokenizationSupport } from 'monaco-editor/esm/vs/language/json/tokenization.js'
import { editorTheme } from '../theme/controller'
import { connectMonacoTheme } from '../theme/monaco'
import { registerContextActions } from './context-actions'
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from './preferences'
import { registerSourceGrammars } from './source-grammars'
import './standalone-services'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-editor/esm/vs/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js'
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js'
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js'

import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
import 'monaco-editor/esm/vs/editor/contrib/parameterHints/browser/parameterHints.js'
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js'
import 'monaco-editor/esm/vs/editor/contrib/smartSelect/browser/smartSelect.js'
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js'
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/browser/caretOperations.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js'

export { monaco }
export function createScriptEditor(container: HTMLElement, services: monaco.editor.IEditorOverrideServices = {}): monaco.editor.IStandaloneCodeEditor {
  Object.assign(globalThis, { MonacoEnvironment: { getWorker: () => new EditorWorker() } })
  // create() must initialize service overrides before language/theme API calls.
  const editor = monaco.editor.create(container, {
    theme: editorTheme.mode === 'dark' ? 'vs-dark' : 'vs',
    model: null,
    automaticLayout: true,
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: 'SFMono-Regular, Consolas, monospace',
    lineHeight: DEFAULT_LINE_HEIGHT,
    contextmenu: true,
    minimap: { enabled: true, maxColumn: 80, renderCharacters: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    padding: { top: 16 },
    tabSize: 2,
    definitionLinkOpensInPeek: false,
    gotoLocation: { multipleDefinitions: 'goto' },
  }, services)
  const peekEditors = monaco.editor.onDidCreateEditor((inner) => {
    // The event fires in the embedded editor's base constructor; wait until its
    // options and the surrounding peek DOM have finished construction.
    queueMicrotask(() => {
      const container = inner.getContainerDomNode()
      if (container.closest('.reference-zone-widget')) {
        // Automatic layout is inherited at construction. Give its observer the
        // split view's dimensions, not the preview content's intrinsic size.
        container.style.width = '100%'
        container.style.height = '100%'
        inner.updateOptions({ readOnly: true, domReadOnly: true })
      }
    })
  })
  editor.onDidDispose(() => peekEditors.dispose())
  registerSourceGrammars(monaco)
  for (const id of ['json', 'jsonc']) {
    monaco.languages.register({ id })
    monaco.languages.setTokensProvider(id, createTokenizationSupport(true))
    monaco.languages.setLanguageConfiguration(id, { brackets: [['{', '}'], ['[', ']']], autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '"', close: '"' }], comments: { lineComment: '//', blockComment: ['/*', '*/'] } })
  }
  registerQuaScriptMonacoLanguage(monaco as unknown as Parameters<typeof registerQuaScriptMonacoLanguage>[0], { registerSnippets: false })
  const disconnectTheme = connectMonacoTheme(monaco)
  editor.onDidDispose(disconnectTheme)
  const palette = editor.addAction({
    id: 'qua.commandPalette',
    label: '命令面板',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP],
    run: target => target.trigger('keyboard', 'editor.action.quickCommand', null),
  })
  editor.onDidDispose(() => palette.dispose())
  registerContextActions(editor)
  return editor
}

export function documentLanguage(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() || ''
  return ({ qs: 'quascript', ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', json: 'json', jsonc: 'jsonc', yaml: 'yaml', yml: 'yaml', md: 'markdown', css: 'css', scss: 'scss', html: 'html', vue: 'html', svelte: 'html', toml: 'ini' } as Record<string, string>)[extension] || 'plaintext'
}
export function canFormat(path: string): boolean {
  return /\.(?:qs|[cm]?[jt]sx?|jsonc?|ya?ml|md|css|scss|html|vue)$/iu.test(path)
}
