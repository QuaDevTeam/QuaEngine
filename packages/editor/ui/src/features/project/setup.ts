import type { EditorBridge, EditorCreateProject, EditorProject, EditorRuntimeState } from '@quajs/editor-core'
import { buttonView, element, field, input, select } from '@quajs/editor-controls'
import { html, render } from 'lit'
import './styles.scss'

export class ProjectSetup {
  private readonly dialog = element<HTMLDialogElement>(html`<dialog></dialog>`)
  private readonly banner = element(html`<section></section>`)
  private root?: string
  private state?: EditorRuntimeState
  private creating = false

  constructor(bridge: EditorBridge, private readonly bounds: () => void, create: (request: EditorCreateProject) => Promise<void>) {
    this.dialog.id = 'project-create-dialog'
    this.dialog.setAttribute('aria-labelledby', 'project-create-title')
    render(html`<form><h2 id="project-create-title">新建项目</h2>
      <div class="project-fields"></div>
      <p class="project-error" role="alert"></p><div class="project-dialog-actions">${buttonView('取消', () => this.dialog.close(), { variant: 'quiet' })}${buttonView('创建项目', undefined, { variant: 'primary', type: 'submit' })}</div></form>`, this.dialog)
    const error = this.dialog.querySelector<HTMLElement>('.project-error')!
    const kind = select([{ value: 'game', title: '常规项目（Vue / QuaScript）' }, { value: 'plugin', title: '插件项目（Runtime / Devtools）' }])
    kind.name = 'kind'
    const name = input('', undefined, { placeholder: 'my-game' })
    name.name = 'name'
    name.required = true
    name.pattern = '[a-z][a-z0-9\\-]{0,63}'
    name.maxLength = 64
    name.autocomplete = 'off'
    name.spellcheck = false
    const locationInput = input('', undefined, { placeholder: '选择父目录' })
    locationInput.name = 'location'
    locationInput.readOnly = true
    const locationField = field('位置', locationInput, { layout: 'stack' })
    render(html`${locationInput}${buttonView('选择…', () => {
      void bridge.chooseProjectLocation().then(path => locationInput.value = path ?? '').catch(value => error.textContent = this.error(value))
    })}`, locationField.appendChild(element(html`<div class="project-location"></div>`)))
    render(html`${field('类型', kind, { layout: 'stack' })}${field('项目名称', name, { layout: 'stack' })}${locationField}`, this.dialog.querySelector('.project-fields')!)
    document.body.append(this.dialog)
    const form = this.dialog.querySelector('form')!
    const location = form.elements.namedItem('location') as HTMLInputElement
    this.dialog.addEventListener('cancel', (event) => {
      if (this.creating)
        event.preventDefault()
    })
    this.dialog.addEventListener('close', bounds)
    form.onsubmit = (event) => {
      event.preventDefault()
      if (this.creating)
        return
      if (!location.value) {
        error.textContent = '请选择新项目的父目录。'
        return
      }
      this.creating = true
      error.textContent = ''
      const request: EditorCreateProject = { name: (form.elements.namedItem('name') as HTMLInputElement).value, kind: (form.elements.namedItem('kind') as HTMLSelectElement).value as EditorCreateProject['kind'] }
      for (const input of form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')) input.disabled = true
      void create(request).then(() => this.dialog.close()).catch(value => error.textContent = this.error(value)).finally(() => {
        this.creating = false
        for (const input of form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')) input.disabled = false
      })
    }
    this.banner.id = 'project-runtime'
    this.banner.hidden = true
    render(html`<div class="runtime-row"><progress aria-label="准备运行环境"></progress><span role="status"></span><button data-action="retry">重试</button><button data-action="cancel">取消</button><button data-action="details">详情</button></div><pre hidden aria-label="运行环境日志"></pre>`, this.banner)
    document.querySelector('.source-pane')!.prepend(this.banner)
    this.banner.querySelector<HTMLButtonElement>('[data-action="retry"]')!.onclick = () => {
      if (this.root)
        void bridge.repairRuntime(this.root).catch(value => this.banner.querySelector('span')!.textContent = this.error(value))
    }
    this.banner.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.onclick = () => void bridge.cancelRuntime()
    this.banner.querySelector<HTMLButtonElement>('[data-action="details"]')!.onclick = () => {
      const log = this.banner.querySelector('pre')!
      log.hidden = !log.hidden
    }
    bridge.onRuntimeState((state) => {
      this.state = state
      this.render()
    })
    void bridge.runtimeState().then((state) => {
      if (!this.state)
        this.state = state
      this.render()
    })
  }

  show(): void {
    if (this.dialog.open || document.querySelector('dialog[open]'))
      return
    this.dialog.querySelector('.project-error')!.textContent = ''
    this.dialog.showModal()
    this.bounds()
  }

  update(project: EditorProject): void {
    this.root = project.root
    this.render()
  }

  private render(): void {
    const state = this.state
    this.banner.hidden = !state || state.root !== this.root || state.phase === 'ready'
    if (!state)
      return
    const busy = state.phase === 'checking' || state.phase === 'installing'
    this.banner.dataset.phase = state.phase
    this.banner.querySelector('span')!.textContent = state.message
    this.banner.querySelector('pre')!.textContent = state.log || state.message
    this.banner.querySelector('progress')!.hidden = !busy
    this.banner.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.hidden = !busy
    this.banner.querySelector<HTMLButtonElement>('[data-action="retry"]')!.hidden = busy
  }

  private error(value: unknown): string {
    return String(value).replace(/^Error: /, '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
  }
}
