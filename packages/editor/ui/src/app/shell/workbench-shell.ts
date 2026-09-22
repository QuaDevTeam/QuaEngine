import type { TemplateResult } from 'lit'
import { html } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { defineElement, EditorElement } from '../../shared/components/element'
import { icon } from '../../shared/icons'
import { navigationTemplate } from './navigation'
import { panelsTemplate } from './panels'
import './source-pane'
import './preview-pane'

class WorkbenchShell extends EditorElement {
  protected template(): TemplateResult {
    return html`
  <header class="titlebar"><strong>Qua <span>/ Editor</span></strong><button id="workbench-views" class="icon-button" type="button" aria-label="打开视图" aria-haspopup="dialog" title="打开视图或重置布局">${unsafeHTML(icon('layout'))}</button></header>
  <div class="workspace">
    ${navigationTemplate()}
    <main id="content" class="content">
      <qua-source-pane></qua-source-pane>
      <div id="editor-splitter" class="splitter vertical" role="separator" aria-label="调整编辑器与预览宽度" aria-orientation="vertical" tabindex="0"></div>
      <qua-preview-pane></qua-preview-pane>
    </main>
    <section id="plugin-marketplace" role="tabpanel" aria-labelledby="activity-extensions" hidden></section><section id="novel-writer" role="tabpanel" aria-labelledby="activity-writer" hidden><div class="writer-loading"><p id="writer-message" role="status">正在打开 Novel Writer…</p><button id="writer-retry" hidden>重试</button></div></section>
  </div>
  <div id="panel-splitter" class="splitter horizontal" role="separator" aria-label="调整底部面板高度" aria-orientation="horizontal" tabindex="0"></div>
${panelsTemplate()}
  <footer class="workbench-statusbar"><button id="git-branch" disabled title="源代码管理"></button><span id="status" role="status">就绪</span><div id="context-status"></div><span id="cursor-position"></span><span id="asset-status" role="status" aria-label="所选资源信息" hidden></span><button id="check-indicator" class="icon-button" data-phase="idle" aria-label="静态检查：等待项目" title="静态检查：等待项目">${unsafeHTML(icon('check'))}</button></footer>
`
  }
}
defineElement('qua-workbench-shell', WorkbenchShell)
