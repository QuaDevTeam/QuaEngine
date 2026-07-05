import type {
  NativeQssDocument,
  NativePackageProvenance,
  NativeQuiAstNode,
  NativeQuiDocument,
  NativeUiSurfaceNodeKind,
  NativeUiSurfaceProjection,
  NativeUiSurfaceRect,
} from './types'
import {
  conditionalBranch,
  conditionalBranchValue,
  evaluateQuiCondition,
  loopIterationsForNode,
} from './projection-directives'
import {
  templateBooleanProp,
  type NativeUiTemplateScope,
} from './projection-template'
import {
  compositeExpansionForNode,
  scopedNumberPropResolver,
  type NativeQuiSlotContent,
} from './projection-composites'
import {
  imageFromProps,
  intentFromNode,
  isSupportedSurfaceKind,
  nodeId,
  packageProvenanceFromOptions,
  textFromNode,
} from './projection-node-values'
import {
  pruneSurfaceNode,
  rectFromProps,
  ZERO_RECT,
} from './projection-node-helpers'
import {
  applyNativeQssStructuralLayout,
  stripNativeQssCompilerLayout,
  type NativeUiCompilerSurfaceNodeProjection,
} from './projection-layout'
import { resolveStyleForNode } from './projection-selectors'

export interface CompileNativeUiSurfaceProjectionOptions {
  components?: Readonly<Record<string, NativeQuiDocument>>
  contentPackageId?: string
  context?: Record<string, unknown>
  qss?: NativeQssDocument | readonly NativeQssDocument[]
  requiredRuntimePackages?: readonly string[]
  rootId?: string
}

interface QuiProjectionContext {
  ancestors: readonly NativeQuiAstNode[]
  componentStack: readonly string[]
  components: Readonly<Record<string, NativeQuiDocument>>
  parentBounds?: NativeUiSurfaceRect
  scope: NativeUiTemplateScope
  slots?: Readonly<Record<string, NativeQuiSlotContent>>
  suppressLoop?: boolean
}

export function compileNativeUiSurfaceProjection(
  qui: NativeQuiDocument,
  options: CompileNativeUiSurfaceProjectionOptions = {},
): NativeUiSurfaceProjection {
  const qssDocuments = Array.isArray(options.qss)
    ? options.qss
    : options.qss ? [options.qss] : []
  const provenance = packageProvenanceFromOptions(options)
  const rootChildren = surfaceNodesFromQuiChildren(qui.source, qui.tree, {
    ancestors: [],
    componentStack: [],
    components: options.components || {},
    scope: {
      context: options.context,
      hasContext: options.context !== undefined,
    },
  }, qssDocuments, provenance)

  if (rootChildren.length === 0)
    return {}

  if (rootChildren.length === 1 && !options.rootId)
    return { root: stripNativeQssCompilerLayout(rootChildren[0]) }

  return {
    root: stripNativeQssCompilerLayout(pruneSurfaceNode({
      id: options.rootId || 'root',
      kind: 'Fragment',
      bounds: { ...ZERO_RECT },
      visible: true,
      ...(provenance ? { provenance } : {}),
      children: rootChildren,
    }) as NativeUiCompilerSurfaceNodeProjection),
  }
}

