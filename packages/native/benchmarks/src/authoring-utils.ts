import type {
  NativeQuiAstNode,
  NativeUiSurfaceNodeProjection,
} from '@quajs/native-ui-compiler'

export interface QuiAstCounts {
  components: number
  nodes: number
  slots: number
}

export interface SurfaceProjectionCounts {
  intents: number
  nodes: number
  styleFields: number
  textNodes: number
}

export function countQuiAst(nodes: readonly NativeQuiAstNode[]): QuiAstCounts {
  const counts = {
    components: 0,
    nodes: 0,
    slots: 0,
  }
  for (const node of nodes) {
    counts.nodes += 1
    if (node.kind === 'component')
      counts.components += 1
    else
      counts.slots += 1
    const childCounts = countQuiAst(node.children)
    counts.components += childCounts.components
    counts.nodes += childCounts.nodes
    counts.slots += childCounts.slots
  }
  return counts
}

export function countSurfaceProjection(
  node: NativeUiSurfaceNodeProjection | undefined,
): SurfaceProjectionCounts {
  if (!node) {
    return {
      intents: 0,
      nodes: 0,
      styleFields: 0,
      textNodes: 0,
    }
  }

  const children = node.children ?? []
  const childCounts = children.map(countSurfaceProjection)
  return {
    intents: (node.intent ? 1 : 0) + sumMetric(childCounts, 'intents'),
    nodes: 1 + sumMetric(childCounts, 'nodes'),
    styleFields: Object.keys(node.style ?? {}).length + sumMetric(childCounts, 'styleFields'),
    textNodes: (node.text ? 1 : 0) + sumMetric(childCounts, 'textNodes'),
  }
}

export function createInvalidAssetSourceFixture(): string {
  return Array.from({ length: 16 }, (_, index) =>
    `Image(src: "../escape-${index}.png", asset-type: "../bad-${index}")`,
  ).join('\n')
}

export function positionAtOffset(source: string, offset: number): { character: number, line: number } {
  const safeOffset = Math.max(0, Math.min(source.length, offset))
  const before = source.slice(0, safeOffset)
  const lines = before.split(/\r?\n/)
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length,
  }
}

function sumMetric(items: readonly SurfaceProjectionCounts[], key: keyof SurfaceProjectionCounts): number {
  return items.reduce((total, item) => total + item[key], 0)
}
