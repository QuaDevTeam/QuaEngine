import type { AssetType } from '@quajs/assets'
import type { NativeUiSurfaceIntentProjection as Intent, NativeUiSurfaceNodeProjection as Node } from '@quajs/native-ui-compiler/runtime'
import type { UiFeatureSurfaceEntry, UiFeatureSurfaceOverlay } from '@quajs/render-core'
import type { SceneHostNode } from '@quajs/scene-host'
import { clientPointToStageLogical, createUiFeatureSurfaceOverlays, resolveUiOverlayStackPlacement, viewAllowsHudChrome } from '@quajs/render-core'
import { defineSceneRendererPlugin } from './plugins/core'
import { createSceneProjectionTask } from './plugins/projection-task'
import { createSceneSelectPopup } from './qui-select'
import { runtimePackageCandidatesFromMetadata } from './utils'

export interface QuiSceneRendererOptions {
  surfaceKeys: readonly string[]
  features?: readonly UiFeatureSurfaceEntry[]
}
interface ScrollAxis {
  requested: number
  offset: number
  max: number
}

function scrollAxis(requested: number, max: number, previous?: ScrollAxis): ScrollAxis {
  const offset = previous?.requested === requested ? previous.offset : requested
  return { requested, max, offset: Math.max(0, Math.min(max, offset)) }
}

interface QuiSceneEntry {
  node: Node
  hostNode: SceneHostNode
  elementId: string
  x: number
  y: number
  parentId: string
}