function surfaceNodeFromQuiNode(
  source: string,
  node: NativeQuiAstNode,
  context: QuiProjectionContext,
  qssDocuments: readonly NativeQssDocument[],
  provenance: NativePackageProvenance | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  const iterations = context.suppressLoop ? undefined : loopIterationsForNode(node, context.scope)
  if (iterations) {
    return iterations.flatMap(iteration =>
      surfaceNodeFromQuiNode(source, node, {
        ...context,
        scope: iteration.scope,
        suppressLoop: true,
      }, qssDocuments, provenance))
  }

  if (node.kind === 'slot')
    return surfaceNodesFromQuiSlot(source, node, context, qssDocuments, provenance)

  if (node.kind !== 'component')
    return surfaceNodesFromQuiChildren(source, node.children, context, qssDocuments, provenance)

  if (!isSupportedSurfaceKind(node.name)) {
    return surfaceNodesFromCompositeNode(
      source,
      node,
      context,
      qssDocuments,
      provenance,
    )
  }

  const resolvedStyle = resolveStyleForNode({ node, ancestors: context.ancestors }, qssDocuments)
  const resolveNumberProp = scopedNumberPropResolver(context.scope)
  const rect = rectFromProps(node.props, resolvedStyle.bounds, context.parentBounds, resolveNumberProp)
  const childContext: QuiProjectionContext = {
    ...context,
    ancestors: [...context.ancestors, node],
    parentBounds: rect,
    scope: {
      ...context.scope,
      currentLoopKey: undefined,
    },
  }
  const children = applyNativeQssStructuralLayout(
    node.name as NativeUiSurfaceNodeKind,
    rect,
    surfaceNodesFromQuiChildren(source, node.children, childContext, qssDocuments, provenance),
    resolvedStyle.layout,
  )
  const text = textFromNode(source, node, context.scope)
  const image = imageFromProps(node.props)
  const intent = resolvedStyle.interactive === false
    ? undefined
    : intentFromNode(node, context.scope)
  const id = nodeId(node, context.scope)

  const surfaceNode: NativeUiCompilerSurfaceNodeProjection = {
    id,
    kind: node.name as NativeUiSurfaceNodeKind,
    bounds: rect,
    clipChildren: resolvedStyle.clipChildren,
    visible: templateBooleanProp(node.props, 'show', context.scope) ?? resolvedStyle.visible ?? true,
    zIndex: resolvedStyle.zIndex,
    opacity: resolveNumberProp(node.props, 'opacity'),
    scrollOffsetX: resolveNumberProp(node.props, 'scroll-x'),
    scrollOffsetY: resolveNumberProp(node.props, 'scroll-y'),
    text,
    image,
    intent,
    style: resolvedStyle.style,
    compilerLayout: resolvedStyle.layout,
    ...(provenance ? { provenance } : {}),
    children,
  }

  return [pruneSurfaceNode(surfaceNode) as NativeUiCompilerSurfaceNodeProjection]
}

function surfaceNodesFromQuiSlot(
  source: string,
  node: NativeQuiAstNode,
  context: QuiProjectionContext,
  qssDocuments: readonly NativeQssDocument[],
  provenance: NativePackageProvenance | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  const content = context.slots?.[node.name]
    ?? (node.name === 'default' ? context.slots?.default : undefined)
  if (content) {
    return surfaceNodesFromQuiChildren(
      content.source,
      content.nodes,
      context,
      qssDocuments,
      provenance,
    )
  }

  return surfaceNodesFromQuiChildren(source, node.children, context, qssDocuments, provenance)
}

function surfaceNodesFromCompositeNode(
  source: string,
  node: NativeQuiAstNode,
  context: QuiProjectionContext,
  qssDocuments: readonly NativeQssDocument[],
  provenance: NativePackageProvenance | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  const component = context.components[node.name]
  if (!component || context.componentStack.includes(node.name))
    return surfaceNodesFromQuiChildren(source, node.children, context, qssDocuments, provenance)

  const expansion = compositeExpansionForNode(
    source,
    node,
    component,
    context.scope,
    context.componentStack,
  )

  return surfaceNodesFromQuiChildren(expansion.component.source, expansion.component.tree, {
    ...context,
    componentStack: expansion.componentStack,
    scope: expansion.scope,
    slots: expansion.slots,
  }, qssDocuments, provenance)
}

function surfaceNodesFromQuiChildren(
  source: string,
  nodes: readonly NativeQuiAstNode[],
  context: QuiProjectionContext,
  qssDocuments: readonly NativeQssDocument[],
  provenance: NativePackageProvenance | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  const projected: NativeUiCompilerSurfaceNodeProjection[] = []
  let branchMatched = false
  let branchOpen = false

  for (const node of nodes) {
    const branch = conditionalBranch(node)
    let include = true

    if (branch === 'if') {
      const value = evaluateQuiCondition(conditionalBranchValue(node, branch), context.scope)
      include = value ?? !context.scope.hasContext
      branchMatched = include
      branchOpen = true
    }
    else if (branch === 'else-if') {
      if (!branchOpen) {
        include = false
      }
      else if (branchMatched) {
        include = false
      }
      else {
        const value = evaluateQuiCondition(conditionalBranchValue(node, branch), context.scope)
        include = value ?? !context.scope.hasContext
        branchMatched = include
      }
    }
    else if (branch === 'else') {
      include = branchOpen && !branchMatched
      branchMatched = branchOpen
    }
    else {
      branchOpen = false
      branchMatched = false
    }

    if (include)
      projected.push(...surfaceNodeFromQuiNode(source, node, context, qssDocuments, provenance))
  }

  return projected
}
