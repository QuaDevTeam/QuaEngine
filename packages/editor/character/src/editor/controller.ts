import type {
  EditorPluginContext,
  EditorPluginPanel,
  EditorProject,
  EditorSourceLocation,
} from '@quajs/editor-core'
import type {
  CharacterCatalog,
  SourceTarget,
} from '../contracts.js'
import { button, input as editorInput, element, html, nothing, render, repeat } from '@quajs/editor-controls'
import { CHARACTER_EDITOR_ID } from '../contracts.js'
import { characterForSource } from '../model/source.js'
import { createCharacterForms } from './forms.js'

export class CharacterBrowser implements EditorPluginPanel {
  private readonly formsView = ((owner: CharacterBrowser) => {
    return createCharacterForms({
      get generation() {
        return owner.generation
      },
      set generation(value) {
        owner.generation = value
      },
      get details() {
        return owner.details
      },

      get variants() {
        return owner.variants
      },

      get catalog() {
        return owner.catalog
      },
      set catalog(value) {
        owner.catalog = value
      },
      get selected() {
        return owner.selected
      },
      set selected(value) {
        owner.selected = value
      },
      source: (...args) => this.source(...args),
      get expressionEditor() {
        return owner.expressionEditor
      },

      get selectedExpression() {
        return owner.selectedExpression
      },
      set selectedExpression(value) {
        owner.selectedExpression = value
      },
      get project() {
        return owner.project
      },
      set project(value) {
        owner.project = value
      },
      get visible() {
        return owner.visible
      },
      set visible(value) {
        owner.visible = value
      },
      get context() {
        return owner.context
      },

      get message() {
        return owner.message
      },

      apply: (...args) => this.apply(...args),
      get form() {
        return owner.form
      },
      set form(value) {
        owner.form = value
      },
      append: (...args) => this.append(...args),
    })
  })(this)

  private project?: EditorProject
  private catalog?: CharacterCatalog
  private selected = ''
  private selectedExpression = ''
  private readonly expressionEditor = element<HTMLDivElement>(html`<div class="character-expression-editor"></div>`)
  private readonly count = element(html`<span class="character-count"></span>`)
  private visible = false
  private disposed = false
  private generation = 0
  private busy = false
  private sourceLocation?: EditorSourceLocation
  private sourceSwitch = false
  private indexVersion = 0
  private form?: 'character' | 'expression'
  private readonly search = editorInput()
  private readonly list = element<HTMLDivElement>(html`<div class="character-list"></div>`)
  private readonly details = element<HTMLDivElement>(html`<div class="character-details"></div>`)
  private readonly variants = element<HTMLDivElement>(html`<div class="character-variants"></div>`)
  private readonly message = element<HTMLDivElement>(html`<div class="character-message"></div>`)
  private readonly create = button('新建角色', () => this.formsView.newCharacter())

