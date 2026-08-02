import type { QuiChildren, QuiNode, QuiNodeKind } from './types'

export type { QuiNode } from './types'
export type { JSX } from './types'

// ─── Children normalisation ─────────────────────────────────────────────────

function flattenChildren(children: unknown): QuiNode[] {
  if (children === null || children === undefined || children === false)
    return []
  if (Array.isArray(children))
    return children.flatMap(c => flattenChildren(c))
  if (typeof children === 'object' && 'kind' in (children as object))
    return [children as QuiNode]
  return []
}

function parseClasses(classAttr: unknown): string[] {
  if (!classAttr || typeof classAttr !== 'string')
    return []
  return classAttr.split(/\s+/).filter(Boolean)
}

// ─── Core node builder ──────────────────────────────────────────────────────

function createNode(
  kind: QuiNodeKind,
  props: Record<string, unknown>,
  children: unknown,
  key?: string | null,
): QuiNode {
  const { class: classAttr, id, ...rest } = props
  return {
    kind,
    id: typeof id === 'string' ? id : undefined,
    classes: parseClasses(classAttr),
    props: rest,
    children: flattenChildren(children),
    key: key ?? null,
  }
}

// ─── JSX factory ────────────────────────────────────────────────────────────

/**
 * JSX factory consumed by the TypeScript compiler when a file has:
 *   @jsxImportSource @quajs/native-ui
 * or tsconfig "jsxImportSource": "@quajs/native-ui".
 *
 * Handles both component functions (PascalCase) and the Fragment symbol.
 */
export function jsx(
  type: QuiNodeKind | ((props: Record<string, unknown>) => QuiNode | null),
  props: Record<string, unknown> & { children?: QuiChildren },
  key?: string,
): QuiNode | null {
  const { children, ...rest } = props

  if (typeof type === 'function') {
    // User-defined component or one of the named component functions exported
    // from this package — call it directly so it can forward to createNode.
    const node = type({ ...rest, children, key }) ?? null
    // Function components forward props verbatim, so a JSX `key` would
    // otherwise strand in props instead of landing on the returned node.
    if (node && key != null && (node.key === null || node.key === undefined)) {
      return { ...node, key }
    }
    return node
  }

  // Should not normally be reached because all QUI components are exported as
  // named functions, but kept as a safe fallback for string-typed JSX.
  return createNode(type as QuiNodeKind, rest, children, key)
}

/** Used when JSX element has multiple static children (jsxs vs jsx). */
export const jsxs = jsx

/**
 * Fragment — used for <> … </> and <Fragment> … </Fragment>.
 * Produces a Fragment node whose children are flattened during projection.
 */
export function Fragment(props: { children?: QuiChildren }): QuiNode {
  return createNode('Fragment', {}, props.children, null)
}

// Export createNode and helpers for use by component implementations.
export { createNode, flattenChildren, parseClasses }
