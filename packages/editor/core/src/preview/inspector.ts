/** Bounded, readonly CDP projection. Native exposes its actual QUI/QSS tree. */
export interface PreviewInspectorNode {
  nodeId: number
  nodeType: number
  shadowRootType?: string
  name: string
  value: string
  attributes: Record<string, string>
  children: PreviewInspectorNode[]
}
export interface PreviewInspectorTree {
  root: PreviewInspectorNode
  truncated: boolean
}
export interface PreviewInspectorDetails {
  box?: { x: number, y: number, width: number, height: number }
  styles: { name: string, value: string }[]
}
