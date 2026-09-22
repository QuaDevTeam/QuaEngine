import type { monaco } from '../../ui/src/features/source/monaco.js'
import { expect, it, vi } from 'vitest'
import { createPreviewController } from '../../ui/src/app/preview/controller.js'
import { registerPreviewAction } from '../../ui/src/features/source/preview-action.js'

it('runs the right-clicked row inside a selection and drops stale targets on keyboard/model changes', async () => {
  const listeners: Record<string, (event?: unknown) => void> = {}
  const dispose = vi.fn()
  const on = (name: string) => (fn: (event?: unknown) => void) => {
    listeners[name] = fn
    return { dispose }
  }
  let action: monaco.editor.IActionDescriptor
  const model = { getLanguageId: () => 'quascript' }
  const editor = {
    onMouseDown: on('mouse'),
    onKeyDown: on('key'),
    onDidChangeModel: on('model'),
    onContextMenu: on('context'),
    onDidDispose: on('dispose'),
    getModel: () => model,
    getPosition: () => ({ lineNumber: 3 }),
    addAction: (value: monaco.editor.IActionDescriptor) => {
      action = value
      return { dispose }
    },
  } as unknown as monaco.editor.IStandaloneCodeEditor
  const seek = vi.fn(async () => {})
  registerPreviewAction(editor, seek)
  listeners.context({ target: { position: { lineNumber: 12 } } })
  await action!.run(editor)
  expect(seek).toHaveBeenLastCalledWith(12)
  listeners.context({ target: { position: { lineNumber: 9 } } })
  listeners.key()
  await action!.run(editor)
  expect(seek).toHaveBeenLastCalledWith(3)
  expect(action!.precondition).toContain('quascript')
  listeners.dispose()
  expect(dispose).toHaveBeenCalledTimes(5)
})

function fixture() {
  const model = { getValue: () => 'story', getVersionId: () => 1, getLineCount: () => 50, isDisposed: () => false }
  const context = {
    project: { root: '/project' },
    documentModel: { path: '/project/story.qs' },
    editor: { getModel: () => model, getPosition: () => ({ lineNumber: 4 }) },
    tabs: [],
    previewState: { phase: 'idle', identity: undefined as unknown },
    previewCommandBusy: false,
    element: () => ({ value: 'web', disabled: false }),
    projectRelativePath: () => 'story.qs',
    status: vi.fn(),
    saveAll: vi.fn(async () => {}),
    bridge: {
      analyzeDocument: vi.fn(async () => ({ diagnostics: [], previewSteps: [{ index: 0, line: 2, endLine: 4 }, { index: 8, line: 10, endLine: 12 }] })),
      startPreview: vi.fn(async () => { context.previewState = { phase: 'running', identity: { sessionId: 'new' } } }),
      previewCommand: vi.fn(async () => ({ message: 'ok' })),
    },
  }
  return { context, model, controller: createPreviewController(context as unknown as Parameters<typeof createPreviewController>[0]) }
}

it('captures the requested line before saving and starts/seeks once through the existing preview lifecycle', async () => {
  const { context, controller } = fixture()
  context.saveAll.mockImplementation(async () => {
    context.editor.getPosition = () => ({ lineNumber: 40 })
  })
  await Promise.all([controller.seekPreview(11), controller.seekPreview(2)])
  expect(context.bridge.startPreview).toHaveBeenCalledTimes(1)
  expect(context.bridge.previewCommand).toHaveBeenCalledExactlyOnceWith('new', { action: 'seek', path: 'story.qs', stepIndex: 8 })
})

it('does not start or seek after the document changes while analysis is pending', async () => {
  const { context, model, controller } = fixture()
  context.bridge.analyzeDocument.mockImplementation(async () => {
    model.getVersionId = () => 2
    return { diagnostics: [], previewSteps: [{ index: 0, line: 2, endLine: 4 }] }
  })
  await controller.seekPreview(3)
  expect(context.bridge.startPreview).not.toHaveBeenCalled()
  expect(context.bridge.previewCommand).not.toHaveBeenCalled()
})
