import type { EditorPluginContext, EditorProject } from '@quajs/editor-core'
import type { AnimationTimeline } from '@quajs/plugin-animation'
import type { AnimationCatalog } from '../src/contracts.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimationEditor } from '../src/editor/controller.js'
import { newTimeline, serializeTimeline } from '../src/model/timeline.js'

const preview = vi.hoisted(() => ({
  show: vi.fn(),
  dispose: vi.fn(async () => {}),
  image: vi.fn(),
}))
vi.mock('../src/preview/isolated.js', () => ({
  AnimationPreview: class {
    show = preview.show
    dispose = preview.dispose
    image = preview.image
  },
}))

describe('animation editing lifecycle', () => {
  let host: HTMLElement
  let panel: AnimationEditor
  let context: EditorPluginContext
  const project = (
    timeline = newTimeline(),
    revision = 'original',
  ): EditorProject => {
    const text = serializeTimeline(timeline)
    return {
      root: '/fixture',
      entries: [],
      plugins: {
        'qua.animation': {
          data: {
            animations: [
              {
                path: 'move.animation.json',
                timeline,
                edit: {
                  root: '/fixture',
                  path: 'move.animation.json',
                  revision,
                  start: 0,
                  end: text.length,
                  expectedText: text,
                },
              },
            ],
            issues: [],
          },
        },
      },
    } as unknown as EditorProject
  }
  const click = (label: string) =>
    [...host.querySelectorAll('button')]
      .find(button => button.textContent === label)!
      .click()
  const change = (label: string, value: string) => {
    const field = host.querySelector<HTMLInputElement>(
      `[aria-label="${label}"]`,
    )!
    field.value = value
    field.dispatchEvent(new Event('change'))
  }
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    window.localStorage.clear()
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    context = {
      openSource: vi.fn(),
      assetUrl: vi.fn(),
      reportError: vi.fn(),
      applyEdit: vi.fn(async () => {}),
    }
    panel = new AnimationEditor(host, context)
    panel.update(project())
    panel.setVisible(true)
  })
  afterEach(() => {
    panel.dispose()
    host.remove()
    vi.unstubAllGlobals()
  })

  it('preserves local edits and focused text on watched updates, applies the original baseline', async () => {
    change('数值', '720')
    const field = host.querySelector<HTMLInputElement>(
      '[aria-label="动画 ID"]',
    )!
    field.focus()
    field.value = 'unfinished'
    panel.update(project(newTimeline('external'), 'external'))
    expect(document.activeElement).toBe(field)
    expect(field.value).toBe('unfinished')
    click('应用到源文件')
    await vi.waitFor(() => expect(context.applyEdit).toHaveBeenCalled())
    expect(context.applyEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 'original',
        newText: expect.stringContaining('720'),
      }),
    )
  })

  it('keeps a second visual edit while saving an applied source draft, then rebases safely', async () => {
    change('数值', '720')
    click('应用到源文件')
    await vi.waitFor(() =>
      expect(host.textContent).toContain('已应用到源码草稿'),
    )
    const applied = JSON.parse(
      vi.mocked(context.applyEdit).mock.calls[0][0].newText,
    ) as AnimationTimeline
    change('数值', '800')
    panel.update(project(applied, 'saved'))
    click('应用到源文件')
    await vi.waitFor(() => expect(context.applyEdit).toHaveBeenCalledTimes(2))
    expect(context.applyEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 'saved',
        newText: expect.stringContaining('800'),
      }),
    )
  })

  it('supports local undo/redo, recovers unapplied edits and disposes hidden previews', () => {
    change('数值', '700')
    click('撤销')
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="数值"]')!.value,
    ).toBe('640')
    click('重做')
    panel.setVisible(false)
    expect(preview.dispose).toHaveBeenCalled()
    panel.dispose()
    panel = new AnimationEditor(host, context)
    panel.update(project())
    panel.setVisible(true)
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="数值"]')!.value,
    ).toBe('700')
    expect(host.textContent).toContain('已恢复本地动画草稿')
  })

  it('retains selected key through value undo and resets values for a new property domain', () => {
    change('播放位置', '500')
    click('+ 关键帧')
    change('数值', '1100')
    click('撤销')
    click('重做')
    expect(host.querySelector<HTMLInputElement>('[aria-label="时间 ms"]')!.value).toBe('500')
    expect(host.querySelector<HTMLInputElement>('[aria-label="数值"]')!.value).toBe('1100')
    click('+ 轨道')
    change('属性', 'opacity')
    expect(host.querySelector<HTMLInputElement>('[aria-label="数值"]')!.value).toBe('1')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="属性"]')!.value).toBe('opacity')
  })

  it('surfaces revision conflicts without discarding the animation', async () => {
    vi.mocked(context.applyEdit).mockRejectedValueOnce(
      new Error('源码版本已变化'),
    )
    change('数值', '720')
    click('应用到源文件')
    await vi.waitFor(() =>
      expect(host.textContent).toContain('源码版本已变化'),
    )
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="数值"]')!.value,
    ).toBe('720')
    expect(
      window.localStorage.getItem('qua-animation-draft:/fixture'),
    ).toContain('720')
  })

  it('follows opened animation files while retaining edits and cancelling stale switch actions', () => {
    const data = project()
    const catalog = data.plugins!['qua.animation'].data as AnimationCatalog
    catalog.animations.push(...['second', 'third'].map(id => ({ ...catalog.animations[0], path: `${id}.animation.json`, timeline: newTimeline(id) })))
    panel.update(data)
    const selected = () => host.querySelector<HTMLSelectElement>('[aria-label="动画文件"]')!.value
    panel.revealSource({ path: 'second.animation.json', line: 1, column: 1 })
    expect(selected()).toBe('second.animation.json')
    change('数值', '900')
    panel.revealSource({ path: 'move.animation.json', line: 1, column: 1 })
    const stale = [...host.querySelectorAll('button')].find(button => button.textContent === '放弃更改并切换')!
    expect(selected()).toBe('second.animation.json')
    panel.revealSource(undefined)
    stale.click()
    expect(selected()).toBe('second.animation.json')
    expect(host.querySelector<HTMLInputElement>('[aria-label="数值"]')!.value).toBe('900')
    panel.revealSource({ path: 'third.animation.json', line: 1, column: 1 })
    panel.update(data)
    click('放弃更改并切换')
    expect(selected()).toBe('third.animation.json')
    expect(host.querySelector<HTMLInputElement>('[aria-label="动画 ID"]')!.value).toBe('third')
  })

  it('defers source following during an apply and uses only the latest requested file', async () => {
    const data = project()
    const catalog = data.plugins!['qua.animation'].data as AnimationCatalog
    catalog.animations.push(...['second', 'third'].map(id => ({ ...catalog.animations[0], path: `${id}.animation.json`, timeline: newTimeline(id) })))
    panel.update(data)
    let finish!: () => void
    vi.mocked(context.applyEdit).mockReturnValueOnce(new Promise(resolve => finish = resolve))
    change('数值', '720')
    click('应用到源文件')
    panel.revealSource({ path: 'second.animation.json', line: 1, column: 1 })
    panel.revealSource({ path: 'third.animation.json', line: 1, column: 1 })
    finish()
    await vi.waitFor(() => expect(host.querySelector<HTMLSelectElement>('[aria-label="动画文件"]')!.value).toBe('third.animation.json'))
    expect(context.applyEdit).toHaveBeenCalledWith(expect.objectContaining({ path: 'move.animation.json', newText: expect.stringContaining('720') }))
  })
})