  constructor(
    private readonly host: HTMLElement,
    private readonly context: EditorPluginContext,
  ) {
    host.classList.add('character-browser', 'editor-controls')
    this.search.placeholder = '搜索角色、别名、文件'
    this.search.setAttribute('aria-label', '搜索角色')
    this.search.oninput = () => this.renderList()
    this.list.setAttribute('aria-label', '项目角色')
    this.list.onkeydown = (event) => {
      const buttons = [
        ...this.list.querySelectorAll<HTMLButtonElement>('button'),
      ]
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      )
      const next
        = event.key === 'ArrowDown'
          ? Math.min(buttons.length - 1, index + 1)
          : event.key === 'ArrowUp'
            ? Math.max(0, index - 1)
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : -1
      if (next < 0 || !buttons[next])
        return
      event.preventDefault()
      buttons[next].focus()
      buttons[next].click()
    }
    this.message.setAttribute('role', 'status')
    render(html`<div class="character-toolbar">${this.search}${this.create}${this.count}</div>
      ${this.message}<div class="character-content">${this.list}${this.details}${this.variants}</div>`, host)
    context.mountStatus?.(this.message)
  }

  update(project: EditorProject): void {
    const previous = this.project
    if (previous?.root !== project.root) {
      this.sourceLocation = undefined
      this.sourceSwitch = false
    }
    this.project = project
    const contribution = project.plugins?.[CHARACTER_EDITOR_ID]
    const next = contribution?.data as CharacterCatalog | undefined
    render(contribution?.error
      ? `角色索引失败：${contribution.error}`
      : (next?.issues.map(issue => issue.message).join('；')
        ?? '暂无角色索引。'), this.message)
    this.message.title
      = next?.issues
        .map(issue => `${issue.source?.path ?? ''}: ${issue.message}`)
        .join('\n') ?? ''
    this.create.disabled = !next?.registrations.length
    this.create.title = this.create.disabled
      ? '新建需要源码中的 registerCharacters([...]) 对象数组；动态生成的定义请打开源码编辑。'
      : '向角色注册数组添加定义'
    if (
      previous?.root === project.root
      && JSON.stringify(this.catalog) === JSON.stringify(next)
    ) {
      if (this.sourceSwitch)
        this.revealSource(this.sourceLocation)
      return
    }
    this.catalog = next
    this.count.textContent = `${next?.characters.length ?? 0} 个角色`
    this.host.dataset.indexVersion = String(++this.indexVersion)
    const selection = this.selected
    if (!next?.characters.some(character => character.key === this.selected))
      this.selected = next?.characters[0]?.key ?? ''
    if (this.visible) {
      this.renderList()
      this.refreshDetails(selection === this.selected)
    }
    if (this.sourceSwitch)
      this.revealSource(this.sourceLocation)
  }

  revealSource(source: EditorSourceLocation | undefined): void {
    if (this.disposed)
      return
    this.sourceLocation = source
    if (this.sourceSwitch) {
      render(nothing, this.message)
      this.sourceSwitch = false
    }
    if (!source || this.busy)
      return
    const character = characterForSource(this.catalog, source, this.selected)
    if (!character || character.key === this.selected)
      return
    const apply = () => {
      if (this.sourceLocation !== source || this.busy)
        return
      const current = characterForSource(this.catalog, source, this.selected)
      if (!current)
        return
      this.sourceSwitch = false
      render(nothing, this.message)
      this.form = undefined
      this.selected = current.key
      this.selectedExpression = ''
      this.search.value = ''
      this.renderList()
      this.formsView.renderDetails()
    }
    const inputs = [...this.details.querySelectorAll('input')]
    if (this.form || inputs.some(input => input.value !== input.defaultValue)) {
      this.sourceSwitch = true
      render(html`<span>当前角色有尚未应用的更改。</span><button type="button" @click=${apply}>放弃更改并切换</button>`, this.message)
    }
    else {
      apply()
    }
  }

  private refreshDetails(preserve: boolean): void {
    const inputs = [
      ...this.host.querySelectorAll<HTMLInputElement>('input[aria-label]'),
    ]
    const drafts = new Map(
      inputs
        .filter(input => preserve && input.value !== input.defaultValue)
        .map(input => [input.getAttribute('aria-label')!, input.value]),
    )
    const focused
      = preserve && this.host.contains(document.activeElement)
        ? document.activeElement?.getAttribute('aria-label')
        : undefined
    const form = preserve ? this.form : undefined
    this.form = undefined
    this.formsView.renderDetails()
    if (form === 'character')
      this.formsView.newCharacter(false)
    const character = this.catalog?.characters.find(
      character => character.key === this.selected,
    )
    if (form === 'expression' && character?.addExpression)
      this.formsView.newExpression(character, false)
    for (const input of this.host.querySelectorAll<HTMLInputElement>(
      'input[aria-label]',
    )) {
      const label = input.getAttribute('aria-label')!
      if (drafts.has(label)) {
        input.value = drafts.get(label)!
        if (label === '搜索差分')
          input.dispatchEvent(new Event('input'))
      }
      if (label === focused)
        input.focus()
    }
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible)
      return
    this.visible = visible
    if (visible) {
      this.renderList()
      this.refreshDetails(true)
    }
    else {
      this.generation++
      for (const image of this.variants.querySelectorAll('img')) image.remove()
    }
  }

  dispose(): void {
    this.disposed = true
    this.sourceLocation = undefined
    this.visible = false
    this.generation++
    render(nothing, this.host)
  }

  private renderList(): void {
    const query = this.search.value.toLocaleLowerCase()
    const characters
      = this.catalog?.characters.filter(character =>
        `${character.id.value} ${character.displayName.value} ${character.aliases.join(' ')} ${character.source.path}`
          .toLocaleLowerCase()
          .includes(query),
      ) ?? []
    render(html`${repeat(characters.slice(0, 100), character => character.key, character => html`
      <button type="button" class="editor-button" data-variant="default" data-character=${character.id.value}
        title=${`${character.id.value}，${character.source.path}`} aria-pressed=${String(character.key === this.selected)} @click=${() => {
          this.revealSource(undefined)
          this.form = undefined
          if (this.selected !== character.key)
            this.selectedExpression = ''
          this.selected = character.key
          this.renderList()
          this.formsView.renderDetails()
        }}><span class="character-monogram">${character.displayName.value.slice(0, 1)}</span>
        <span class="character-identity"><strong>${character.displayName.value}</strong><small>${character.id.value}</small></span>
        <small class="character-expression-count">${character.expressions.length}</small>
      </button>`)}
      ${!characters.length ? html`<p>${query ? '没有匹配的角色。' : '未发现可静态解析的角色。'}</p>` : nothing}
      ${characters.length > 100 ? html`<p>显示前 100 / ${characters.length} 个，请搜索缩小范围。</p>` : nothing}
    `, this.list)
  }

  private source(
    location: EditorSourceLocation,
    label = '打开源码',
  ): HTMLButtonElement {
    const control = button(label, () => this.context.openSource(location))
    control.className = 'character-source-link'
    control.title = `${location.path}:${location.line}:${location.column}`
    return control
  }

  private async apply(target: SourceTarget, newText: string): Promise<void> {
    if (this.busy)
      return
    this.busy = true
    try {
      await this.context.applyEdit({ ...target, newText })
      this.form = undefined
      render('已应用到源文件，可撤销；保存后更新列表。', this.message)
    }
    catch (error) {
      render(error instanceof Error ? error.message : String(error), this.message)
    }
    finally {
      this.busy = false
      if (!this.disposed && this.sourceLocation)
        this.revealSource(this.sourceLocation)
    }
  }

  private append(target: SourceTarget, entry: string): void {
    void this.apply(
      target,
      `${target.expectedText}\n${target.appendComma ? ',' : ''}\n${entry}\n`,
    )
  }
}
