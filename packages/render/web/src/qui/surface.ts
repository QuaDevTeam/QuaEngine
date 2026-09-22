import type { AssetType, QuaAssets } from '@quajs/assets'
import type { NativeUiSurfaceIntentProjection as Intent, NativeUiSurfaceNodeProjection as Node } from '@quajs/native-ui-compiler'
import type { Pipeline } from '@quajs/pipeline'
import { RenderToLogicEvents } from '@quajs/render-core'
import { runtimePackageCandidatesFromMetadata, WebAssetUrlHandle } from '../assets'
import { applyQuiStyle } from './style'

export interface QuiWebSurfaceOptions {
  container: HTMLElement
  pipeline: Pipeline
  assets?: QuaAssets
  elementId: string
}

/** Optional DOM adapter for the same resolved QUI tree consumed by native WGPU. */
export function createQuiWebSurface(options: QuiWebSurfaceOptions) {
  type Entry = ReturnType<typeof createEntry>
  const entries = new Map<string, Entry>()
  let disposed = false
  let revision = 0
  let lastRoot: Node | undefined
  const report = (error: unknown) => {
    void options.pipeline.emit('render/error', { message: String(error), source: 'qui', error })
  }
  const dispatch = (intent: Intent | undefined) => {
    if (!intent || disposed)
      return
    const payload = { ...intent.metadata, elementId: options.elementId, action: intent.action, choiceId: intent.choiceId }
    void options.pipeline.emit(intent.event === 'choice/select' ? RenderToLogicEvents.USER_CHOICE_SELECT : intent.event, payload).catch(report)
  }
  function createEntry(node: Node) {
    const tag = node.control?.kind === 'select' ? 'select' : node.control?.kind === 'range' ? 'input' : node.kind === 'Button' ? 'button' : node.kind === 'Image' ? 'img' : 'div'
    const element = document.createElement(tag)
    element.dataset.quiId = node.id
    element.dataset.quaInputIgnore = ''
    const entry = {
      element,
      node,
      parentX: 0,
      parentY: 0,
      hover: false,
      pressed: false,
      focused: false,
      effectiveVisible: true,
      assetIdentity: '',
      assetUrl: undefined as string | undefined,
      scrollInitialized: false,
      asset: undefined as WebAssetUrlHandle | undefined,
    }
    const paint = () => paintEntry(entry)
    element.onpointerenter = () => {
      entry.hover = true
      paint()
    }
    element.onpointerleave = () => {
      entry.hover = false
      entry.pressed = false
      paint()
    }
    element.onpointerdown = () => {
      entry.pressed = true
      paint()
    }
    element.onpointerup = () => {
      entry.pressed = false
      paint()
    }
    element.onfocus = () => {
      entry.focused = true
      paint()
    }
    element.onblur = () => {
      entry.focused = false
      entry.pressed = false
      paint()
    }
    element.onclick = (event) => {
      event.stopPropagation()
      if (!entry.effectiveVisible || entry.node.accessibility?.disabled)
        return
      if (entry.node.control?.kind === 'switch') {
        dispatch(entry.node.control.options[entry.node.control.selectedIndex === 1 ? 0 : 1]?.intent)
      }
      else if (!entry.node.control) {
        dispatch(entry.node.intent)
      }
    }
    element.onkeydown = (event) => {
      if (tag === 'div' && (entry.node.intent || entry.node.control?.kind === 'switch') && ['Enter', ' '].includes(event.key)) {
        event.preventDefault()
        element.click()
      }
    }
    element.oninput = () => {
      const control = entry.node.control
      if (!entry.effectiveVisible || entry.node.accessibility?.disabled)
        return
      if (control && control.kind !== 'switch')
        dispatch(control.options[Number((element as HTMLInputElement).value)]?.intent)
    }
    return entry
  }
  function paintEntry(entry: Entry) {
    const { element, node } = entry
    const state = entry.pressed ? 'active' : entry.focused && element.matches(':focus-visible') ? 'focus-visible' : entry.focused ? 'focus' : entry.hover ? 'hover' : undefined
    const variant = state ? node.stateStyles?.[state] : undefined
    const bounds = variant?.bounds || node.bounds
    const style = { ...node.style, ...variant?.style }
    element.style.cssText = 'all:initial;box-sizing:border-box;position:absolute;display:block;margin:0;padding:0;min-width:0;min-height:0;border:0 solid transparent;outline:none;font-family:"Noto Sans";font-size:24px;color:#fff;pointer-events:none;'
    Object.assign(element.style, {
      left: `${bounds.x - entry.parentX}px`,
      top: `${bounds.y - entry.parentY}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      display: entry.effectiveVisible ? 'block' : 'none',
      zIndex: String(node.zIndex ?? 0),
      overflow: node.kind === 'Scroll' ? 'auto' : node.clipChildren ? 'hidden' : 'visible',
      opacity: String((node.opacity ?? 1) * (style.opacity ?? 1)),
    })
    applyQuiStyle(element.style, { ...style, opacity: (node.opacity ?? 1) * (style.opacity ?? 1) })
    if (node.kind === 'Button') {
      Object.assign(element.style, { cursor: node.intent ? 'pointer' : 'default', pointerEvents: 'auto', overflow: 'hidden', whiteSpace: style.whiteSpace || 'nowrap' })
      ;
      (element as HTMLButtonElement).disabled = !node.intent || node.accessibility?.disabled === true
      ;
      (element as HTMLButtonElement).type = 'button'
    }
    if (node.intent || node.control || node.kind === 'Scroll' || node.kind === 'Panel')
      element.style.pointerEvents = 'auto'
    if (node.intent || node.control)
      element.style.cursor = 'pointer'
    if (node.kind === 'Scroll')
      element.tabIndex = 0
    if (node.intent && element.tagName === 'DIV' && node.kind !== 'Backdrop') {
      element.tabIndex = 0
      element.setAttribute('role', 'button')
    }
    if (node.control?.kind === 'switch') {
      element.tabIndex = 0
      element.setAttribute('role', 'switch')
      element.setAttribute('aria-checked', String(node.control.selectedIndex === 1))
    }
    if (node.control && ['INPUT', 'SELECT'].includes(element.tagName))
      (element as HTMLInputElement | HTMLSelectElement).disabled = node.accessibility?.disabled === true
    if (node.control?.kind === 'range') {
      const input = element as HTMLInputElement
      input.type = 'range'
      input.min = '0'
      input.max = String(node.control.options.length - 1)
      input.step = '1'
      input.value = String(node.control.selectedIndex)
      Object.assign(element.style, { opacity: '0', zIndex: '2', pointerEvents: 'auto' })
    }
    if (node.control?.kind === 'select') {
      const select = element as HTMLSelectElement
      const labels = node.control.options.map(o => o.label)
      if (JSON.stringify(Array.from(select.options, o => o.text)) !== JSON.stringify(labels)) {
        select.replaceChildren(...labels.map((label, index) => Object.assign(options.container.ownerDocument.createElement('option'), { text: label, value: String(index) })))
      }
      select.value = String(node.control.selectedIndex)
      // Native paints the selected label as a child. A semantic HTML select
      // paints its own label, so consume that same authored text style.
      const label = node.children?.find(child => child.id === node.control?.parts.value)
      const labelStyle = label?.style
      if (labelStyle)
        applyQuiStyle(element.style, labelStyle)
      element.style.color = labelStyle?.color || style.color || 'inherit'
      element.style.padding = '0 20px'
      element.style.appearance = 'auto'
      element.style.lineHeight = 'normal'
      element.style.fontSize = `${labelStyle?.fontSize || style.fontSize || 22}px`
    }
    if (node.control?.kind === 'range') {
      const control = node.control
      const thumb = entries.get(control.parts.thumb)?.element
      if (thumb)
        thumb.style.outline = entry.focused ? '2px solid #294b43' : 'none'
    }
    if (entry.focused && node.control?.kind !== 'range' && !variant)
      element.style.outline = '2px solid currentColor'
    if (entry.assetUrl) {
      if (node.kind === 'Image')
        (element as HTMLImageElement).src = entry.assetUrl
      else element.style.backgroundImage = `url(${JSON.stringify(entry.assetUrl)})`
    }
    element.style.transition = node.transitions?.map(t => `${['transform', 'translate', 'scale'].includes(t.property) ? 'all' : t.property} ${t.durationMs}ms ${t.easing} ${t.delayMs || 0}ms`).join(',') || 'none'
  }
  function update(root: Node | undefined) {
    if (disposed)
      return
    lastRoot = root
    const seen = new Set<string>()
    const order = new Map<HTMLElement, HTMLElement[]>()
    const visit = (node: Node, parent: HTMLElement, parentX: number, parentY: number, inheritedProvenance?: Node['provenance'], parentVisible = true) => {
      if (seen.has(node.id))
        throw new Error(`Duplicate QUI node id: ${node.id}`)
      seen.add(node.id)
      let entry = entries.get(node.id)
      if (entry && (entry.node.kind !== node.kind || entry.node.control?.kind !== node.control?.kind)) {
        entry.asset?.dispose()
        entry.element.remove()
        entries.delete(node.id)
        entry = undefined
      }
      if (!entry) {
        entry = createEntry(node)
        entries.set(node.id, entry)
      }
      entry.effectiveVisible = parentVisible && node.visible
      entry.node = node
      entry.parentX = parentX
      entry.parentY = parentY
      const element = entry.element
      const siblings = order.get(parent) || []
      siblings.push(element)
      order.set(parent, siblings)
      element.removeAttribute('role')
      element.removeAttribute('aria-disabled')
      element.removeAttribute('aria-label')
      element.removeAttribute('tabindex')
      if (element.parentElement !== parent)
        parent.append(element)
      // Preserve DOM identities and focus across projection updates.
      element.dataset.quiKind = node.kind
      if (node.role === 'heading') {
        element.setAttribute('role', 'heading')
        element.setAttribute('aria-level', '2')
      }
      if (node.role === 'button') {
        element.setAttribute('role', 'button')
        element.setAttribute('aria-disabled', String(!node.intent || node.accessibility?.disabled === true))
      }
      if (node.accessibility?.label)
        element.setAttribute('aria-label', node.accessibility.label)
      if (node.accessibility?.pressed !== undefined)
        element.setAttribute('aria-pressed', String(node.accessibility.pressed))
      else element.removeAttribute('aria-pressed')
      if (!node.control && node.text !== undefined && element.textContent !== node.text)
        element.textContent = node.text
      const provenance = node.provenance || inheritedProvenance
      const image = node.image || node.style?.backgroundImage
      const identity = JSON.stringify([image, provenance, revision])
      if (entry.assetIdentity !== identity) {
        entry.assetIdentity = identity
        entry.asset?.dispose()
        entry.asset = undefined
        entry.assetUrl = undefined
        if (image) {
          const active = entry
          active.asset = new WebAssetUrlHandle({
            getAssets: () => options.assets,
            getType: () => image.assetType as AssetType,
            getName: () => image.assetName,
            getTargetPackageId: () => runtimePackageCandidatesFromMetadata(provenance as Record<string, unknown> | undefined),
            getRevision: () => revision,
            onChange: (state) => {
              if (disposed || active.assetIdentity !== identity)
                return
              active.assetUrl = state.url
              paintEntry(active)
              if (state.error)
                report(state.error)
            },
          })
          void active.asset.load()
        }
      }
      paintEntry(entry)
      // Range controls paint their shared subparts as siblings beneath the input.
      const childHost = node.control?.kind === 'range' ? parent : element
      const childX = node.control?.kind === 'range' ? parentX : node.bounds.x
      const childY = node.control?.kind === 'range' ? parentY : node.bounds.y
      if (node.control?.kind !== 'select') {
        for (const child of node.children || []) visit(child, childHost, childX, childY, provenance, entry.effectiveVisible)
      }
      if (node.kind === 'Scroll' && !entry.scrollInitialized) {
        element.scrollTop = node.scrollOffsetY || 0
        element.scrollLeft = node.scrollOffsetX || 0
        entry.scrollInitialized = true
      }
      if (node.control) {
        const labelId = node.id.replace(/-(slider-control|select|switch-track)$/, '-label')
        element.setAttribute('aria-label', entries.get(labelId)?.node.text || node.text || node.id)
      }
    }
    if (root)
      visit(root, options.container, 0, 0)
    for (const [parent, children] of order) {
      for (let index = 0; index < children.length; index++) {
        const child = children[index]!
        const before = parent.children[index] || null
        if (before !== child) {
          // moveBefore preserves active focus/selection in current browsers.
          if (typeof parent.moveBefore === 'function') {
            parent.moveBefore(child, before)
          }
          else {
            const focused = document.activeElement as HTMLElement | null
            parent.insertBefore(child, before)
            if (focused && child.contains(focused))
              focused.focus({ preventScroll: true })
          }
        }
      }
    }
    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        entry.asset?.dispose()
        entry.element.remove()
        entries.delete(id)
      }
    }
  }
  const scroll = (context: { event: { payload: unknown } }) => {
    const payload = context.event.payload as { elementId?: string, nodeId?: string, edge?: string }
    if (payload.elementId !== options.elementId || !payload.nodeId)
      return
    const element = entries.get(payload.nodeId)?.element
    if (element)
      element.scrollTop = payload.edge === 'start' ? 0 : element.scrollHeight
  }
  options.pipeline.on('native-ui/scroll', scroll)
  const refreshAssets = () => {
    revision++
    update(lastRoot)
  }
  options.assets?.on('asset:changed', refreshAssets)
  return {
    update,
    dispose() {
      disposed = true
      options.pipeline.off('native-ui/scroll', scroll)
      options.assets?.off('asset:changed', refreshAssets)
      for (const entry of entries.values()) {
        entry.asset?.dispose()
        entry.element.remove()
      }
      entries.clear()
    },
  }
}
