import { describe, expect, it, vi } from 'vitest'
import { EditorHostPlugins } from '../src/plugins/host.js'

describe('desktop plugin ownership', () => {
  it('activates once, retains ownership on teardown failure and releases on success', async () => {
    const host = new EditorHostPlugins()
    const dispose = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(undefined)
    const instance = { dispose }
    const activate = vi.fn(() => instance)
    const plugin = { id: 'qua.novel-writer', apiVersion: 1 as const, activate }
    expect(host.activate(plugin, {})).toBe(instance)
    expect(host.activate(plugin, {})).toBe(instance)
    expect(activate).toHaveBeenCalledTimes(1)
    await expect(host.dispose()).rejects.toThrow('busy')
    expect(host.activate(plugin, {})).toBe(instance)
    await host.dispose()
    expect(dispose).toHaveBeenCalledTimes(2)
    host.activate(plugin, {})
    expect(activate).toHaveBeenCalledTimes(2)
  })
})
