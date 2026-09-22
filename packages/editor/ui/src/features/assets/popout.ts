import { iconButtonView } from '@quajs/editor-controls'
import { html, render } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from '../../shared/icons'
import '../theme/controller'
import '@quajs/editor-controls/styles.scss'
import './popout.scss'

declare global {
  interface Window {
    quaAssetPreview?: { close: () => Promise<void> }
  }
}

render(html`<header class="asset-titlebar">
      <span id="asset-title" class="asset-title">素材预览</span>
      ${iconButtonView('关闭素材预览', html`${unsafeHTML(icon('close'))}`, undefined, { id: 'asset-close' })}
    </header>
    <main id="asset-stage"><div id="asset-empty" hidden>无法加载素材</div></main>`, document.getElementById('app')!)

const query = new URLSearchParams(location.search)
const source = query.get('src') || ''
const name = query.get('name') || '素材预览'
const kind = query.get('kind') || 'image'
const title = document.querySelector<HTMLElement>('#asset-title')!
const stage = document.querySelector<HTMLElement>('#asset-stage')!
const empty = document.querySelector<HTMLElement>('#asset-empty')!
title.textContent = name
document.title = `${name} — 素材预览`

function failed() {
  empty.hidden = false
  empty.textContent = '素材无法加载或格式不受支持'
  render(empty, stage)
}
empty.remove()
render(source && ['image', 'audio', 'video'].includes(kind)
  ? kind === 'image'
    ? html`<img class="asset-preview-media" alt=${name} src=${source} @error=${failed}>`
    : kind === 'audio'
      ? html`<audio class="asset-preview-media" controls preload="metadata" src=${source} @error=${failed}></audio>`
      : html`<video class="asset-preview-media" controls preload="metadata" src=${source} @error=${failed}></video>`
  : empty, stage)
if (!source || !['image', 'audio', 'video'].includes(kind))
  empty.hidden = false

document.querySelector<HTMLButtonElement>('#asset-close')!.onclick = () => void window.quaAssetPreview?.close()
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape')
    void window.quaAssetPreview?.close()
})
