export interface OrderedRendererLayer {
  id: string
  order?: number
}

export function sortRendererLayers<T extends OrderedRendererLayer>(layers: readonly T[]): T[] {
  return [...layers].sort((left, right) => {
    const order = (left.order ?? 0) - (right.order ?? 0)
    return order === 0 ? left.id.localeCompare(right.id) : order
  })
}
