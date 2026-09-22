// @vitest-environment happy-dom
import type { EditorBridge, EditorTerminalSession } from '@quajs/editor-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalPanel } from '../../ui/src/features/terminal/controller'

vi.mock('@xterm/xterm', () => ({ Terminal: class {
  options = {}
  cols = 80
  rows = 24
  loadAddon() {}
  open() {}
  onData() {}
  attachCustomKeyEventHandler() {}
  focus() {}
  dispose() {}
} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { proposeDimensions() {} } }))

const session = (id: string): EditorTerminalSession => ({ id, root: '/project', shell: 'sh', pid: 123 })
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
function fixture() {
  const host = document.createElement('section')
  document.body.append(host)
  const bridge = {
    onTerminalEvent: vi.fn(),
    focusTerminal: vi.fn().mockResolvedValue(undefined),
    createTerminal: vi.fn().mockResolvedValue(session('one')),
    closeTerminal: vi.fn().mockResolvedValue(undefined),
    acknowledgeTerminal: vi.fn().mockResolvedValue(undefined),
  }
  const error = vi.fn()
  return { host, bridge, error, panel: new TerminalPanel(host, bridge as unknown as EditorBridge, error) }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})
describe('terminal entry lifecycle', () => {
  it('starts once on entry without a project and retains the session on return', async () => {
    const { panel, bridge, host } = fixture()
    expect(bridge.createTerminal).not.toHaveBeenCalled()
    panel.setVisible(true)
    panel.setVisible(true)
    await panel.open()
    await settle()
    expect(bridge.createTerminal).toHaveBeenCalledExactlyOnceWith('', 80, 24)
    panel.setVisible(false)
    panel.setVisible(true)
    await settle()
    expect(bridge.createTerminal).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.terminal-tab')?.getAttribute('aria-selected')).toBe('true')
  })

  it('discards a late session even after switching away and back to the same root', async () => {
    const { panel, bridge, host } = fixture()
    let finish!: (value: EditorTerminalSession) => void
    bridge.createTerminal.mockImplementationOnce(() => new Promise(resolve => finish = resolve))
    panel.setRoot('/a')
    panel.setVisible(true)
    panel.setRoot('/b')
    panel.setRoot('/a')
    finish(session('stale'))
    await settle()
    expect(bridge.closeTerminal).toHaveBeenCalledWith('stale')
    expect(bridge.createTerminal).toHaveBeenCalledTimes(2)
    expect(bridge.createTerminal).toHaveBeenLastCalledWith('/a', 80, 24)
    expect(host.querySelector('[data-session-id="stale"]')).toBeNull()
    expect(host.querySelectorAll('.terminal-tab')).toHaveLength(1)
  })

  it('keeps a failed startup visible without retry loops, then permits explicit retry', async () => {
    const { panel, bridge, host, error } = fixture()
    bridge.createTerminal.mockRejectedValueOnce(new Error('Shell unavailable'))
    panel.setVisible(true)
    await settle()
    expect(bridge.createTerminal).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledOnce()
    const empty = host.querySelector<HTMLElement>('.terminal-empty')!
    expect(empty.hidden).toBe(false)
    expect(empty.textContent).toContain('Shell unavailable')
    expect(empty.querySelector('button')?.textContent).toBe('重试')
    empty.querySelector('button')!.click()
    await settle()
    expect(bridge.createTerminal).toHaveBeenCalledTimes(2)
    expect(empty.hidden).toBe(true)
  })
})
