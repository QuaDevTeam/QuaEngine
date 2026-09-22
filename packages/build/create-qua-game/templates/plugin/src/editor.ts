import { LitElement, html } from 'lit'
import './editor.scss'

/** Editor-local presentation. Source edits belong to context.applyEdit. */
class PluginPanel extends LitElement {
  static properties = { projectName: { state: true } }
  declare projectName: string

  constructor() {
    super()
    this.projectName = ''
  }

  protected createRenderRoot(): HTMLElement { return this }

  protected render() {
    return html`<section class="plugin-panel" data-qua-plugin="__PROJECT_BUNDLE_ID__" aria-label="__PROJECT_TITLE__">
      <h2>__PROJECT_TITLE__</h2>
      <p>${this.projectName ? `当前项目：${this.projectName}` : '打开项目以使用此面板。'}</p>
    </section>`
  }
}

const tag = 'qua-__PROJECT_BUNDLE_ID__-panel'
if (!customElements.get(tag))
  customElements.define(tag, PluginPanel)

export const editorPlugin = {
  id: '__PROJECT_BUNDLE_ID__',
  apiVersion: 1 as const,
  panels: [{
    id: '__PROJECT_BUNDLE_ID__.panel',
    title: '__PROJECT_TITLE__',
    mount(host: HTMLElement) {
      const panel = document.createElement(tag) as PluginPanel
      host.append(panel)
      return {
        update(project: { name: string }) { panel.projectName = project.name },
        setVisible(visible: boolean) { panel.hidden = !visible },
        dispose() { panel.remove() },
      }
    },
  }],
}
