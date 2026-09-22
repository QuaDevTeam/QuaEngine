import type { EditorDiagnostic } from '@quajs/editor-core'
import { element, html } from '@quajs/editor-controls'
import { workbenchEmpty } from '../../shared/empty-state'
import { VirtualList } from '../../shared/virtual-list'

export class ProblemsPanel {
  private readonly list: VirtualList<EditorDiagnostic>
  private readonly empty = workbenchEmpty('check', '等待项目检查', '打开项目后，静态检查结果会显示在这里。')
  private hasProject = false
  private checking = false
  private count = 0

  constructor(host: HTMLElement, private readonly open: (diagnostic: EditorDiagnostic) => void) {
    this.empty.element.classList.add('problems-empty')
    host.parentElement!.append(this.empty.element)
    this.list = new VirtualList(host, 32, diagnostic => element(html`
      <button type="button" class="problem-row" title=${`${diagnostic.message}\n${diagnostic.filePath || ''}${diagnostic.line ? `:${diagnostic.line}:${diagnostic.column || 1}` : ''}`} @click=${() => this.open(diagnostic)}>
        <span class=${`problem-severity ${diagnostic.severity}`} aria-label=${diagnostic.severity}>${diagnostic.severity === 'error' ? '⊗' : diagnostic.severity === 'warning' ? '△' : 'ⓘ'}</span>
        <span class="problem-message">${diagnostic.message}</span><span class="problem-code">${diagnostic.code}</span>
        <span class="problem-location">${`${diagnostic.filePath?.replaceAll('\\', '/').split('/').slice(-2).join('/') || '项目'}${diagnostic.line ? `:${diagnostic.line}:${diagnostic.column || 1}` : ''}`}</span>
      </button>`))
  }

  setProject(open: boolean): void {
    this.hasProject = open
    this.renderEmpty()
  }

  setChecking(checking: boolean): void {
    this.checking = checking
    this.renderEmpty()
  }

  render(items: EditorDiagnostic[]): void {
    const unique = new Map<string, EditorDiagnostic>()
    for (const item of items) unique.set(JSON.stringify([item.filePath, item.line, item.column, item.code, item.message]), item)
    const diagnostics = [...unique.values()].sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]) || (a.filePath || '').localeCompare(b.filePath || '') || (a.line || 0) - (b.line || 0))
    this.count = diagnostics.length
    const count = document.getElementById('diagnostic-count')!
    count.textContent = String(diagnostics.length)
    count.classList.toggle('has-errors', diagnostics.some(item => item.severity === 'error'))
    count.title = `${diagnostics.filter(item => item.severity === 'error').length} 个错误，${diagnostics.filter(item => item.severity === 'warning').length} 个警告`
    this.list.set(diagnostics)
    this.renderEmpty()
  }

  private renderEmpty(): void {
    this.empty.element.hidden = this.count > 0
    this.empty.heading.textContent = this.checking ? '正在检查项目…' : this.hasProject ? '没有发现静态问题' : '等待项目检查'
    this.empty.detail.textContent = this.checking ? '正在分析 QuaScript 与 TypeScript。' : this.hasProject ? '当前检查未发现错误或警告。' : '打开项目后，静态检查结果会显示在这里。'
  }
}
