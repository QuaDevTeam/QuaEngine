import type { TemplateResult } from 'lit'
import { html } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { defineElement, EditorElement } from '../../shared/components/element'
import { icon } from '../../shared/icons'

class SourcePane extends EditorElement {
  protected template(): TemplateResult {
    return html`
<div class="document-bar"><div id="document-tabs" role="tablist" aria-label="打开的文档"></div><div class="document-actions"><div id="source-modes" role="group" aria-label="编辑模式" hidden></div><button id="format" class="icon-button" title="格式化文档（Shift Alt F）" aria-label="格式化文档" disabled>≡</button><button id="save" class="icon-button" title="保存（⌘/Ctrl S）" aria-label="保存" disabled>↓</button></div></div><div id="dialogue-legend" aria-label="角色高亮图例"></div><div id="disk-change" hidden><span id="disk-message"></span><div><button id="compare-disk">比较差异</button><button id="keep-local" disabled title="比较后，可用当前内容替换已查看的磁盘版本">保留本地并保存</button><button id="reload-disk">载入磁盘版本</button><button id="close-diff" hidden>返回编辑</button></div></div><div id="source-authoring" data-mode="code"><div id="editor"></div></div><div id="disk-diff" hidden aria-label="磁盘与未保存内容的差异"></div><div id="git-diff-context" hidden><span id="git-diff-title"></span><button id="git-refresh-diff" class="icon-button" title="刷新差异" aria-label="刷新差异">${unsafeHTML(icon('refresh'))}</button><button id="git-open-file" class="icon-button" title="打开源文件" aria-label="打开源文件">${unsafeHTML(icon('document'))}</button></div><div id="git-diff" hidden aria-label="Git 差异"></div><div id="git-diff-empty" hidden>二进制文件无法显示文本差异，请在资源浏览器中预览。</div><div id="editor-empty"><div class="welcome-actions"><button id="welcome-create">新建项目</button><button id="welcome-open">打开项目</button></div></div>
`
  }

  protected initialize(): void {
    this.classList.add('source-pane')
  }
}
defineElement('qua-source-pane', SourcePane)
