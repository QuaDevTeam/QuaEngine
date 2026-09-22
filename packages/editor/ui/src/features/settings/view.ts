import type { Category, Setting } from './schema'
import { buttonView, iconButtonView } from '@quajs/editor-controls'
import { html, nothing } from 'lit'
import { live } from 'lit/directives/live.js'
import { repeat } from 'lit/directives/repeat.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { defineElement, EditorElement } from '../../shared/components/element'
import { icon } from '../../shared/icons'
import { categories, defaults, settings } from './schema'
import { shortcuts } from './shortcuts'
import { preferences } from './store'
import './settings.scss'

export class SettingsView extends EditorElement {
  close = () => {}
  resetLayout = () => {}
  private category: Category = 'editor'
  private query = ''
  private modified = false
  private unsubscribe?: () => void

  connectedCallback(): void {
    super.connectedCallback()
    this.unsubscribe ??= preferences.subscribe(() => this.requestUpdate())
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  protected updated(): void {
    for (const setting of settings) {
      const control = this.querySelector<HTMLInputElement>(`input#setting-${setting.key}`)
      if (control?.type === 'number' && control.value === String(preferences.value[setting.key])) {
        control.setCustomValidity('')
        control.removeAttribute('aria-invalid')
      }
    }
  }

  private select(category: Category): void {
    this.category = category
    this.query = ''
    this.modified = false
    this.requestUpdate()
    this.querySelector('.settings-content')?.scrollTo(0, 0)
  }

  protected template() {
    const query = this.query.trim().toLocaleLowerCase()
    const searching = Boolean(query || this.modified)
    const matched = settings.filter(setting =>
      (searching || setting.category === this.category)
      && (!this.modified || preferences.value[setting.key] !== defaults[setting.key])
      && (!query || `${setting.title} ${setting.description} ${setting.key} ${categories.find(category => category.id === setting.category)?.title}`.toLocaleLowerCase().includes(query)))
    const heading = searching ? '搜索结果' : categories.find(category => category.id === this.category)!.title
    return html`
      <header class="settings-heading">
        <h2 id="settings-title">设置</h2>
        <div class="settings-search">
          ${unsafeHTML(icon('search'))}
          <input type="search" aria-label="搜索设置" placeholder="搜索设置…" .value=${live(this.query)} @input=${(event: Event) => {
            this.query = (event.target as HTMLInputElement).value
            this.requestUpdate()
          }}>
        </div>
        ${iconButtonView('关闭设置', html`${unsafeHTML(icon('close'))}`, this.close, { size: 'comfortable' })}
      </header>
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="设置分类">
          ${categories.map(category => html`<button type="button" aria-current=${!searching && this.category === category.id ? 'page' : nothing} @click=${() => this.select(category.id)}>${category.title}</button>`)}
          <button type="button" class="settings-modified" aria-pressed=${String(this.modified)} @click=${() => {
            this.modified = !this.modified
            this.requestUpdate()
          }}>已修改 <span>${settings.filter(setting => preferences.value[setting.key] !== defaults[setting.key]).length}</span></button>
        </nav>
        <main class="settings-content" tabindex="0" aria-label=${heading}>
          <div class="settings-section-heading"><h3>${heading}</h3><span>${searching ? `${matched.length} 项` : categories.find(category => category.id === this.category)!.description}</span></div>
          ${!searching && this.category === 'appearance'
            ? html`
            <figure class="theme-preview" aria-label="主题预览">
              <header><span>${preferences.value.colorTheme === 'qua' ? 'Qua' : '石墨'}</span><span>颜色预览</span></header>
              <div class="theme-preview-workspace" aria-hidden="true">
                <aside><span>资源管理器</span><span class="theme-preview-file">scene.qs</span><span>characters.ts</span></aside>
                <div class="theme-preview-code"><span class="theme-preview-comment">// 故事从这里开始</span><span><b>@Scene</b>(<i>"prologue"</i>)</span><span><em>凛</em>: 新的一天开始了。</span></div>
              </div>
              <figcaption><span>就绪</span><span>QuaScript</span></figcaption>
            </figure>`
            : nothing}
          ${!searching && this.category === 'shortcuts'
            ? html`<dl class="settings-shortcuts">${shortcuts.map(([title, keys]) => html`<div><dt>${title}</dt><dd><kbd>${keys}</kbd></dd></div>`)}</dl>`
            : html`
            <div class="settings-fields">${repeat(matched, setting => setting.key, setting => this.row(setting))}</div>
            ${!matched.length ? html`<qua-empty-state heading="没有匹配的设置" description="试试“字体”“终端”或“预览”。"></qua-empty-state>` : nothing}
          `}
          ${!searching && this.category === 'workspace' ? html`<div class="settings-layout-reset"><div><strong>工作区布局</strong><p>将视图放回默认位置，保留打开的文件和终端。</p></div>${buttonView('重置布局', this.resetLayout)}</div>` : nothing}
        </main>
      </div>
      <footer class="settings-footer"><span role="status">${preferences.persisted ? '保存在本机，修改立即生效' : '本机存储不可用，设置仅在本次运行生效'}</span>${buttonView('恢复默认设置', () => preferences.reset(), { id: 'settings-reset', variant: 'quiet' })}</footer>
    `
  }

  private row(setting: Setting) {
    const value = preferences.value[setting.key]
    const changed = value !== defaults[setting.key]
    const id = `setting-${setting.key}`
    const update = (event: Event) => {
      const control = event.target as HTMLInputElement
      const next = typeof value === 'boolean' ? control.checked : typeof value === 'number' ? control.value.trim() ? Number(control.value) : Number.NaN : control.value
      const valid = preferences.update(setting.key, next)
      control.setCustomValidity(valid ? '' : `请输入 ${setting.min} 到 ${setting.max} 之间的有效值。`)
      control.setAttribute('aria-invalid', String(!valid))
      if (!valid)
        control.reportValidity()
    }
    return html`<div class="settings-row" data-modified=${String(changed)}>
      <div class="settings-row-copy"><label for=${id}>${setting.title}${changed ? html`<span class="settings-changed-mark" title="已修改" aria-label="已修改"></span>` : nothing}</label><p id=${`${id}-description`}>${setting.description}</p></div>
      <div class="settings-row-control">
        ${typeof value === 'boolean'
          ? html`<input class="editor-switch" type="checkbox" role="switch" id=${id} aria-label=${setting.title} aria-describedby=${`${id}-description`} .checked=${live(value)} @change=${update}>`
          : setting.options
            ? html`<select id=${id} aria-label=${setting.title} aria-describedby=${`${id}-description`} @change=${update}>${setting.options.map(([key, title]) => html`<option value=${String(key)} .selected=${key === value}>${title}</option>`)}</select>`
            : html`<div class="editor-input-unit"><input type="number" id=${id} aria-label=${setting.title} aria-describedby=${`${id}-description`} min=${setting.min!} max=${setting.max!} step=${setting.step!} .value=${live(String(value))} @change=${update}><span class="editor-unit" aria-hidden="true">${setting.unit}</span></div>`}
        ${iconButtonView(`恢复${setting.title}的默认值`, html`${unsafeHTML(icon('refresh'))}`, () => preferences.reset(setting.key), { className: 'settings-item-reset', disabled: !changed })}
      </div>
    </div>`
  }
}
defineElement('qua-settings', SettingsView)
