/** Read-only preview storage queries. Source ids are provider-owned, never filesystem paths. */
export interface PreviewStorageRequest {
  action: 'catalog' | 'page' | 'detail'
  source?: string
  key?: string
  offset?: number
  filter?: string
}
export interface PreviewStorageSource {
  id: string
  group: string
  label: string
  description: string
}
export interface PreviewStorageRow {
  key: string
  cells: string[]
  /** True only when the provider confirms resource bytes are resident in memory. */
  resident?: boolean
}
export interface PreviewMemoryResource {
  key: string
  name: string
  type: string
  targetPackageIds: readonly string[]
  refs: number
  estimatedBytes: number
}
export interface PreviewStorageResult {
  sources?: PreviewStorageSource[]
  columns?: string[]
  rows?: PreviewStorageRow[]
  hasMore?: boolean
  total?: number
  note?: string
  warning?: string
  detail?: {
    text: string
    format: 'json' | 'text' | 'hex'
    truncated: boolean
    bytes?: number
  }
}

export function validateStorageRequest(value: unknown): PreviewStorageRequest {
  const request = value as PreviewStorageRequest
  if (
    !request
    || !['catalog', 'page', 'detail'].includes(request.action)
    || (request.action !== 'catalog'
      && (typeof request.source !== 'string' || request.source.length > 4096))
    || (request.action === 'detail'
      && (typeof request.key !== 'string' || request.key.length > 4096))
    || (request.offset !== undefined
      && (!Number.isSafeInteger(request.offset)
        || request.offset < 0
        || request.offset > 100000))
      || (request.filter !== undefined
        && (typeof request.filter !== 'string' || request.filter.length > 256))
  ) {
    throw new Error('无效的存储查询。')
  }
  return {
    action: request.action,
    source: request.source,
    key: request.key,
    offset: request.offset ?? 0,
    filter: request.filter ?? '',
  }
}

/** Bounded, platform-neutral JSON projection; binary payloads remain in their storage backend. */
export function storageDetail(
  value: unknown,
): NonNullable<PreviewStorageResult['detail']> {
  let budget = 32000
  let truncated = false
  const seen = new Set<object>()
  const visit = (value: any, depth = 0): any => {
    if (budget <= 0 || depth > 12) {
      truncated = true
      return '[…]'
    }
    budget -= 16
    if (typeof value === 'string') {
      const part = value.slice(0, Math.max(0, Math.min(8000, budget)))
      budget -= part.length
      truncated ||= part.length !== value.length
      return part
    }
    if (typeof value === 'bigint')
      return `${value}n`
    if (value === null || typeof value !== 'object')
      return value
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
      return { type: value.constructor.name, byteLength: value.byteLength }
    if (value instanceof Date)
      return value.toISOString()
    if (seen.has(value))
      return '[Circular]'
    seen.add(value)
    const result: any = Array.isArray(value) ? [] : {}
    let count = 0
    for (const key in value) {
      if (!Object.hasOwn(value, key))
        continue
      if (++count > 100 || budget <= 0) {
        truncated = true
        break
      }
      // Define own keys rather than assigning __proto__ from stored content.
      const label = key.length > 512 ? `${key.slice(0, 500)}…#${count}` : key
      budget -= label.length
      truncated ||= label !== key
      Object.defineProperty(result, label, {
        value: visit(value[key], depth + 1),
        enumerable: true,
      })
    }
    return result
  }
  return {
    text: JSON.stringify(visit(value), null, 2) ?? 'undefined',
    format: 'json',
    truncated,
  }
}