/** Transient nodes for the resolved QUI product UI shared with Web and native. */
export function createQuiSceneRendererPlugin(options: QuiSceneRendererOptions) {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/qui',
    setup(context) {
      const entries = new Map<string, QuiSceneEntry>()
      const layers = new Set<string>()
      const backdropDisposers = new Set<() => void>()
      const scrollPositions = new Map<string, { x: ScrollAxis, y: ScrollAxis }>()
      let topSurface: { elementId: string, order: number, modal: boolean } | undefined
      let focus: { elementId: string, nodeId: string } | undefined
      let hovered: string | undefined
      let pressed: string | undefined
      const isFocused = (entry: QuiSceneEntry) => focus?.elementId === entry.elementId && focus.nodeId === entry.node.id
      const states = new WeakMap<QuiSceneEntry, string | undefined>()
      const select = createSceneSelectPopup(context)
      const paint = (entry: QuiSceneEntry, state?: 'hover' | 'active' | 'focus-visible') => {
        if (!state && isFocused(entry))
          state = 'focus-visible'
        if (states.has(entry) && states.get(entry) === state)
          return
        states.set(entry, state)
        const variants = entry.node.stateStyles
        const variant = state === 'focus-visible' ? variants?.['focus-visible'] || variants?.focus || variants?.hover : state ? variants?.[state] : undefined
        const style = { ...entry.node.style, ...variant?.style }
        if (state === 'focus-visible' && !variant) {
          style.borderColor = style.color || '#ffffff'
          style.borderWidth = Math.max(2, style.borderWidth || 0)
        }
        const bounds = variant?.bounds || entry.node.bounds
        context.scene.host.nodes.setNodeTransform(entry.hostNode, { x: bounds.x - entry.x, y: bounds.y - entry.y, width: bounds.width, height: bounds.height, zIndex: entry.node.zIndex ?? 0, opacity: (entry.node.opacity ?? 1) * (style.opacity ?? 1) })
        if (context.scene.host.nodes.setNodeBoxStyle)
          context.scene.host.nodes.setNodeBoxStyle(entry.hostNode, { ...style, ...(entry.node.role === 'ui-select-chevron-down' ? { shape: 'chevron-down' as const } : {}) })
        else
          context.scene.host.nodes.setNodeColor?.(entry.hostNode, style.backgroundColor)
        if (entry.node.text) {
          context.scene.host.nodes.setNodeText(entry.hostNode, entry.node.text, {
            fontSize: style.fontSize ?? 24,
            fontFamily: style.fontFamily?.join(',') ?? 'Noto Sans',
            color: style.color ?? '#ffffff',
            lineHeight: style.lineHeight ?? (style.fontSize ?? 24) * 1.2,
            align: style.textAlign ?? 'left',
            letterSpacing: style.letterSpacing,
            fontWeight: style.fontWeight,
            padding: style.padding,
            verticalAlign: entry.node.kind === 'Button' || (bounds.height <= (style.lineHeight ?? 0) * 1.1 && !entry.node.text.includes('\n')) ? 'center' : 'top',
          })
        }
        context.scene.host.nodes.setNodeMetadata?.(entry.hostNode, {
          quiId: entry.node.id,
          ...(entry.node.intent || entry.node.control || ['Panel', 'Backdrop', 'Scroll'].includes(entry.node.kind) ? { elementId: entry.elementId } : {}),
          quiIntent: entry.node.intent,
          quiControl: entry.node.control,
          quiStyle: style,
          disabled: entry.node.accessibility?.disabled,
          quiKind: entry.node.kind,
        })
      }
      const scrollTo = (entry: QuiSceneEntry, x: number, y: number) => {
        const state = scrollPositions.get(`${entry.elementId}/${entry.node.id}`)
        if (!state)
          return
        const nextX = Math.max(0, Math.min(state.x.max, x))
        const nextY = Math.max(0, Math.min(state.y.max, y))
        const dx = nextX - state.x.offset
        const dy = nextY - state.y.offset
        state.x.offset = nextX
        state.y.offset = nextY
        for (const child of entries.values()) {
          if (child.parentId === entry.hostNode.id) {
            child.x += dx
            child.y += dy
            states.delete(child)
            paint(child)
          }
        }
      }
      const scrollRequest = (event: { event: { payload: unknown } }) => {
        const payload = (event.event.payload ?? {}) as { elementId?: string, nodeId?: string, edge?: string }
        const entry = [...entries.values()].find(entry => entry.elementId === payload.elementId && entry.node.id === payload.nodeId && entry.node.kind === 'Scroll')
        if (entry && (payload.edge === 'start' || payload.edge === 'end')) {
          const state = scrollPositions.get(`${entry.elementId}/${entry.node.id}`)
          if (state)
            scrollTo(entry, state.x.offset, payload.edge === 'start' ? 0 : state.y.max)
        }
      }
      context.getPipeline().on('native-ui/scroll', scrollRequest)
      context.addDisposer(() => context.getPipeline().off('native-ui/scroll', scrollRequest))
      const render = createSceneProjectionTask(context, 'qui', async (scene) => {
        select.close()
        topSurface = undefined
        entries.clear()
        for (const dispose of backdropDisposers)
          dispose()
        backdropDisposers.clear()
        hovered = undefined
        for (const id of layers) {
          scene.clearLayer(id)
          scene.releaseLayerResources(id)
        }
        const view = scene.getViewState()
        if (view.ui.visible === false) {
          scrollPositions.clear()
          return
        }
        const visibleScrollKeys = new Set<string>()
        const overlays: UiFeatureSurfaceOverlay[] = [
          ...Object.entries(view.ui.overlays || {}).flatMap(([elementId, overlay]) => overlay.surface && options.surfaceKeys.includes(overlay.surface.key) ? [{ ...overlay, renderMode: 'render-only' as const, elementId, surface: overlay.surface }] : []),
          ...createUiFeatureSurfaceOverlays(view as unknown as Record<string, unknown>, options.features),
        ]
        for (const overlay of overlays) {
          if (overlay.visible === false || !overlay.surface.root)
            continue
          const id = `qui:${overlay.elementId}`
          layers.add(id)
          const placement = resolveUiOverlayStackPlacement({ overlayStack: overlay.overlayStack, stackPriority: overlay.stackPriority, zIndex: overlay.zIndex })
          const order = 100 + placement.stackPriority * 10000 + placement.zIndex
          if (!topSurface || order >= topSurface.order)
            topSurface = { elementId: overlay.elementId, order, modal: overlay.interactive === true || !viewAllowsHudChrome(view) }
          const parent = scene.getLayerNode(id, 'qui-layer', order)
          const renderNode = async (node: Node, parent: SceneHostNode, parentX = 0, parentY = 0) => {
            if (!node.visible)
              return
            const hostNode = scene.host.nodes.createNode(node.kind, { parent, name: node.id })
            const entry = { node, hostNode, elementId: overlay.elementId, x: parentX, y: parentY, parentId: parent.id }
            entries.set(hostNode.id, entry)
            paint(entry)
            if (node.style?.backdropFilter?.blurRadius && scene.host.capture?.captureBackdrop) {
              // Capture the underlying scene after clearing previous QUI layers.
              const layout = scene.getStageLayout()
              scene.host.nodes.setNodeBoxStyle?.(hostNode, { ...node.style, backgroundColor: 'transparent' })
              await scene.waitForAssets?.()
              // Hosts prefilter and blur their captures. A single large resize
              // here aliases fine detail before the Gaussian can remove it.
              const backdrop = await scene.host.capture.captureBackdrop({ x: layout.viewportX, y: layout.viewportY, width: layout.viewportWidth, height: layout.viewportHeight })
              backdropDisposers.add(backdrop.dispose)
              const image = scene.host.nodes.createNode('backdrop-image', { parent: hostNode })
              scene.host.nodes.setNodeTransform(image, { width: node.bounds.width, height: node.bounds.height })
              scene.host.nodes.setNodeSprite(image, backdrop.resource, { mode: 'sprite', filter: { blur: node.style.backdropFilter.blurRadius } })
              const tint = scene.host.nodes.createNode('backdrop-tint', { parent: hostNode })
              scene.host.nodes.setNodeTransform(tint, { width: node.bounds.width, height: node.bounds.height })
              scene.host.nodes.setNodeColor?.(tint, node.style.backgroundColor)
            }
            if (node.clipChildren || node.kind === 'Scroll')
              scene.host.nodes.setNodeTransform(hostNode, { clip: { x: 0, y: 0, width: node.bounds.width, height: node.bounds.height } })
            const image = node.image || node.style?.backgroundImage
            if (image) {
              let resource
              for (const targetPackageId of runtimePackageCandidatesFromMetadata({ ...overlay, ...node.provenance }) || []) {
                resource = await scene.resolveAsset(image.assetType as AssetType, image.assetName, { targetPackageId })
                if (resource)
                  break
              }
              resource ||= await scene.resolveAsset(image.assetType as AssetType, image.assetName)
              if (resource) {
                const fit = node.style?.objectFit ?? node.style?.backgroundSize ?? 'fill'
                if (fit === 'cover' || fit === 'contain' || fit === 'none') {
                  const width = resource.width ?? node.bounds.width
                  const height = resource.height ?? node.bounds.height
                  const scale = fit === 'none' ? 1 : (fit === 'cover' ? Math.max : Math.min)(node.bounds.width / width, node.bounds.height / height)
                  const position = node.style?.objectPosition ?? node.style?.backgroundPosition ?? { x: 0.5, y: 0.5 }
                  const px = position.x
                  const py = position.y
                  const imageNode = scene.host.nodes.createNode('image', { parent: hostNode, name: `${node.id}:image` })
                  const tiled = !!node.style?.backgroundImage && fit === 'none'
                  scene.host.nodes.setNodeTransform(imageNode, { x: tiled ? 0 : (node.bounds.width - width * scale) * px, y: tiled ? 0 : (node.bounds.height - height * scale) * py, width: tiled ? node.bounds.width : width * scale, height: tiled ? node.bounds.height : height * scale })
                  scene.host.nodes.setNodeSprite(imageNode, resource, { mode: tiled ? 'tiled' : 'sprite' })
                  scene.host.nodes.setNodeTransform(hostNode, { clip: { x: 0, y: 0, width: node.bounds.width, height: node.bounds.height } })
                }
                else {
                  scene.host.nodes.setNodeSprite(hostNode, resource, { mode: 'sprite' })
                }
                scene.setLayerResource(id, node.id, resource)
              }
            }
            let scrollX = 0
            let scrollY = 0
            if (node.kind === 'Scroll') {
              const key = `${overlay.elementId}/${node.id}`
              visibleScrollKeys.add(key)
              const previous = scrollPositions.get(key)
              let maxX = 0
              let maxY = 0
              for (const child of node.children || []) {
                if (child.visible) {
                  maxX = Math.max(maxX, child.bounds.x + child.bounds.width - node.bounds.x - node.bounds.width)
                  maxY = Math.max(maxY, child.bounds.y + child.bounds.height - node.bounds.y - node.bounds.height)
                }
              }
              const x = scrollAxis(node.scrollOffsetX ?? 0, maxX, previous?.x)
              const y = scrollAxis(node.scrollOffsetY ?? 0, maxY, previous?.y)
              scrollPositions.set(key, { x, y })
              scrollX = x.offset
              scrollY = y.offset
            }
            for (const child of node.children || [])
              await renderNode(child, hostNode, node.bounds.x + scrollX, node.bounds.y + scrollY)
          }
          const anchor = overlay.surface.safeAreaAnchor
          const { aspectSafeArea: authored, safeArea: safe } = scene.getStageLayout()
          const shift = (axis: 'x' | 'y', extent: 'width' | 'height', factor: number) =>
            safe[axis] - authored[axis] + (safe[extent] - authored[extent]) * Math.max(0, Math.min(1, factor))
          const anchored = anchor && anchor.length === 2 && anchor.every(Number.isFinite)
          await renderNode(overlay.surface.root as Node, parent, anchored ? -shift('x', 'width', anchor[0]) : 0, anchored ? -shift('y', 'height', anchor[1]) : 0)
        }
        if (focus && ![...entries.values()].some(isFocused))
          focus = undefined
        for (const key of scrollPositions.keys()) {
          if (!visibleScrollKeys.has(key))
            scrollPositions.delete(key)
        }
      })
      const dispatch = async (intent: Intent | undefined, elementId: string) => {
        if (intent)
          await context.getPipeline().emit(intent.event, { ...intent.metadata, elementId, action: intent.action, choiceId: intent.choiceId })
      }
      const displayedBounds = (entry: QuiSceneEntry) => {
        const bounds = { ...entry.node.bounds, x: 0, y: 0 }
        for (let current: QuiSceneEntry | undefined = entry; current; current = entries.get(current.parentId)) {
          bounds.x += current.node.bounds.x - current.x
          bounds.y += current.node.bounds.y - current.y
        }
        return bounds
      }
      const setFocus = (next?: QuiSceneEntry) => {
        const previous = focus && [...entries.values()].find(isFocused)
        focus = next && { elementId: next.elementId, nodeId: next.node.id }
        if (previous)
          paint(previous)
        if (next)
          paint(next)
      }
      context.addDisposer(context.scene.registerKeyInterceptor(async (event) => {
        const command = event.metadata?.command
        if (event.kind !== 'gamepad' || !topSurface || !context.getViewState().ui.visible || !['choice:previous', 'choice:next', 'choice:confirm'].includes(String(command)))
          return false
        if (!topSurface.modal && context.getViewState().choices.some(choice => choice.enabled))
          return false
        const buttons = [...entries.values()].filter((entry) => {
          const { node } = entry
          if (topSurface?.elementId !== entry.elementId || node.accessibility?.disabled || node.kind === 'Backdrop' || (!node.intent && !node.control))
            return false
          const bounds = displayedBounds(entry)
          const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
          const scene = context.scene
          if (!scene.host.nodes.hitTest)
            return true
          return scene.host.nodes.hitTest(scene.getRootNode(), point, { metadataKeys: ['elementId', 'choiceId'] })?.node.id === entry.hostNode.id
        })
        const index = buttons.findIndex(isFocused)
        const confirm = command === 'choice:confirm'
        if (!topSurface.modal && confirm && index < 0)
          return false
        if (!buttons.length || event.phase === 'up' || event.repeat)
          return topSurface.modal || index >= 0
        const delta = command === 'choice:previous' ? -1 : 1
        const entry = buttons[index]
        const control = entry?.node.control
        if (entry && control && control.kind !== 'switch' && [14, 15].includes(Number(event.metadata?.button))) {
          const next = Math.min(control.options.length - 1, Math.max(0, control.selectedIndex + delta))
          if (next !== control.selectedIndex)
            await dispatch(control.options[next]?.intent, entry.elementId)
        }
        else if (confirm) {
          const target = entry || buttons[0]!
          setFocus(target)
          const field = target.node.control
          if (!field)
            await dispatch(target.node.intent, target.elementId)
          else if (field.kind === 'switch')
            await dispatch(field.options[field.selectedIndex === 1 ? 0 : 1]?.intent, target.elementId)
        }
        else {
          const next = index < 0 ? (delta > 0 ? 0 : buttons.length - 1) : (index + delta + buttons.length) % buttons.length
          setFocus(buttons[next])
        }
        return true
      }))
      context.addDisposer(context.scene.host.input.onInput(async (event) => {
        if (await select.input(event))
          return
        const clearHover = () => {
          const previous = hovered && entries.get(hovered)
          if (previous)
            paint(previous)
          hovered = undefined
        }
        if (event.kind === 'focus' && event.phase === 'blur') {
          setFocus()
          clearHover()
          pressed = undefined
        }
        if (event.kind !== 'pointer' || event.x === undefined || event.y === undefined || context.getViewState().ui.visible === false)
          return
        const point = clientPointToStageLogical(context.scene.getStageLayout(), { clientX: event.x, clientY: event.y })
        if (!point.insideStage) {
          clearHover()
          if (event.phase === 'up')
            pressed = undefined
          return
        }
        const hit = context.scene.host.nodes.hitTest?.(context.scene.getRootNode(), point, { metadataKeys: ['elementId', 'choiceId'] })
        const entry = hit && entries.get(hit.node.id)
        if (event.phase === 'wheel') {
          let scroll = entry
          while (scroll && scroll.node.kind !== 'Scroll')
            scroll = entries.get(scroll.parentId)
          if (!scroll)
            return
          const state = scrollPositions.get(`${scroll.elementId}/${scroll.node.id}`)
          if (!state)
            return
          const scale = context.scene.getStageLayout().scale
          const dx = Number(event.metadata?.deltaX || 0) / scale
          const dy = Number(event.metadata?.deltaY || 0) / scale
          if (Number.isFinite(dx) && Number.isFinite(dy))
            scrollTo(scroll, state.x.offset + dx, state.y.offset + dy)
          return
        }
        if (hovered && hovered !== hit?.node.id) {
          const previous = entries.get(hovered)
          if (previous)
            paint(previous)
        }
        hovered = hit?.node.id
        if (event.phase === 'down') {
          setFocus()
          pressed = entry?.hostNode.id
        }
        if (!entry || entry.node.accessibility?.disabled) {
          if (event.phase === 'up')
            pressed = undefined
          return
        }
        paint(entry, event.phase === 'down' ? 'active' : 'hover')
        if (event.phase !== 'up')
          return
        const clicked = pressed === entry.hostNode.id
        pressed = undefined
        if (!clicked)
          return
        const bounds = displayedBounds(entry)
        const control = entry.node.control
        if (!control) {
          await dispatch(entry.node.intent, entry.elementId)
        }
        else if (control.kind === 'select') {
          const chevron = [...entries.values()].find(child => child.node.id === control.parts?.chevron && child.elementId === entry.elementId)
          const setChevron = (shape: 'chevron-down' | 'chevron-up') => {
            if (chevron)
              context.scene.host.nodes.setNodeBoxStyle?.(chevron.hostNode, { ...chevron.node.style, shape })
          }
          select.open({ ...entry.node, bounds }, entry.elementId, () => setChevron('chevron-down'))
          setChevron('chevron-up')
        }
        else {
          const index = control.kind === 'switch'
            ? (control.selectedIndex === 1 ? 0 : 1)
            : Math.round(Math.max(0, Math.min(1, (point.x - bounds.x) / bounds.width)) * (control.options.length - 1))
          await dispatch(control.options[index]?.intent, entry.elementId)
        }
      }))
      context.addDisposer(() => {
        select.close()
        entries.clear()
        scrollPositions.clear()
        for (const dispose of backdropDisposers)
          dispose()
        backdropDisposers.clear()
        for (const id of layers) {
          context.scene.clearLayer(id)
          context.scene.releaseLayerResources(id)
        }
      })
      void render()
    },
  })
}
