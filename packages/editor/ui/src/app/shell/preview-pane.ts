import type { TemplateResult } from 'lit'
import { html } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { defineElement, EditorElement } from '../../shared/components/element'
import { icon } from '../../shared/icons'

class PreviewPane extends EditorElement {
  protected template(): TemplateResult {
    return html`
<div class="panel-toolbar" role="toolbar" aria-label="预览操作"><span>预览</span><div class="preview-actions"><button id="run" class="icon-button" title="运行（F5）" aria-label="运行（F5）" disabled>${unsafeHTML(icon('play'))}</button><button id="stop" class="icon-button" title="停止（Shift F5）" aria-label="停止（Shift F5）" disabled>${unsafeHTML(icon('stop'))}</button><button id="preview-step" class="icon-button" disabled title="单步：前进一个对话步骤（F10）" aria-label="单步（F10）">${unsafeHTML(icon('step'))}</button><button id="preview-seek" class="icon-button" disabled title="到光标：从文件初始状态执行，遇到选择暂停（⌘/Ctrl Alt Enter）" aria-label="到光标（⌘/Ctrl Alt Enter）">${unsafeHTML(icon('runToCursor'))}</button><button id="preview-refresh" class="icon-button" title="刷新并恢复预览位置" aria-label="刷新预览">${unsafeHTML(icon('refresh'))}</button><button id="preview-mute" class="icon-button" title="静音预览" aria-label="静音预览" aria-pressed="false">${unsafeHTML(icon('volume'))}</button><button id="preview-window" class="icon-button" title="在独立窗口中预览" aria-label="在独立窗口中预览">${unsafeHTML(icon('popout'))}</button><button id="preview-fullscreen" class="icon-button" title="全屏预览" aria-label="全屏预览">${unsafeHTML(icon('fullscreen'))}</button></div><select id="target" title="预览模式" aria-label="预览模式"><option value="web">Web</option><option value="native">Native</option></select></div><div id="preview"><div id="preview-error-overlay" hidden><h3>渲染失败</h3><pre id="preview-error-message"></pre><button id="preview-retry">刷新预览</button></div><div id="preview-empty"></div><div id="preview-progress" role="status" aria-live="polite" hidden><strong id="preview-progress-label"></strong><progress aria-label="Native 构建进行中"></progress><span id="preview-progress-detail"></span><button id="preview-build-log">查看构建日志</button></div><div id="native-surface" hidden aria-label="Native 游戏预览"></div></div>
`
  }

  protected initialize(): void {
    this.classList.add('preview-pane')
  }
}
defineElement('qua-preview-pane', PreviewPane)
