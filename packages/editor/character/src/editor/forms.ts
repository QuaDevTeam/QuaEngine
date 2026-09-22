import type {
  EditorPluginContext,
  EditorProject,
  EditorSourceLocation,
} from '@quajs/editor-core'
import type {
  CharacterAsset,
  CharacterCatalog,
  CharacterField,
  CharacterRecord,
  SourceTarget,
} from '../contracts.js'
import { button, field as editorField, input as editorInput, select as editorSelect, element, emptyState, html, nothing, render as renderView } from '@quajs/editor-controls'

const EXPRESSIONS_PER_PAGE = 60

interface ViewContext {
  generation: number
  details: HTMLDivElement
  variants: HTMLDivElement
  catalog: CharacterCatalog | undefined
  selected: string
  source: (location: EditorSourceLocation, label?: string) => HTMLButtonElement
  expressionEditor: HTMLDivElement
  selectedExpression: string
  project: EditorProject | undefined
  visible: boolean
  context: EditorPluginContext
  message: HTMLDivElement
  apply: (target: SourceTarget, newText: string) => Promise<void>
  form: 'character' | 'expression' | undefined
  append: (target: SourceTarget, entry: string) => void
}

export function createCharacterForms(context: ViewContext) {
  let browsing: { root: string, character: string, query: string, page: number } | undefined

  function renderDetails(): void {
    context.generation++
    const character = context.catalog?.characters.find(character => character.key === context.selected)
    renderView(nothing, context.variants)
    if (!character) {
      browsing = undefined
      renderView(html`${(context.catalog?.issues ?? []).map(issue => issue.source ? context.source(issue.source, issue.source.path) : nothing)}`, context.details)
      return
    }
    renderView(nothing, context.expressionEditor)
    renderView(html`<h3>角色属性</h3>${context.source(character.source)}${character.manifest ? context.source(character.manifest, '差分清单') : nothing}
      ${field('名称', character.displayName)}${field('ID', character.id)}
      ${character.aliases.length ? html`<p>别名：${character.aliases.join('、')}</p>` : nothing}
      ${character.warnings.map(warning => html`<p class="character-warning">${warning}</p>`)}
      ${character.remove ? removeButton('移除角色定义', character.remove) : nothing}${context.expressionEditor}`, context.details)
    if (!character.expressions.some(expression => expression.name === context.selectedExpression))
      context.selectedExpression = character.expressions[0]?.name ?? '基础立绘'
    const selected = character.expressions.find(expression => expression.name === context.selectedExpression)
    if (selected)
      inspectExpression(selected.name, selected.assets, selected.source, selected.remove)
    else if (character.base.length)
      inspectExpression('基础立绘', character.base, character.source)
    const root = context.project!.root
    const state = browsing?.root === root && browsing.character === character.key
      ? browsing
      : { root, character: character.key, query: '', page: 0 }
    browsing = state
    const search = editorInput(state.query, undefined, { type: 'search', placeholder: '搜索差分' })
    search.setAttribute('aria-label', '搜索差分')
    const grid = element(html`<div class="character-variant-grid"></div>`)
    const count = element(html`<span class="character-variant-count" role="status" aria-atomic="true"></span>`)
    const pageLabel = element(html`<span class="character-variant-page"></span>`)
    const previous = button('‹', () => changePage(-1), 'quiet')
    const next = button('›', () => changePage(1), 'quiet')
    for (const [control, label] of [[previous, '上一页'], [next, '下一页']] as const) {
      control.classList.add('icon-button')
      control.setAttribute('aria-label', label)
      control.title = label
    }
    const pagination = element(html`<nav class="character-variant-pagination" aria-label="差分分页">${previous}${pageLabel}${next}</nav>`)
    renderView(html`<div class="character-variant-header">
      <div class="character-variant-toolbar">${search}${character.addExpression ? button('添加差分', () => newExpression(character)) : nothing}</div>
      <div class="character-variant-navigation">${count}${pagination}</div>
    </div>${grid}`, context.variants)
    const render = () => {
      const generation = ++context.generation
      const entries = character.expressions.filter(expression => expression.name.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()))
      const pages = Math.max(1, Math.ceil(entries.length / EXPRESSIONS_PER_PAGE))
      state.page = Math.max(0, Math.min(state.page, pages - 1))
      renderView(state.query ? `${entries.length} 个结果` : `共 ${entries.length} 个差分`, count)
      pagination.hidden = pages === 1
      previous.disabled = state.page === 0
      next.disabled = state.page === pages - 1
      renderView(`${state.page + 1} / ${pages}`, pageLabel)
      pageLabel.setAttribute('aria-label', `第 ${state.page + 1} 页，共 ${pages} 页`)
      const pending: { image: HTMLImageElement, path: string }[] = []
      renderView(html`
        ${!state.query && state.page === 0 && character.base.length ? card(grid, '基础立绘', character.base, pending, character.source) : nothing}
        ${entries.slice(state.page * EXPRESSIONS_PER_PAGE, (state.page + 1) * EXPRESSIONS_PER_PAGE).map(expression => card(grid, expression.name, expression.assets, pending, expression.source, expression.remove))}
        ${!entries.length && (state.query || !character.base.length) ? emptyState(state.query ? '没有匹配的差分' : '未定义差分').element : nothing}
      `, grid)
      const load = async () => {
        while (
          pending.length
          && generation === context.generation
          && context.visible
        ) {
          const item = pending.shift()!
          try {
            const url = await context.context.assetUrl(root, item.path, true)
            if (generation === context.generation && context.visible)
              item.image.src = url
          }
          catch {
            if (generation === context.generation)
              item.image.alt = '预览不可用'
          }
        }
      }
      for (let i = 0; i < 4; i++) void load()
    }
    function changePage(offset: number): void {
      state.page += offset
      render()
      context.variants.scrollTop = 0
    }
    search.oninput = () => {
      if (state.query !== search.value) {
        state.query = search.value
        state.page = 0
      }
      render()
      context.variants.scrollTop = 0
    }
    render()
  }

  function field(label: string, field: CharacterField): HTMLElement {
    const input = editorInput()
    input.value = field.value
    input.defaultValue = field.value
    input.setAttribute('aria-label', `角色${label}`)
    input.readOnly = !field.edit
    input.title
      = label === 'ID'
        ? '修改 ID 后需在源码中更新对话和角色引用。'
        : field.edit
          ? ''
          : '此字段由动态或共享表达式生成，请打开源码修改。'
    const row = editorField(label, input)
    row.classList.add('character-field')
    if (field.edit) {
      row.append(
        button('应用', () => {
          if (!input.value.trim()) {
            renderView(`${label}不能为空。`, context.message)
            return
          }
          void context.apply(field.edit!, JSON.stringify(input.value.trim()))
        }),
      )
    }
    return row
  }

  function card(grid: HTMLElement, name: string, assets: CharacterAsset[], pending: { image: HTMLImageElement, path: string }[], source: EditorSourceLocation, remove?: SourceTarget): HTMLElement {
    const layers = assets.slice(0, 8).map((asset) => {
      if (!asset.path)
        return html`<span class="character-warning">缺失资源</span>`
      const image = element<HTMLImageElement>(html`<img alt=${name} title=${asset.path} loading="lazy">`)
      pending.push({ image, path: asset.path })
      return image
    })
    const card = element(html`<button type="button" class="character-variant" data-expression=${name} aria-label=${`差分 ${name}`} aria-pressed=${String(context.selectedExpression === name)}
      @click=${() => {
        context.selectedExpression = name
        for (const item of grid.querySelectorAll<HTMLElement>('[data-expression]')) item.setAttribute('aria-pressed', String(item === card))
        inspectExpression(name, assets, source, remove)
      }} @dblclick=${() => context.context.openSource(source)}>
      <div class="character-variant-preview">${layers}${!assets.length ? html`<span class="character-empty-preview">无图层</span>` : nothing}</div>
      <span class="character-variant-caption"><span>${name}</span><small>${assets.length > 1 ? `${assets.length} 图层` : ''}</small></span>
    </button>`)
    return card
  }

  function inspectExpression(
    name: string,
    assets: CharacterAsset[],
    source: EditorSourceLocation,
    remove?: SourceTarget,
  ): void {
    renderView(html`<h3>${name}</h3>${context.source(source, '定位差分定义')}
      ${assets.length > 1 ? html`<p>${assets.length} 个独立图层</p>` : nothing}
      ${assets.slice(0, 8).map((asset, index) => {
        const path = editorInput(asset.name)
        path.setAttribute('aria-label', `${name} 资源路径${index ? ` ${index + 1}` : ''}`)
        path.title = asset.name
        path.readOnly = !asset.edit
        return html`${editorField(assets.length > 1 ? `图层 ${index + 1}` : '资源路径', path, { layout: 'stack' })}
          ${asset.edit
            ? button('应用路径', () => {
                if (!path.value.trim()) {
                  renderView('资源路径不能为空。', context.message)
                  return
                }
                void context.apply(asset.edit!, JSON.stringify(path.value.trim()))
              })
            : nothing}`
      })}${remove ? removeButton('移除差分', remove) : nothing}`, context.expressionEditor)
  }

  function removeButton(label: string, target: SourceTarget): HTMLButtonElement {
    let armed = false
    const control = button(label, () => {
      if (!armed) {
        armed = true
        control.textContent = `确认${label}`
        return
      }
      void context.apply(target, '')
    })
    return control
  }

  function newCharacter(focus = true): void {
    if (!context.catalog?.registrations.length)
      return
    context.form = 'character'
    const select = editorSelect()
    select.setAttribute('aria-label', '角色注册位置')
    renderView(html`${context.catalog.registrations.map((registration, index) => html`<option value=${index}>${registration.source.path}:${registration.source.line}</option>`)}`, select)
    const id = editorInput()
    id.placeholder = '角色 ID'
    id.setAttribute('aria-label', '新角色 ID')
    const name = editorInput()
    name.placeholder = '显示名称'
    name.setAttribute('aria-label', '新角色名称')
    const manifest = editorInput()
    manifest.placeholder = '差分清单路径（可选）'
    manifest.setAttribute('aria-label', '新角色差分清单')
    renderView(html`${[
      editorField('注册位置', select, { layout: 'stack' }),
      editorField('角色 ID', id, { layout: 'stack' }),
      editorField('显示名称', name, { layout: 'stack' }),
      editorField('差分清单', manifest, { layout: 'stack' }),
      button('添加到源文件', () => {
        const value = id.value.trim()
        if (
          !value
          || context.catalog?.characters.some(
            character => character.id.value === value,
          )
        ) {
          renderView('请输入未使用的角色 ID。', context.message)
          return
        }
        const target = context.catalog!.registrations[Number(select.value)].append
        context.append(
          target,
          JSON.stringify(
            {
              id: value,
              displayName: name.value.trim() || value,
              ...(manifest.value.trim()
                ? { spriteManifest: manifest.value.trim() }
                : {}),
            },
            null,
            2,
          ),
        )
      }),
      button('取消', () => {
        context.form = undefined
        renderDetails()
      }),
    ]}`, context.details)
    if (focus)
      id.focus()
  }

  function newExpression(character: CharacterRecord, focus = true): void {
    context.form = 'expression'
    const name = editorInput()
    name.placeholder = '差分名称'
    name.setAttribute('aria-label', '新差分名称')
    const asset = editorInput()
    asset.placeholder = '图片路径，例如 rin/smile.png'
    asset.setAttribute('aria-label', '新差分资源路径')
    renderView(html`${[
      html`<strong>${character.displayName.value}</strong>`,
      editorField('差分名称', name, { layout: 'stack' }),
      editorField('资源路径', asset, { layout: 'stack' }),
      button('添加到源文件', () => {
        const key = name.value.trim()
        if (
          !key
          || !asset.value.trim()
          || character.expressions.some(expression => expression.name === key)
        ) {
          renderView('请输入未使用的差分名称和图片路径。', context.message)
          return
        }
        context.append(
          character.addExpression!,
          `${JSON.stringify(key)}: ${JSON.stringify({ layers: [{ asset: asset.value.trim() }] }, null, 2)}`,
        )
      }),
      button('取消', () => {
        context.form = undefined
        renderDetails()
      }),
    ]}`, context.details)
    if (focus)
      name.focus()
  }
  return { renderDetails, field, card, inspectExpression, removeButton, newCharacter, newExpression }
}
