import { expect, it, vi } from 'vitest'
import { createDocumentsDisk } from '../../ui/src/app/documents/disk.js'

it.each(['saving', 'workspaceBusy'] as const)('keeps the newest project snapshot when an earlier disk read completes during %s', async (busy) => {
  const document = { path: '/project/scene.qs', text: 'old', revision: 'old' }
  const newestDisk = { ...document, text: 'external edit', revision: 'new' }
  const previous = { root: '/project', files: ['scene.qs'] }
  const newest = { ...previous, files: ['scene.qs', 'added.qs'] }
  const firstRead = Promise.withResolvers<typeof document>()
  const readDocument = vi.fn().mockReturnValueOnce(firstRead.promise).mockResolvedValue(newestDisk)
  const model = { setValue: vi.fn() }
  const context = {
    documentModel: document,
    bridge: { readDocument },
    editor: { getModel: () => model, getValue: () => document.text, saveViewState: () => null, layout: vi.fn() },
    element: () => ({}),
    diskDiff: { close: vi.fn() },
    diskReadGeneration: 0,
    project: previous,
    pendingProjectChange: undefined as { project: typeof newest, paths: string[] } | undefined,
    projectRelativePath: () => 'scene.qs',
    updateProject: vi.fn(),
    setDirty: vi.fn(),
    scheduleAnalysis: vi.fn(),
    status: vi.fn(),
    workspaceBusy: false,
    saving: false,
  }
  const disk = createDocumentsDisk(context as unknown as Parameters<typeof createDocumentsDisk>[0])
  const read = disk.checkDiskDocument()
  context[busy] = true
  context.pendingProjectChange = { project: newest, paths: ['added.qs'] }
  disk.flushProjectChange()
  firstRead.resolve(document)
  await read
  expect(context.updateProject).not.toHaveBeenCalled()
  context[busy] = false
  disk.flushProjectChange()
  expect(context.updateProject).toHaveBeenCalledExactlyOnceWith(newest)
  await vi.waitFor(() => expect(model.setValue).toHaveBeenCalledExactlyOnceWith(newestDisk.text))
})
