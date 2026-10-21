import type { AssetType } from '@quajs/assets'
import type { NativeUiSurfaceIntentProjection as Intent, NativeUiSurfaceNodeProjection as Node } from '@quajs/native-ui-compiler/runtime'
import type { UiFeatureSurfaceEntry, UiFeatureSurfaceOverlay } from '@quajs/render-core'
import type { SceneHostNode } from '@quajs/scene-host'
import { clientPointToStageLogical, createUiFeatureSurfaceOverlays, resolveUiOverlayStackPlacement } from '@quajs/render-core'
import { defineSceneRendererPlugin } from './plugins/core'
import { createSceneProjectionTask } from './plugins/projection-task'
import { createSceneSelectPopup } from './qui-select'
import { runtimePackageCandidatesFromMetadata } from './utils'

export interface QuiSceneRendererOptions {
  surfaceKeys: readonly string[]
  features?: readonly UiFeatureSurfaceEntry[]
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
      const scrollPositions = new Map<string, { offset: number, requested: number, max: number }>()
      let hovered: string | undefined
      let pressed: string | undefined
      const states = new WeakMap<QuiSceneEntry, string | undefined>()
      const select = createSceneSelectPopup(context)
      const paint = (entry: QuiSceneEntry, state?: 'hover' | 'active') => {
        if (states.has(entry) && states.get(entry) === state)
          return
        states.set(entry, state)
        const variant = state ? entry.node.stateStyles?.[state] : undefined
        const style = { ...entry.node.style, ...variant?.style }
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
      const scrollTo = (entry: QuiSceneEntry, offset: number) => {
        const state = scrollPositions.get(`${entry.elementId}/${entry.node.id}`)
        if (!state)
          return
        const next = Math.max(0, Math.min(state.max, offset))
        const delta = next - state.offset
        state.offset = next
        for (const child of entries.values()) {
          if (child.parentId === entry.hostNode.id) {
            child.y += delta
            states.delete(child)
            paint(child)
          }
        }
      }
      const scrollRequest = (event: { event: { payload: unknown } }) => {
        const payload = (event.event.payload ?? {}) as { elementId?: string, nodeId?: string, edge?: string }
        const entry = [...entries.values()].find(entry => entry.elementId === payload.elementId && entry.node.id === payload.nodeId && entry.node.kind === 'Scroll')
        if (entry)
          scrollTo(entry, payload.edge === 'start' ? 0 : scrollPositions.get(`${entry.elementId}/${entry.node.id}`)?.max ?? 0)
      }
      context.getPipeline().on('native-ui/scroll', scrollRequest)
      context.addDisposer(() => context.getPipeline().off('native-ui/scroll', scrollRequest))
      const render = createSceneProjectionTask(context, 'qui', async (scene) => {
        select.close()
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
        if (view.ui.visible === false)
          return
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
          const parent = scene.getLayerNode(id, 'qui-layer', 100 + placement.stackPriority * 10000 + placement.zIndex)
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
            if (node.clipChildren)
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
            let scrollY = node.scrollOffsetY ?? 0
            if (node.kind === 'Scroll') {
              const key = `${overlay.elementId}/${node.id}`
              const max = Math.max(0, ...(node.children || []).map(child => child.bounds.y + child.bounds.height - node.bounds.y - node.bounds.height))
              const previous = scrollPositions.get(key)
              const requested = node.scrollOffsetY ?? 0
              const offset = Math.min(max, Math.max(0, previous?.requested === requested ? previous.offset : requested))
              scrollPositions.set(key, { offset, requested, max })
              scrollY = offset
            }
            for (const child of node.children || [])
              await renderNode(child, hostNode, node.bounds.x + (node.scrollOffsetX ?? 0), node.bounds.y + scrollY)
          }
          await renderNode(overlay.surface.root as Node, parent)
        }
      })
      const dispatch = async (intent: Intent | undefined, elementId: string) => {
        if (intent)
          await context.getPipeline().emit(intent.event, { ...intent.metadata, elementId, action: intent.action, choiceId: intent.choiceId })
      }
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
          scrollTo(scroll, state.offset + Number(event.metadata?.deltaY || 0) / context.scene.getStageLayout().scale)
          return
        }
        if (hovered && hovered !== hit?.node.id) {
          const previous = entries.get(hovered)
          if (previous)
            paint(previous)
        }
        hovered = hit?.node.id
        if (event.phase === 'down')
          pressed = entry?.hostNode.id
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
          select.open(entry.node, entry.elementId, () => setChevron('chevron-down'))
          setChevron('chevron-up')
        }
        else {
          const index = control.kind === 'switch'
            ? (control.selectedIndex === 1 ? 0 : 1)
            : Math.round(Math.max(0, Math.min(1, (point.x - entry.node.bounds.x) / entry.node.bounds.width)) * (control.options.length - 1))
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
