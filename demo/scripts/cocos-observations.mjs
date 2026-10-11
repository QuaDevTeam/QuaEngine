export function readCocosSnapshot() {
  const debug = globalThis.__QUA_COCOS__
  const host = debug.host.nodes
  const root = host.getRootNode()
  const camera = root.native.getComponent('cc.Canvas')?.cameraComponent
  const layout = debug.renderer.getSnapshot().stageLayout
  const originX = (camera?.node.worldPosition.x ?? layout.containerWidth / 2) - layout.containerWidth / 2
  const originY = (camera?.node.worldPosition.y ?? layout.containerHeight / 2) - layout.containerHeight / 2
  const nodes = []
  function walk(node, parent) {
    const native = node.native
    const ui = native.getComponent('cc.UITransform')
    const position = native.worldPosition
    const scale = native.worldScale
    const labelNode = native.children.find(n => n.name === 'qua-label' || n.name === 'qua-rich-text')
    const label = labelNode && (labelNode.getComponent('cc.Label') || labelNode.getComponent('cc.RichText'))
    nodes.push({ id: node.id, name: node.name, kind: node.kind, parent, metadata: host.getNodeMetadata(node), transform: node.transform, actual: ui ? { x: position.x - originX - ui.anchorX * ui.width * scale.x, y: position.y - originY - ui.anchorY * ui.height * scale.y, width: ui.width * scale.x, height: ui.height * scale.y } : undefined, text: label?.string, font: label?.font?.name, fontSize: label?.fontSize, active: native.activeInHierarchy })
    for (const child of host.getNodeChildren(node)) walk(child, node.id)
  }
  walk(root)
  return { view: debug.view(), diagnostics: debug.diagnostics(), layout: debug.renderer.getSnapshot().stageLayout, nodes }
}
