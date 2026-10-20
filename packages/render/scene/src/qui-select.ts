import type { NativeUiSurfaceNodeProjection as Node } from '@quajs/native-ui-compiler/runtime'
import type { SceneHostInputEvent, SceneHostNode } from '@quajs/scene-host'
import type { SceneRendererPluginContext } from './types'
import { clientPointToStageLogical } from '@quajs/render-core'

/** A transient list of projected options; only committing emits a settings intent. */
export function createSceneSelectPopup(context: SceneRendererPluginContext) {
  const { scene } = context
  const host = scene.host.nodes
  const layerId = 'qui:select-popup'
  let current: { node: Node, elementId: string, focus: number, offset: number, restore: () => void } | undefined
  let pressed: number | undefined
  const rows: SceneHostNode[] = []
  const close = () => {
    const previous = current
    current = undefined
    pressed = undefined
    rows.length = 0
    scene.clearLayer(layerId)
    previous?.restore()
  }
  const commit = async (index: number) => {
    const option = current?.node.control?.options[index]
    const elementId = current?.elementId
    close()
    if (option?.intent && elementId) {
      const { intent } = option
      await context.getPipeline().emit(intent.event, { ...intent.metadata, elementId, action: intent.action, choiceId: intent.choiceId })
    }
  }
  const draw = () => {
    if (!current?.node.control)
      return
    scene.clearLayer(layerId)
    rows.length = 0
    const { node, elementId, offset, focus } = current
    const control = node.control!
    const value = node.children?.find(child => child.id === control.parts?.value)
    const style = value?.style || node.style || {}
    const field = node.style || {}
    const hover = node.stateStyles?.hover?.style || {}
    const layout = scene.getStageLayout()
    const safe = layout.safeArea
    const rowHeight = Math.max(36, (style.lineHeight || style.fontSize || 24) + 20)
    const count = Math.min(control.options.length, 8, Math.max(1, Math.floor(safe.height / rowHeight) - 1))
    const height = count * rowHeight + 8
    const x = Math.max(safe.x, Math.min(node.bounds.x, safe.x + safe.width - node.bounds.width))
    const below = node.bounds.y + node.bounds.height + 6
    const y = below + height <= safe.y + safe.height ? below : Math.max(safe.y, node.bounds.y - height - 6)
    const layer = scene.getLayerNode(layerId, 'ui-select-popup', 100000000)
    const blocker = host.createNode('select-blocker', { parent: layer })
    host.setNodeTransform(blocker, { width: layout.logicalWidth, height: layout.logicalHeight })
    host.setNodeMetadata?.(blocker, { elementId, selectBlocker: true })
    const panel = host.createNode('select-list', { parent: layer })
    host.setNodeTransform(panel, { x, y, width: node.bounds.width, height })
    host.setNodeBoxStyle?.(panel, { backgroundColor: field.backgroundColor || '#15171d', borderColor: field.borderColor, borderWidth: 1, borderRadius: field.borderRadius || 4, boxShadow: { color: '#00000030', offsetX: 0, offsetY: 8, blurRadius: 24, spreadRadius: 0, inset: false } })
    host.setNodeMetadata?.(panel, { elementId, selectBlocker: true })
    control.options.slice(offset, offset + count).forEach((option, row) => {
      const index = row + offset
      const item = host.createNode('select-option', { parent: panel, name: `${node.id}:option:${index}` })
      rows.push(item)
      host.setNodeTransform(item, { x: 4, y: 4 + row * rowHeight, width: node.bounds.width - 8, height: rowHeight })
      host.setNodeBoxStyle?.(item, { backgroundColor: index === focus ? (hover.backgroundColor || '#ffffff20') : 'transparent', borderRadius: 3, borderWidth: index === control.selectedIndex ? 1 : 0, borderColor: hover.borderColor || field.borderColor })
      host.setNodeText(item, option.label, { fontSize: style.fontSize || 24, fontFamily: style.fontFamily?.join(',') || 'Noto Sans', color: style.color || '#ffffff', lineHeight: style.lineHeight, align: 'left', verticalAlign: 'center', padding: { top: 0, bottom: 0, left: 16, right: 16 } })
      host.setNodeMetadata?.(item, { elementId, selectOption: index })
    })
  }
  const focus = (index: number) => {
    if (!current?.node.control)
      return
    const next = Math.max(0, Math.min(current.node.control.options.length - 1, index))
    if (current.focus === next)
      return
    current.focus = next
    if (next < current.offset)
      current.offset = next
    if (next >= current.offset + rows.length)
      current.offset = next - rows.length + 1
    draw()
  }
  context.addDisposer(scene.registerKeyInterceptor(async (event) => {
    if (!current)
      return false
    if (event.phase === 'down') {
      const code = event.code || event.key
      if (code === 'Escape' || code === 'Tab')
        close()
      else if (code === 'ArrowDown' || code === 'ArrowRight')
        focus(current.focus + 1)
      else if (code === 'ArrowUp' || code === 'ArrowLeft')
        focus(current.focus - 1)
      else if (code === 'Home')
        focus(0)
      else if (code === 'End')
        focus(current.node.control!.options.length - 1)
      else if (code === 'Enter' || code === 'Space' || code === ' ')
        await commit(current.focus)
    }
    return true
  }))
  return {
    close,
    open(node: Node, elementId: string, restore: () => void) {
      close()
      if (!node.control?.options.length)
        return
      current = { node, elementId, focus: node.control.selectedIndex, offset: Math.max(0, node.control.selectedIndex - 7), restore }
      draw()
    },
    async input(event: SceneHostInputEvent): Promise<boolean> {
      if (event.kind === 'focus' && event.phase === 'blur') {
        close()
        return false
      }
      if (!current || event.kind !== 'pointer')
        return false
      const point = clientPointToStageLogical(scene.getStageLayout(), { clientX: event.x ?? 0, clientY: event.y ?? 0 })
      const hit = host.hitTest?.(scene.getRootNode(), point, { metadataKeys: ['selectOption', 'selectBlocker'] })
      const index = typeof hit?.metadata?.selectOption === 'number' ? hit.metadata.selectOption : undefined
      if (event.phase === 'move' && index !== undefined) {
        focus(index)
      }
      else if (event.phase === 'wheel') {
        focus(current.focus + (Number(event.metadata?.deltaY || 0) > 0 ? 1 : -1))
      }
      else if (event.phase === 'down') {
        pressed = index
      }
      else if (event.phase === 'up') {
        if (index !== undefined && index === pressed)
          await commit(index)
        else
          close()
      }
      return true
    },
  }
}
