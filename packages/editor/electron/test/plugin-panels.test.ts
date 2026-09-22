// @vitest-environment happy-dom
import type {
  EditorPluginContext,
  EditorPluginPanel,
  EditorProject,
} from '@quajs/editor-core'
import { describe, expect, it, vi } from 'vitest'
import { PluginPanels } from '../../ui/src/workbench/plugins/panels'
import { ContextStatus } from '../../ui/src/workbench/status'

const project = (root: string) => ({ root }) as EditorProject
function instance(): EditorPluginPanel {
  return {
    update: vi.fn(),
    setVisible: vi.fn(),
    revealSource: vi.fn(),
    dispose: vi.fn(),
  }
}
const context: EditorPluginContext = {
  openSource: vi.fn(),
  applyEdit: vi.fn(),
  assetUrl: vi.fn(),
  reportError: vi.fn(),
}
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

describe('contributed workbench panels', () => {
  it('keeps split panels mounted and visible independently', async () => {
    const first = instance()
    const second = instance()
    const panels = new PluginPanels([{
      id: 'split',
      apiVersion: 1,
      panels: [
        { id: 'first', title: 'First', mount: () => first },
        { id: 'second', title: 'Second', mount: () => second },
      ],
    }], document.createElement('div'), document.createElement('div'), context, vi.fn())
    panels.update(project('a'))
    panels.show(new Set(['plugin-split-first', 'plugin-split-second']))
    await settle()
    expect(first.setVisible).toHaveBeenLastCalledWith(true)
    expect(second.setVisible).toHaveBeenLastCalledWith(true)
    const calls = vi.mocked(second.setVisible).mock.calls.length
    panels.show(new Set(['plugin-split-second']))
    expect(first.setVisible).toHaveBeenLastCalledWith(false)
    expect(second.setVisible).toHaveBeenCalledTimes(calls)
    expect(first.dispose).not.toHaveBeenCalled()
    panels.dispose()
  })

  it('follows the latest source across lazy mounts and cancels unrelated or old-project requests', async () => {
    let finish!: (panel: EditorPluginPanel) => void
    const mounted = instance()
    let panels: PluginPanels
    const select = vi.fn((key: string) => panels.show(new Set([key])))
    panels = new PluginPanels([{
      id: 'test',
      apiVersion: 1,
      panels: [{ id: 'browser', title: 'Source', acceptsSource: (_project, source) => source.path.endsWith('.json'), mount: () => new Promise(resolve => finish = resolve) }],
    }], document.createElement('div'), document.createElement('div'), context, select)
    panels.update(project('a'))
    const first = { path: 'first.json', line: 1, column: 1 }
    const second = { path: 'second.json', line: 4, column: 2 }
    panels.documentOpened(first)
    await settle()
    panels.documentOpened(second)
    finish(mounted)
    await settle()
    expect(mounted.revealSource).toHaveBeenLastCalledWith(second)
    expect(mounted.revealSource).not.toHaveBeenCalledWith(first)
    select.mockClear()
    panels.show(new Set(['console']))
    panels.update(project('a'))
    expect(select).not.toHaveBeenCalled()
    panels.documentOpened({ path: 'notes.md', line: 1, column: 1 })
    expect(mounted.revealSource).toHaveBeenLastCalledWith(undefined)
    expect(select).not.toHaveBeenCalled()
    panels.documentOpened(second)
    panels.update(project('b'))
    await settle()
    const replacement = instance()
    finish(replacement)
    await settle()
    expect(replacement.revealSource).toHaveBeenLastCalledWith(undefined)
    panels.dispose()
  })

  it('routes a newly indexed open file once without stealing the panel on later refreshes', async () => {
    const mounted = instance()
    let panels: PluginPanels
    const select = vi.fn((key: string) => panels.show(new Set([key])))
    panels = new PluginPanels([{
      id: 'test',
      apiVersion: 1,
      panels: [{ id: 'browser', title: 'Source', acceptsSource: project => Boolean(project.plugins?.test), mount: () => mounted }],
    }], document.createElement('div'), document.createElement('div'), context, select)
    panels.update(project('a'))
    const source = { path: 'new.json', line: 1, column: 1 }
    panels.documentOpened(source)
    expect(select).not.toHaveBeenCalled()
    panels.update({ ...project('a'), plugins: { test: { data: {} } } })
    await settle()
    expect(mounted.revealSource).toHaveBeenLastCalledWith(source)
    expect(select).toHaveBeenCalledOnce()
    panels.show(new Set(['console']))
    panels.update({ ...project('a'), plugins: { test: { data: {} } } })
    expect(select).toHaveBeenCalledOnce()
    panels.dispose()
  })
  it('mounts lazily, updates/hides and disposes across project replacement', async () => {
    const first = instance()
    const second = instance()
    const mount = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const tabs = document.createElement('div')
    const content = document.createElement('div')
    const panels = new PluginPanels(
      [
        {
          id: 'test',
          apiVersion: 1,
          panels: [{ id: 'browser', title: 'Test', mount }],
        },
      ],
      tabs,
      content,
      context,
      vi.fn(),
    )
    panels.update(project('a'))
    expect(mount).not.toHaveBeenCalled()
    panels.show(new Set(['plugin-test-browser']))
    await settle()
    expect(first.update).toHaveBeenCalledWith(project('a'))
    expect(first.setVisible).toHaveBeenLastCalledWith(true)
    panels.show(new Set(['']))
    expect(first.setVisible).toHaveBeenLastCalledWith(false)
    panels.show(new Set(['plugin-test-browser']))
    panels.update(project('b'))
    await settle()
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(second.update).toHaveBeenCalledWith(project('b'))
    panels.dispose()
    expect(second.dispose).toHaveBeenCalledOnce()
    expect(content.children).toHaveLength(0)
  })
  it('rejects late mounts from old projects and isolates plugin exceptions', async () => {
    let finish!: (panel: EditorPluginPanel) => void
    const old = instance()
    const current = instance()
    const mount = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise(resolve => (finish = resolve)),
      )
      .mockReturnValueOnce(current)
    const tabs = document.createElement('div')
    const content = document.createElement('div')
    const panels = new PluginPanels(
      [
        {
          id: 'test',
          apiVersion: 1,
          panels: [
            { id: 'browser', title: 'Test', mount },
            {
              id: 'broken',
              title: 'Broken',
              mount: () => {
                throw new Error('boom')
              },
            },
          ],
        },
      ],
      tabs,
      content,
      context,
      vi.fn(),
    )
    panels.update(project('a'))
    panels.show(new Set(['plugin-test-browser']))
    await settle()
    panels.update(project('b'))
    await settle()
    finish(old)
    await settle()
    expect(old.dispose).toHaveBeenCalledOnce()
    expect(old.update).not.toHaveBeenCalled()
    expect(current.setVisible).toHaveBeenLastCalledWith(true)
    panels.show(new Set(['plugin-test-broken']))
    await settle()
    expect(content.textContent).toContain('boom')
    panels.show(new Set(['plugin-test-browser']))
    expect(current.setVisible).toHaveBeenLastCalledWith(true)
    panels.dispose()
  })
  it('keeps footer feedback scoped to visible panels and rejects disposed mount callbacks', async () => {
    const footer = document.createElement('footer')
    const statuses = new ContextStatus(footer)
    const contexts: EditorPluginContext[] = []
    let finish!: (panel: EditorPluginPanel) => void
    const panels = new PluginPanels([{
      id: 'test',
      apiVersion: 1,
      panels: [{ id: 'browser', title: 'Test', mount: (_host, context) => {
        contexts.push(context)
        const message = document.createElement('span')
        message.textContent = `Project ${contexts.length}`
        context.mountStatus?.(message)
        return contexts.length === 1 ? new Promise(resolve => finish = resolve) : instance()
      } }],
    }], document.createElement('div'), document.createElement('div'), context, vi.fn(), (key, message) => statuses.mount(key, message))
    panels.update(project('a'))
    panels.show(new Set(['plugin-test-browser']))
    statuses.show(['plugin-test-browser'])
    await settle()
    expect(footer.textContent).toBe('Project 1')
    statuses.show([])
    expect((footer.firstElementChild as HTMLElement).hidden).toBe(true)
    panels.update(project('b'))
    await settle()
    const late = document.createElement('span')
    late.textContent = 'Stale warning'
    contexts[0].mountStatus?.(late)
    finish(instance())
    await settle()
    expect(footer.textContent).toBe('Project 2')
    statuses.show(['plugin-test-browser'])
    expect((footer.firstElementChild as HTMLElement).hidden).toBe(false)
    panels.dispose()
    contexts[1].mountStatus?.(late)
    expect(footer.children).toHaveLength(0)
  })
})
