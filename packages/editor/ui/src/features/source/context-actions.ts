import type { monaco } from './monaco'

/** Menu entries reuse Monaco commands, including its selection and undo handling. */
export function registerContextActions(editor: monaco.editor.IStandaloneCodeEditor): void {
  const actions = [
    { command: 'editor.action.gotoLine', label: '转到行…', group: 'navigation' },
    { command: 'actions.find', label: '查找', group: '7_find' },
    { command: 'editor.action.startFindReplaceAction', label: '替换', group: '7_find', writable: true },
    { command: 'undo', label: '撤销', group: '8_history', writable: true },
    { command: 'redo', label: '重做', group: '8_history', writable: true },
    { command: 'editor.action.selectAll', label: '全选', group: '9_cutcopypaste' },
  ].map((item, index) => editor.addAction({
    id: `qua.context.${item.command}`,
    label: item.label,
    contextMenuGroupId: item.group,
    contextMenuOrder: 20 + index,
    precondition: item.writable ? '!editorReadonly' : undefined,
    run: (target) => {
      target.focus()
      target.trigger('context-menu', item.command, null)
    },
  }))
  editor.onDidDispose(() => {
    actions.forEach(action => action.dispose())
  })
}
