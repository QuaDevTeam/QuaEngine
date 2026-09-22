import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection } from '@quajs/render-core'
import type { WebAudioPlaybackEntry } from './audio-playback'

export interface WebPreviewDevtoolsOptions {
  container: HTMLElement
  pipeline: Pipeline
  getViewState: () => Readonly<QuaViewProjection>
  getAudioPlayback?: () => readonly WebAudioPlaybackEntry[]
}

/** Optional authoring surface. Import dynamically inside an import.meta.env.DEV guard. */
export function mountWebPreviewDevtools(options: WebPreviewDevtoolsOptions): () => void {
  const { container, pipeline } = options
  const doc = container.ownerDocument
  const win = doc.defaultView!
  const overlay = doc.createElement('div')
  overlay.className = 'qua-preview-devtools'
  overlay.innerHTML = '<style>.qua-preview-devtools{position:fixed;inset:0;z-index:2147483646;pointer-events:none;font:12px system-ui;color:#e8ecf2}.qua-preview-devtools [hidden]{display:none!important}.qua-preview-devtools output{position:absolute;top:10px;left:10px;padding:6px 10px;border:1px solid #6689b4;border-radius:4px;background:#18222eeb;max-width:80vw}.qua-preview-devtools .pick-outline{position:fixed;border:2px solid #81b1e8;box-sizing:border-box}.qua-preview-devtools .inline-dialogue{position:fixed;pointer-events:auto;display:flex;flex-direction:column;gap:6px;padding:8px;background:#18222ef5;border:1px solid #81b1e8;border-radius:4px;box-sizing:border-box}.qua-preview-devtools textarea{width:100%;min-height:64px;box-sizing:border-box;resize:vertical;background:#111923;color:#f1f4f8;border:1px solid #60758e;padding:8px;font:16px/1.5 system-ui}.qua-preview-devtools footer{display:flex;justify-content:flex-end;gap:6px}.qua-preview-devtools button{padding:4px 10px;background:#293d56;color:inherit;border:1px solid #60758e;border-radius:3px;cursor:pointer}</style><output hidden role="status"></output><div class="pick-outline" hidden></div><div class="inline-dialogue" hidden><textarea aria-label="编辑预览台词" maxlength="10000"></textarea><footer><button data-action="cancel">取消</button><button data-action="apply">写入 QS · Enter</button></footer></div>'
  doc.body.append(overlay)
  const status = overlay.querySelector('output')!
  const outline = overlay.querySelector<HTMLElement>('.pick-outline')!
  const form = overlay.querySelector<HTMLElement>('.inline-dialogue')!
  const input = overlay.querySelector('textarea')!
  let picking = false
  let stepId = ''
  let editing: { stepId: string, expectedText: string, element: Element } | undefined
  let pending = false
  const emit = (event: string, payload: unknown) => {
    void pipeline.emit(event, payload).catch((error: unknown) => {
      status.hidden = false
      status.textContent = error instanceof Error ? error.message : String(error)
    })
  }
  const close = () => {
    editing = undefined
    pending = false
    form.hidden = true
  }
  const place = (element: Element, box: HTMLElement, editor = false) => {
    const rect = element.getBoundingClientRect()
    box.style.left = `${Math.max(0, Math.min(rect.left, win.innerWidth - (editor ? 280 : 0)))}px`
    box.style.top = `${Math.max(0, Math.min(rect.top, win.innerHeight - (editor ? 160 : 0)))}px`
    box.style.width = `${Math.min(win.innerWidth, Math.max(editor ? 280 : 0, rect.width))}px`
    if (!editor)
      box.style.height = `${rect.height}px`
  }
  const targetAt = (event: MouseEvent): Element | null => {
    if (!(event.target instanceof win.Node) || !container.contains(event.target))
      return null
    // Artwork commonly has pointer-events:none. Pick its rendered client bounds,
    // independently of game hit targets and without changing authored coordinates.
    for (const selector of ['.qua-dialogue-box', '[data-character-id]', '.qua-background, .qua-background-layer-item']) {
      const candidates = [...container.querySelectorAll(selector)].reverse()
      for (const element of candidates) {
        if (element.getAttribute('data-character-visible') === 'false' || element.closest('[hidden]'))
          continue
        const style = win.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        if (style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0' && rect.width > 0 && rect.height > 0 && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom)
          return element
      }
    }
    return null
  }
  const classify = (element: Element) => element.matches('.qua-dialogue-box') ? { kind: 'dialogue' } : element.hasAttribute('data-character-id') ? { kind: 'character', target: element.getAttribute('data-character-id')! } : { kind: 'background' }
  const move = (event: PointerEvent) => {
    if (!picking || editing)
      return
    const target = targetAt(event)
    outline.hidden = !target
    if (target)
      place(target, outline)
  }
  const click = (event: MouseEvent) => {
    if (!picking || !(event.target instanceof win.Node) || !container.contains(event.target))
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    const target = targetAt(event)
    if (!target)
      return
    const selection = classify(target)
    emit('editor/preview/inspect', selection)
    if (selection.kind === 'dialogue') {
      const text = options.getViewState().dialogue.text
      if (typeof text !== 'string') {
        status.textContent = '富文本请在 QS 属性中编辑。'
        return
      }
      editing = { stepId, expectedText: text, element: target }
      input.value = text
      input.disabled = false
      pending = false
      form.hidden = false
      outline.hidden = true
      place(target, form, true)
      input.focus()
      input.select()
    }
  }
  const apply = () => {
    if (!editing || pending)
      return
    pending = true
    input.disabled = true
    status.textContent = '正在写入 QS…'
    emit('editor/preview/inspect', { kind: 'dialogue', stepId: editing.stepId, expectedText: editing.expectedText, text: input.value })
  }
  overlay.querySelector<HTMLButtonElement>('[data-action=apply]')!.onclick = apply
  overlay.querySelector<HTMLButtonElement>('[data-action=cancel]')!.onclick = close
  // Prevent game input handlers from seeing authoring gestures, including keys.
  const key = (event: KeyboardEvent) => {
    if (!picking)
      return
    if (event.isComposing)
      return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (editing)
        close()
      else emit('editor/preview/pick-request', { enabled: false })
      return
    }
    if (editing && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.stopImmediatePropagation()
      apply()
      return
    }
    if (!editing) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  const isolate = (event: Event) => event.stopPropagation()
  for (const event of ['keydown', 'keyup', 'click', 'pointerdown', 'pointerup']) form.addEventListener(event, isolate)
  const listen = (event: string, callback: (payload: any) => void | Promise<void>) => {
    const listener = (context: { event: { payload: unknown } }) => callback(context.event.payload)
    pipeline.on(event, listener)
    return () => pipeline.off(event, listener)
  }
  const disposers = [
    listen('editor/preview/dev-state', (state) => {
      picking = state.picking === true
      stepId = state.stepId
      status.hidden = !picking
      status.textContent = '属性拾取 · 点击对白编辑，点击角色 / 背景定位 · Esc 退出'
      if (!picking || (editing && editing.stepId !== stepId))
        close()
      if (!picking)
        outline.hidden = true
    }),
    listen('editor/preview/edit-result', (result) => {
      status.hidden = false
      status.textContent = result.message
      if (pending) {
        if (!result.error) {
          close()
        }
        else {
          pending = false
          input.disabled = false
          input.focus()
        }
      }
    }),
    listen('editor/preview/sample', async () => {
      await pipeline.emit('editor/preview/audio-sample', { tracks: options.getAudioPlayback?.() || [] })
    }),
  ]
  const blockPointer = (event: Event) => {
    if (picking && event.target instanceof win.Node && container.contains(event.target)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  const blockedEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'contextmenu', 'wheel'] as const
  for (const name of blockedEvents) win.addEventListener(name, blockPointer, { capture: true, passive: false })
  win.addEventListener('click', click, true)
  win.addEventListener('pointermove', move, true)
  win.addEventListener('keydown', key, true)
  const resize = () => {
    if (editing)
      place(editing.element, form, true)
  }
  win.addEventListener('resize', resize)
  emit('editor/preview/renderer-ready', {})
  return () => {
    disposers.forEach(dispose => dispose())
    for (const name of blockedEvents) win.removeEventListener(name, blockPointer, true)
    win.removeEventListener('click', click, true)
    win.removeEventListener('pointermove', move, true)
    win.removeEventListener('keydown', key, true)
    win.removeEventListener('resize', resize)
    overlay.remove()
  }
}
