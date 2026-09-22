import type { EditorBridge, EditorWindowAction, EditorWindowState } from '@quajs/editor-core'
import { element } from '@quajs/editor-controls'
import { html, render as renderTemplate } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

const glyphs = {
  menu: '<path d="M3 4h10M3 8h10M3 12h10"/>',
  minimize: '<path d="M3 8h10"/>',
  maximize: '<rect x="3.5" y="3.5" width="9" height="9"/>',
  restore: '<path d="M6 3.5h6.5V10M3.5 6H10v6.5H3.5z"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  fullscreen: '<path d="M3 7V3h4M9 13h4V9M3 3l4 4m6 6-4-4"/>',
  exitFullscreen: '<path d="M7 3v4H3m10 2H9v4M7 7 3 3m6 6 4 4"/>',
}
const svg = (name: keyof typeof glyphs): string => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${glyphs[name]}</svg>`

export function connectTitlebar(host: HTMLElement, bridge: EditorBridge, error: (error: unknown) => void): void {
  const menu = element<HTMLButtonElement>(html`<button type="button"></button>`)
  menu.id = 'window-menu'
  menu.className = 'window-menu'
  renderTemplate(unsafeHTML(svg('menu')), menu)
  menu.title = '应用菜单（Alt M）'
  menu.setAttribute('aria-label', '应用菜单')
  menu.setAttribute('aria-haspopup', 'menu')
  menu.setAttribute('aria-expanded', 'false')
  menu.hidden = true
  host.prepend(menu)
  const controls = element(html`<div></div>`)
  controls.className = 'window-controls'
  controls.setAttribute('role', 'group')
  controls.setAttribute('aria-label', '窗口控制')
  controls.hidden = true
  host.append(controls)
  let state: EditorWindowState | undefined
  const perform = (action: EditorWindowAction): void => {
    void bridge.windowAction(action).catch(error)
  }
  menu.onclick = () => {
    if (menu.getAttribute('aria-expanded') === 'true')
      return
    const bounds = menu.getBoundingClientRect()
    menu.setAttribute('aria-expanded', 'true')
    void bridge.windowAction('menu', { x: bounds.left, y: bounds.bottom + 4 }).catch(error).finally(() => {
      menu.setAttribute('aria-expanded', 'false')
    })
  }
  const buttons = new Map<string, HTMLButtonElement>()
  for (const name of ['minimize', 'maximize', 'close'] as const) {
    const button = element<HTMLButtonElement>(html`<button type="button"></button>`)
    button.id = `window-${name}`
    button.className = 'window-control'
    renderTemplate(unsafeHTML(svg(name)), button)
    button.onclick = () => perform(name === 'maximize' && state?.platform === 'macos' ? 'fullscreen' : name)
    buttons.set(name, button)
  }
  host.addEventListener('dblclick', (event) => {
    if (event.target instanceof Element && !event.target.closest('button'))
      perform('maximize')
  })
  function render(next: EditorWindowState): void {
    if (state?.platform !== next.platform) {
      const order = next.platform === 'macos' ? ['close', 'minimize', 'maximize'] : ['minimize', 'maximize', 'close']
      renderTemplate(html`${order.map(name => buttons.get(name)!)}`, controls)
    }
    state = next
    host.dataset.platform = next.platform
    host.classList.toggle('inactive', !next.focused)
    host.classList.toggle('fullscreen', next.fullscreen)
    controls.hidden = false
    menu.hidden = false
    menu.title = next.platform === 'macos' ? '应用菜单' : '应用菜单（Alt M）'
    const zoomLabel = next.fullscreen ? '退出全屏' : next.platform === 'macos' ? '进入全屏' : next.maximized ? '还原窗口' : '最大化'
    for (const [name, label] of [['minimize', '最小化'], ['maximize', zoomLabel], ['close', '关闭窗口']]) {
      const button = buttons.get(name)!
      button.title = label
      button.setAttribute('aria-label', label)
    }
    renderTemplate(unsafeHTML(svg(next.fullscreen ? 'exitFullscreen' : next.platform === 'macos' ? 'fullscreen' : next.maximized ? 'restore' : 'maximize')), buttons.get('maximize')!)
    buttons.get('minimize')!.disabled = next.fullscreen
  }
  bridge.onWindowState(render)
  // A host event may arrive before the initial request resolves.
  void bridge.windowState().then((initial) => {
    if (!state)
      render(initial)
  }).catch(error)
}
