import type { IconName } from '../../shared/icons'
import { buttonView, html, live, nothing, repeat } from '@quajs/editor-controls'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { defineElement, EditorElement } from '../../shared/components/element'
import { workbenchEmpty } from '../../shared/empty-state'
import { icon } from '../../shared/icons'
import './view-picker.scss'

export interface ViewPickerEntry {
  id: string
  title: string
  state: 'visible' | 'open' | 'closed' | 'unavailable'
}

const categories = [
  { id: 'authoring', title: '编辑与创作' },
  { id: 'preview', title: '预览与调试' },
  { id: 'resources', title: '资源与扩展' },
  { id: 'tools', title: '开发工具' },
] as const
type Category = typeof categories[number]['id']
const presentation: Record<string, { category: Category, icon: IconName, unavailable?: string }> = {
  'source': { category: 'authoring', icon: 'code' },
  'writer': { category: 'authoring', icon: 'writer' },
  'properties': { category: 'authoring', icon: 'list' },
  'plugin-qua.character-characters': { category: 'authoring', icon: 'character' },
  'plugin-qua.animation-animation': { category: 'authoring', icon: 'keyframes' },
  'preview': { category: 'preview', icon: 'play', unavailable: '仅游戏项目可用' },
  'scene-debugger': { category: 'preview', icon: 'story' },
  'inspector': { category: 'preview', icon: 'locate', unavailable: '需运行预览' },
  'storage': { category: 'preview', icon: 'package', unavailable: '需运行预览' },
  'performance': { category: 'preview', icon: 'pulse' },
  'assets': { category: 'resources', icon: 'folderOpen' },
  'extensions': { category: 'resources', icon: 'extensions' },
  'problems': { category: 'tools', icon: 'warning' },
  'console': { category: 'tools', icon: 'code' },
  'terminal': { category: 'tools', icon: 'terminal' },
}
const fallback = { category: 'resources', icon: 'extensions' } as const

/** Transient view discovery only; the dock model remains the layout authority. */
export class ViewPicker extends EditorElement {
  openView = (_id: string) => {}
  close = () => {}
  resetLayout = () => {}
  private entries: readonly ViewPickerEntry[] = []
  private query = ''
  private readonly empty = workbenchEmpty('search', '没有匹配的视图', '试试其他名称，或清空搜索。').element

  setEntries(entries: readonly ViewPickerEntry[], resetSearch = false): void {
    this.entries = entries
    if (resetSearch)
      this.query = ''
    this.requestUpdate()
  }

  focusSearch(): void {
    this.querySelector<HTMLInputElement>('input')?.focus()
  }

  private search(value: string): void {
    this.query = value
    this.requestUpdate()
    this.querySelector('.view-picker-content')?.scrollTo(0, 0)
  }

  private navigate(event: KeyboardEvent): void {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return
    const target = event.target as HTMLElement
    const inSearch = target.matches('input')
    if (!inSearch && !target.matches('.view-picker-item'))
      return
    const buttons = [...this.querySelectorAll<HTMLButtonElement>('.view-picker-item:not(:disabled)')]
    const index = buttons.indexOf(target as HTMLButtonElement)
    let next: HTMLButtonElement | undefined
    if (event.key === 'ArrowDown') {
      next = buttons[(index + 1) % buttons.length]
    }
    else if (event.key === 'ArrowUp') {
      next = buttons[index <= 0 ? buttons.length - 1 : index - 1]
    }
    else if (!inSearch && event.key === 'Home') {
      next = buttons[0]
    }
    else if (!inSearch && event.key === 'End') {
      next = buttons.at(-1)
    }
    else if (inSearch && event.key === 'Enter' && buttons.length) {
      event.preventDefault()
      buttons[0].click()
      return
    }
    if (next) {
      event.preventDefault()
      next.focus()
    }
  }

  protected template() {
    const query = this.query.trim().toLocaleLowerCase()
    const groups = categories.map(category => ({
      ...category,
      entries: this.entries.filter(entry => (presentation[entry.id] ?? fallback).category === category.id
        && (!query || `${entry.title} ${entry.id} ${category.title}`.toLocaleLowerCase().includes(query))),
    })).filter(category => category.entries.length)
    const count = groups.reduce((sum, group) => sum + group.entries.length, 0)
    return html`
      <header class="view-picker-heading">
        <span class="view-picker-symbol">${unsafeHTML(icon('layout'))}</span>
        <h2>视图</h2><span class="view-picker-count" role="status">${query ? `${count} / ${this.entries.length}` : this.entries.length}</span>
        <button type="button" class="icon-button" aria-label="关闭布局菜单" title="关闭 (Esc)" @click=${this.close}>${unsafeHTML(icon('close'))}</button>
      </header>
      <div class="view-picker-search" @keydown=${this.navigate}>
        ${unsafeHTML(icon('search'))}
        <input type="text" aria-label="搜索视图" placeholder="搜索视图…" autocomplete="off" spellcheck="false"
          .value=${live(this.query)} @input=${(event: Event) => this.search((event.target as HTMLInputElement).value)}>
        <button type="button" class="icon-button" aria-label="清空搜索" title="清空搜索" ?hidden=${!this.query} @click=${() => {
          this.search('')
          this.focusSearch()
        }}>${unsafeHTML(icon('close'))}</button>
      </div>
      <div class="view-picker-content" @keydown=${this.navigate}>
        ${count
          ? html`<div class="view-picker-groups">${repeat(groups, group => group.id, group => html`
          <section class="view-picker-group" aria-labelledby=${`view-category-${group.id}`}>
            <h3 id=${`view-category-${group.id}`}>${group.title}</h3>
            ${repeat(group.entries, entry => entry.id, entry => this.row(entry))}
          </section>`)}
        </div>`
          : this.empty}
      </div>
      <footer class="view-picker-footer">
        ${buttonView('重置布局', this.resetLayout, { variant: 'quiet', title: '恢复默认布局，保留文件草稿和终端会话', icon: html`${unsafeHTML(icon('refresh'))}` })}
        <span class="view-picker-hint"><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>Enter</kbd> 打开</span>
      </footer>`
  }

  private row(entry: ViewPickerEntry) {
    const detail = presentation[entry.id] ?? fallback
    const status = entry.state === 'unavailable'
      ? ('unavailable' in detail ? detail.unavailable : undefined) ?? '暂不可用'
      : entry.state === 'visible' ? '当前显示' : entry.state === 'open' ? '已打开' : '未打开'
    return html`<button type="button" class="editor-button view-picker-item" data-variant="quiet"
      data-view-id=${entry.id} data-state=${entry.state} ?disabled=${entry.state === 'unavailable'}
      aria-label=${entry.title} aria-describedby=${`view-status-${entry.id}`} title=${`${entry.title}（${status}）`}
      @click=${() => this.openView(entry.id)}>
      ${unsafeHTML(icon(detail.icon))}<span class="view-picker-name">${entry.title}</span>
      <span class="view-picker-state" id=${`view-status-${entry.id}`}>
        ${entry.state === 'visible' ? unsafeHTML(icon('check')) : nothing}${status}
      </span>
    </button>`
  }
}
defineElement('qua-view-picker', ViewPicker)
