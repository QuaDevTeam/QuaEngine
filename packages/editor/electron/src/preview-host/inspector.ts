import type { PreviewHandle, PreviewInspectorDetails, PreviewInspectorNode, PreviewInspectorTree } from '@quajs/editor-core'

interface CdpNode {
  nodeId: number
  nodeType: number
  shadowRootType?: string
  localName?: string
  nodeName: string
  nodeValue?: string
  attributes?: string[]
  children?: CdpNode[]
  shadowRoots?: CdpNode[]
  contentDocument?: CdpNode
}
export async function inspectTree(handle: PreviewHandle): Promise<PreviewInspectorTree> {
  if (!handle.cdp)
    throw new Error('此预览不支持 CDP 检查。')
  const result = await handle.cdp('DOM.getDocument', { depth: -1, pierce: true })
  let count = 0
  let truncated = false
  const read = (raw: CdpNode, depth: number): PreviewInspectorNode => {
    const attributes: Record<string, string> = {}
    for (let index = 0; index < (raw.attributes?.length || 0); index += 2)
      attributes[String(raw.attributes![index])] = String(raw.attributes![index + 1]).slice(0, 2048)
    const node: PreviewInspectorNode = { nodeId: raw.nodeId, nodeType: raw.nodeType, shadowRootType: raw.shadowRootType, name: String(raw.localName || raw.nodeName), value: String(raw.nodeValue || '').slice(0, 2048), attributes, children: [] }
    count++
    for (const child of [...raw.children || [], ...raw.shadowRoots || [], ...(raw.contentDocument ? [raw.contentDocument] : [])]) {
      if (count >= 10000 || depth >= 80) {
        truncated = true
        break
      }
      node.children.push(read(child, depth + 1))
    }
    return node
  }
  return { root: read(result.root as CdpNode, 0), truncated }
}
export async function inspectNode(handle: PreviewHandle, nodeId: number): Promise<PreviewInspectorDetails> {
  if (!handle.cdp || !Number.isSafeInteger(nodeId) || nodeId < 1)
    throw new Error('无效的检查节点。')
  const [box, css] = await Promise.allSettled([handle.cdp('DOM.getBoxModel', { nodeId }), handle.cdp('CSS.getComputedStyleForNode', { nodeId })])
  const result: PreviewInspectorDetails = { styles: [] }
  if (box.status === 'fulfilled') {
    const model = box.value.model as {
      border?: number[]
      width: number
      height: number
    }
    if (model?.border?.length === 8)
      result.box = { x: model.border[0], y: model.border[1], width: model.width, height: model.height }
  }
  if (css.status === 'fulfilled')
    result.styles = (css.value.computedStyle as PreviewInspectorDetails['styles'] || []).slice(0, 500)
  if (box.status === 'rejected' && css.status === 'rejected')
    throw new Error('节点已更新或没有布局，请刷新元素树。')
  return result
}
