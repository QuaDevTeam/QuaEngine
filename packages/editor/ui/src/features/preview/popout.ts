import type { PreviewState } from '@quajs/editor-core'
import { buttonView } from '@quajs/editor-controls'
import { html, render } from 'lit'
import { setIconButton } from '../../shared/icons'
import { NativeSurfacePreview } from './native-surface'
import '../theme/controller'
import '@quajs/editor-controls/styles.scss'
import './popout.scss'

render(html`<header>
      <span>QUA / 预览</span><button type="button" class="icon-button" id="mute" aria-label="静音预览" aria-pressed="false"></button>
      ${buttonView('刷新', undefined, { id: 'reload' })}${buttonView('全屏', undefined, { id: 'fullscreen' })}${buttonView('返回编辑器', undefined, { id: 'dock' })}
    </header>
    <main id="preview">
      <div id="native-surface" hidden></div>
      <div id="preview-overlay">
        <h2 id="preview-label">正在连接…</h2>
        <progress id="preview-progress" aria-label="Native 构建进行中" hidden></progress>
        <pre id="preview-error"></pre>
        ${buttonView('刷新预览', undefined, { id: 'retry' })}
      </div>
    </main>`, document.getElementById('app')!)

const bridge = window.quaEditor
const element = (id: string): HTMLElement => document.getElementById(id)!
const native = new NativeSurfacePreview(element('native-surface'), bridge, (error) => {
  element('preview-error').textContent = error
})
let muted = false
function update(state: PreviewState): void {
  muted = Boolean(state.muted)
  setIconButton(element('mute') as HTMLButtonElement, muted ? 'muted' : 'volume', muted ? '取消预览静音' : '静音预览')
  element('mute').setAttribute('aria-pressed', String(muted))
  native.suspended = Boolean(state.reloading || state.renderError)
  native.setState(state)
  element('preview-overlay').hidden = state.phase === 'running' && !state.reloading && !state.renderError
  element('preview-label').textContent = state.renderError || state.error ? '渲染失败' : state.reloading ? '正在更新预览…' : state.phase === 'starting' ? '正在构建并启动…' : '预览未运行'
  const building = state.phase === 'starting' && state.identity?.target === 'native' && !state.error
  element('preview-progress').hidden = !building
  if (building)
    element('preview-label').textContent = state.progress?.label || '准备 Native 构建…'
  element('preview-error').textContent = state.renderError || state.error || (building ? state.progress?.detail || '' : '')
}
function failed(error: unknown): void {
  element('preview-error').textContent = String(error)
  element('preview-overlay').hidden = false
}
element('reload').onclick = element('retry').onclick = () => void bridge.reloadPreview().catch(failed)
element('mute').onclick = () => void bridge.setPreviewMuted(!muted).catch(failed)
element('dock').onclick = () => void bridge.presentPreview('embedded').catch(failed)
element('fullscreen').onclick = () => void bridge.presentPreview('fullscreen').catch(failed)
// Keep Escape available when focus belongs to the popout's DOM input surface
// (native content is a separate AppKit sibling, not a WebContentsView).
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    void bridge.presentPreview('window').catch(failed)
  }
})
bridge.onPreviewState(update)
void bridge.previewState().then(update).catch(failed)
