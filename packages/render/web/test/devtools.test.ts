import type { QuaViewProjection } from '@quajs/render-core'
import { Pipeline } from '@quajs/pipeline'
import { afterEach, expect, it, vi } from 'vitest'
import { mountWebPreviewDevtools } from '../src/devtools'

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
it('picks pointer-transparent artwork, edits literal text and releases input capture', async () => {
  const pipeline = new Pipeline()
  const root = document.createElement('div')
  root.innerHTML = '<div class="qua-background"></div><div class="qua-character" data-character-id="hero"></div><div class="qua-dialogue-box"></div>'
  document.body.append(root)
  const elements = [...root.children]
  for (const [index, element] of elements.entries()) {
    element.setAttribute('style', 'pointer-events:none')
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ x: index * 100, y: 0, left: index * 100, right: (index + 1) * 100, top: 0, bottom: 100, width: 100, height: 100, toJSON() {} })
  }
  const requests: any[] = []
  pipeline.on('editor/preview/inspect', (context) => {
    requests.push(context.event.payload)
  })
  const text = '原始台词 🌧'
  dispose = mountWebPreviewDevtools({ container: root, pipeline, getViewState: () => ({ dialogue: { text } }) as QuaViewProjection })
  await pipeline.emit('editor/preview/dev-state', { picking: true, stepId: 'one' })
  const gameClick = vi.fn()
  root.addEventListener('click', gameClick)
  const click = (x: number) => root.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: 30 }))
  click(150)
  click(50)
  click(250)
  await vi.waitFor(() => expect(requests.map(item => item.kind)).toEqual(['character', 'background', 'dialogue']))
  expect(requests[0].target).toBe('hero')
  expect(gameClick).not.toHaveBeenCalled()
  const input = document.querySelector('textarea')!
  expect(input.value).toBe(text)
  input.value = '<img src=x>新台词'
  document.querySelector<HTMLButtonElement>('[data-action=apply]')!.click()
  await vi.waitFor(() => expect(requests.at(-1)).toMatchObject({ kind: 'dialogue', expectedText: text, text: '<img src=x>新台词', stepId: 'one' }))
  expect(document.querySelector('img')).toBeNull()
  await pipeline.emit('editor/preview/edit-result', { error: true, message: '源码已变化' })
  expect(input.disabled).toBe(false)
  expect(document.querySelector('output')!.textContent).toBe('源码已变化')
  dispose()
  dispose = undefined
  click(150)
  expect(gameClick).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.qua-preview-devtools')).toBeNull()
})
