import type { EditorGitDiff } from '@quajs/editor-core'
import type { AppContext, GitDiffTab, OpenTab } from '../bootstrap'
import { html, nothing, render } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from '../../shared/icons'

export function createDocumentsTabs(context: Pick<AppContext, 'activeGitTab' | 'activeTab' | 'analysisGeneration' | 'analysisTimer' | 'analyzedPath' | 'bridge' | 'clearDiskChange' | 'closeDiskDiff' | 'dialogueColors' | 'documentDiagnostics' | 'documentModel' | 'editor' | 'element' | 'gitDiff' | 'gitGeneration' | 'gitTabs' | 'openDocument' | 'project' | 'projectRelativePath' | 'renderDiagnostics' | 'reportedDirty' | 'saveDocument' | 'saving' | 'setDirty' | 'showError' | 'tabSignature' | 'tabs' | 'workbench' | 'workspaceBusy'>) {
  function hideGitDiff(): void {
    context.workbench.cancelGitDiff()
    ++context.gitGeneration
    if (context.activeGitTab)
      context.activeGitTab.view = context.gitDiff.saveViewState()
    context.activeGitTab = undefined
    context.gitDiff.close()
    document.querySelector('.source-pane')!.classList.remove('showing-git-diff')
    context.element('git-diff-context').hidden = true
    context.element('git-diff-empty').hidden = true
    context.element('editor').hidden = false
    context.element('editor-empty').hidden = Boolean(context.documentModel)
    context.editor.layout()
    renderTabs()
  }

  function showGitDiff(diff: EditorGitDiff): void {
    let tab = context.gitTabs.find(tab => tab.path === diff.path && tab.staged === diff.staged)
    if (!tab) {
    // Inactive comparisons keep only metadata/view position, never duplicate text models.
      if (context.gitTabs.length >= 12)
        context.gitTabs.shift()
      tab = { path: diff.path, staged: diff.staged }
      context.gitTabs.push(tab)
    }
    void activateGitDiff(tab, diff)
  }

  async function activateGitDiff(tab: GitDiffTab, snapshot?: EditorGitDiff): Promise<void> {
    if (!context.project || context.workspaceBusy || context.saving)
      return
    hideGitDiff()
    context.closeDiskDiff()
    const root = context.project.root
    const generation = ++context.gitGeneration
    context.activeGitTab = tab
    context.workbench.documentClosed()
    document.querySelector('.source-pane')!.classList.add('showing-git-diff')
    context.element('editor').hidden = true
    context.element('editor-empty').hidden = true
    context.element('git-diff-context').hidden = false
    context.element('git-diff-title').textContent = `${tab.path}，${tab.staged ? 'HEAD ↔ 暂存区' : '暂存区 ↔ 工作树'}，只读`
    context.element('git-diff-title').title = context.element('git-diff-title').textContent!
    context.element('git-diff-empty').textContent = '正在读取差异…'
    context.element('git-diff-empty').hidden = false
    renderTabs()
    context.element('document-tabs').querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    try {
      const diff = snapshot || await context.bridge.gitDiff(root, tab.path, tab.staged)
      if (generation !== context.gitGeneration || context.project?.root !== root)
        return
      context.element('git-diff-empty').textContent = '二进制文件无法显示文本差异，请在资源浏览器中预览。'
      context.element('git-diff-empty').hidden = !diff.binary
      if (!diff.binary) {
        context.gitDiff.show(diff.before, diff.after, diff.path.endsWith('.qs') ? 'quascript' : /\.[cm]?tsx?$/u.test(diff.path) ? 'typescript' : 'plaintext', tab.view)
      }
    }
    catch (error) {
      if (generation === context.gitGeneration)
        context.element('git-diff-empty').textContent = String(error).replace(/^Error: /u, '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '')
    }
  }

  async function closeGitTab(tab: GitDiffTab): Promise<void> {
    const index = context.gitTabs.indexOf(tab)
    if (index < 0)
      return
    context.gitTabs.splice(index, 1)
    if (context.activeGitTab === tab) {
      hideGitDiff()
      if (context.gitTabs.length)
        await activateGitDiff(context.gitTabs[Math.min(index, context.gitTabs.length - 1)])
      else context.editor.focus()
    }
    renderTabs()
  }

  function closeActiveTab(): Promise<void> {
    return context.activeGitTab ? closeGitTab(context.activeGitTab) : closeTab(context.activeTab)
  }

  function reportDirty(): void {
    const next = context.tabs.some(tab => tab.dirty)
    if (context.reportedDirty === next)
      return
    context.reportedDirty = next
    void context.bridge.setDocumentDirty(next).catch((error) => {
      context.reportedDirty = undefined
      context.showError(error)
    })
  }

  function renderTabs(): void {
    const signature = JSON.stringify([context.tabs.map(tab => [tab.document.path, tab.dirty, tab === context.activeTab && !context.activeGitTab]), context.gitTabs.map(tab => [tab.path, tab.staged, tab === context.activeGitTab])])
    if (signature === context.tabSignature)
      return
    context.tabSignature = signature
    const bar = context.element('document-tabs')
    render(html`
      ${repeat(context.tabs, tab => tab.document.path, (tab) => {
        const active = tab === context.activeTab && !context.activeGitTab
        const name = tab.document.path.split('/').at(-1)!
        const title = `${context.projectRelativePath(tab.document.path)}${tab.dirty ? '（未保存）' : ''}`
        const closeTitle = `关闭 ${name}${tab.dirty ? '（未保存）' : ''}`
        return html`<div class=${`document-tab${active ? ' active' : ''}`} data-path=${context.projectRelativePath(tab.document.path)} data-kind="file">
          <button type="button" role="tab" aria-selected=${String(active)} tabindex=${active ? 0 : -1} id=${active ? 'document-name' : nothing} title=${title}
            @click=${() => void context.openDocument(tab.document.path).catch(context.showError)}>${name}</button>
          <button type="button" class="tab-close icon-button" title=${closeTitle} aria-label=${closeTitle} @click=${() => void closeTab(tab).catch(context.showError)}>${tab.dirty ? '●' : '×'}</button>
        </div>`
      })}
      ${repeat(context.gitTabs, tab => `${tab.path}:${tab.staged}`, (tab) => {
        const active = tab === context.activeGitTab
        const kind = tab.staged ? '暂存区' : '工作树'
        const title = `${tab.path}（${kind}差异）`
        return html`<div class=${`document-tab diff-tab${active ? ' active' : ''}`} data-kind="diff" data-path=${tab.path} data-staged=${String(tab.staged)}>
          <button type="button" role="tab" aria-selected=${String(active)} tabindex=${active ? 0 : -1} title=${title} aria-label=${title} @click=${() => void activateGitDiff(tab)}>
            ${unsafeHTML(icon('diff'))}<span class="tab-label">${tab.path.split('/').at(-1)!}</span><span class="tab-description">(${kind})</span>
          </button><button type="button" class="tab-close icon-button" title=${`关闭 ${title}`} aria-label=${`关闭 ${title}`} @click=${() => void closeGitTab(tab)}>×</button>
        </div>`
      })}
    `, bar)
  }

  async function closeTab(tab?: OpenTab): Promise<void> {
    if (!tab || context.workspaceBusy || context.saving || (tab.dirty && !await context.bridge.confirmDiscard()))
      return
    const previousDiff = context.activeGitTab
    const index = context.tabs.indexOf(tab)
    if (index < 0)
      return
    context.tabs.splice(index, 1)
    if (tab === context.activeTab) {
      context.dialogueColors.clear()
      context.clearDiskChange()
      hideGitDiff()
      ++context.analysisGeneration
      clearTimeout(context.analysisTimer)
      context.editor.setModel(null)
      context.activeTab = undefined
      context.documentModel = undefined
      context.workbench.documentClosed()
      context.setDirty(false)
      context.documentDiagnostics = []
      context.analyzedPath = undefined
      context.renderDiagnostics(context.project?.diagnostics || [])
      context.element('editor-empty').hidden = false
      context.element<HTMLButtonElement>('format').disabled = true
      context.element('cursor-position').textContent = ''
    }
    tab.model.dispose()
    renderTabs()
    reportDirty()
    if (!context.activeTab && context.tabs.length)
      await context.openDocument(context.tabs[Math.min(index, context.tabs.length - 1)].document.path)
    if (previousDiff && context.activeGitTab !== previousDiff)
      await activateGitDiff(previousDiff)
  }

  async function saveAll(): Promise<void> {
    if (context.workspaceBusy || context.saving)
      throw new Error('请等待当前文件操作完成。')
    const current = context.activeTab
    const currentDiff = context.activeGitTab
    hideGitDiff()
    for (const tab of [...context.tabs]) {
      if (!tab.dirty)
        continue
      await context.openDocument(tab.document.path, undefined, undefined, false, true, false)
      await context.saveDocument()
      if (tab.dirty)
        throw new Error('文档仍有未保存修改，请完成保存后重试。')
    }
    if (current && context.activeTab !== current)
      await context.openDocument(current.document.path, undefined, undefined, false, true, false)
    if (currentDiff)
      await activateGitDiff(currentDiff)
  }

  async function switchTab(direction: number, focusTab = false): Promise<void> {
    const all = [...context.tabs, ...context.gitTabs]
    if (!all.length)
      return
    const current = context.activeGitTab || context.activeTab
    const index = current ? all.indexOf(current) : 0
    const next = all[(index + direction + all.length) % all.length]
    if ('document' in next)
      await context.openDocument(next.document.path)
    else await activateGitDiff(next)
    if (focusTab)
      context.element('document-tabs').querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
  }
  return { hideGitDiff, showGitDiff, activateGitDiff, closeGitTab, closeActiveTab, reportDirty, renderTabs, closeTab, saveAll, switchTab }
}
