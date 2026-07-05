export function withDefaultVisible<T>(value: T): T {
  if (Array.isArray(value))
    return value.map(item => withDefaultVisible(item)) as T

  if (!value || typeof value !== 'object')
    return value

  const record = value as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(record))
    next[key] = withDefaultVisible(child)

  if (typeof next.kind === 'string' && next.bounds && next.visible === undefined)
    next.visible = true

  return next as T
}
