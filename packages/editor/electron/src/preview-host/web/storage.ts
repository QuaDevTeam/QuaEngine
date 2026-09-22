import type {
  PreviewStorageRequest,
  PreviewStorageResult,
} from '@quajs/editor-core'

/** Fixed read-only program executed in the preview, never in the workbench's origin. */
export async function queryWebStorage(
  request: PreviewStorageRequest,
): Promise<PreviewStorageResult> {
  const limit = 50
  const offset = request.offset ?? 0
  const filter = (request.filter ?? '').toLowerCase()
  const text = (value: unknown, max = 500) => String(value ?? '').slice(0, max)
  const detail = (value: any): NonNullable<PreviewStorageResult['detail']> => {
    let budget = 32000
    let truncated = false
    const seen = new Set<object>()
    const visit = (item: any, depth = 0): any => {
      if (budget <= 0 || depth > 12) {
        truncated = true
        return '[…]'
      }
      budget -= 16
      if (typeof item === 'string') {
        const value = item.slice(0, Math.max(0, Math.min(8000, budget)))
        budget -= value.length
        truncated ||= value.length !== item.length
        return value
      }
      if (typeof item === 'bigint')
        return `${item}n`
      if (!item || typeof item !== 'object')
        return item
      if (item instanceof Blob)
        return { type: 'Blob', mime: item.type, bytes: item.size }
      if (item instanceof ArrayBuffer || ArrayBuffer.isView(item))
        return { type: item.constructor.name, bytes: item.byteLength }
      if (item instanceof Date)
        return item.toISOString()
      if (seen.has(item))
        return '[Circular]'
      seen.add(item)
      const result: any = Array.isArray(item) ? [] : {}
      let count = 0
      for (const key in item) {
        if (!Object.hasOwn(item, key))
          continue
        if (++count > 100 || budget <= 0) {
          truncated = true
          break
        }
        const label = key.length > 512 ? `${key.slice(0, 500)}…#${count}` : key
        budget -= label.length
        truncated ||= label !== key
        Object.defineProperty(result, label, {
          value: visit(item[key], depth + 1),
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
  const encodeKey = (key: any, depth = 0): any => {
    if (depth > 16)
      return { unavailable: 'Key 嵌套过深' }
    if (key instanceof Date)
      return { date: key.getTime() }
    if (key instanceof ArrayBuffer)
      return key.byteLength > 1024 ? { unavailable: '二进制 Key 超过 1 KB' } : { binary: Array.from(new Uint8Array(key)) }
    return Array.isArray(key) ? key.map(value => encodeKey(value, depth + 1)) : key
  }
  const decodeKey = (key: any): IDBValidKey => {
    if (Array.isArray(key))
      return key.map(decodeKey)
    if (key && typeof key === 'object') {
      if (key.unavailable)
        throw new Error(key.unavailable)
      if (typeof key.date === 'number')
        return new Date(key.date)
      if (Array.isArray(key.binary))
        return new Uint8Array(key.binary).buffer
      throw new Error('无效的 IndexedDB Key。')
    }
    return key
  }
  const open = (name: string) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const op = indexedDB.open(name)
      let expired = false
      const timer = setTimeout(() => {
        expired = true
        reject(new Error('IndexedDB 打开超时。'))
      }, 5000)
      op.onblocked = () => {
        expired = true
        clearTimeout(timer)
        reject(new Error('IndexedDB 被其他连接阻塞。'))
      }
      // An inspection must never create a database that disappeared after catalog discovery.
      op.onupgradeneeded = () => {
        expired = true
        op.transaction?.abort()
      }
      op.onerror = () => {
        clearTimeout(timer)
        reject(new Error('数据库已更新或被删除，请刷新。'))
      }
      op.onsuccess = () => {
        clearTimeout(timer)
        if (expired) {
          op.result.close()
          return
        }
        resolve(op.result)
      }
    })
  const sources: NonNullable<PreviewStorageResult['sources']> = []
  const source = (
    parts: string[],
    group: string,
    label: string,
    description: string,
  ) => sources.push({ id: JSON.stringify(parts), group, label, description })
  const lifetime = `${location.origin}，当前预览隔离会话，停止后清除`
  const inspectResources = async (query: PreviewStorageRequest): Promise<PreviewStorageResult> => {
    const controller = (globalThis as any).__QUA_EDITOR_PREVIEW__
    if (typeof controller !== 'function')
      throw new Error('项目未提供渲染资源信息。')
    const result = await controller({ action: 'storage', request: query })
    return result.storage
  }
  if (request.source === 'renderer:resources')
    return inspectResources(request)
  if (request.action === 'catalog') {
    source(['local'], 'Web Storage', 'Local Storage', lifetime)
    source(['session'], 'Web Storage', 'Session Storage', lifetime)
    const databases = await indexedDB.databases()
    for (const entry of databases.slice(0, 32)) {
      if (sources.length >= 256)
        break
      if (!entry.name)
        continue
      const db = await open(entry.name)
      try {
        for (const table of Array.from(db.objectStoreNames).slice(0, 64)) {
          if (sources.length >= 256)
            break
          const tx = db.transaction(table, 'readonly')
          const store = tx.objectStore(table)
          source(
            ['idb', entry.name, table],
            `IndexedDB，${entry.name}`,
            table,
            `v${db.version}，keyPath ${JSON.stringify(store.keyPath)}，${Array.from(store.indexNames).join(', ') || '无索引'}，${lifetime}`,
          )
        }
      }
      finally {
        db.close()
      }
    }
    for (const name of (await caches.keys()).slice(0, 100))
      source(['cache', name], 'Cache Storage', name, lifetime)
    let warning: string | undefined
    if (typeof (globalThis as any).__QUA_EDITOR_PREVIEW__ === 'function') {
      try {
        const resources = await inspectResources({ action: 'catalog' })
        for (const entry of resources.sources ?? []) {
          if (entry.id === 'renderer:resources')
            sources.push({ ...entry, group: 'Web Renderer' })
        }
      }
      catch { warning = '内存资源查询失败，点击刷新重试' }
    }
    return { sources, note: lifetime, warning }
  }
  const parts = JSON.parse(request.source ?? '[]') as string[]
  const kind = parts[0]
  if (
    !Array.isArray(parts)
    || !parts.every(value => typeof value === 'string')
  ) {
    throw new Error('无效的 Web 存储位置。')
  }
  if (kind === 'local' || kind === 'session') {
    const storage = kind === 'local' ? localStorage : sessionStorage
    if (request.action === 'detail') {
      const value = storage.getItem(request.key!)
      if (value === null)
        throw new Error('记录已不存在，请刷新。')
      return {
        detail: {
          text: value.slice(0, 64000),
          format: 'text',
          bytes: value.length * 2,
          truncated: value.length > 64000,
        },
      }
    }
    const rows = []
    let matches = 0
    let scanned = 0
    for (; scanned < Math.min(storage.length, 10000); scanned++) {
      const key = storage.key(scanned)!
      if (!key.toLowerCase().includes(filter))
        continue
      if (matches++ < offset)
        continue
      if (rows.length === limit)
        break
      const value = storage.getItem(key) ?? ''
      rows.push({
        key,
        cells: [text(key), text(value), String(value.length * 2)],
      })
    }
    return {
      columns: ['Key', 'Value', 'UTF-16 字节'],
      rows,
      hasMore: matches > offset + limit,
      warning: storage.length > 10000 ? '已达到 10000 项扫描上限' : undefined,
      note:
        storage.length > 10000 ? '只扫描前 10000 项；筛选按 Key。' : lifetime,
    }
  }
  if (kind === 'idb' && parts.length === 3) {
    const db = await open(parts[1])
    try {
      const tx = db.transaction(parts[2], 'readonly')
      const store = tx.objectStore(parts[2])
      if (request.action === 'detail') {
        const value = await new Promise<any>((resolve, reject) => {
          const op = store.get(decodeKey(JSON.parse(request.key!)))
          op.onsuccess = () => resolve(op.result)
          op.onerror = () => reject(op.error)
        })
        if (value === undefined)
          throw new Error('记录已不存在，请刷新。')
        return {
          detail: detail(value),
          note: '二进制字段显示类型和大小；所有读取均为 readonly 事务。',
        }
      }
      return await new Promise<PreviewStorageResult>((resolve, reject) => {
        const rows: NonNullable<PreviewStorageResult['rows']> = []
        let matches = 0
        let scanned = 0
        const op = store.openCursor()
        const done = (more: boolean) =>
          resolve({
            columns: ['Key', 'Value / 资源元数据'],
            rows,
            hasMore: more,
            warning: scanned >= 10000 ? '已达到 10000 项扫描上限' : undefined,
            note:
              scanned >= 10000
                ? '已达到 10000 项扫描上限，请缩小表范围。'
                : '按 Key 筛选，每页 50 项，二进制仅显示元数据',
          })
        op.onerror = () => reject(op.error)
        op.onsuccess = () => {
          const cursor = op.result
          if (!cursor || scanned++ >= 10000) {
            done(false)
            return
          }
          const key = JSON.stringify(encodeKey(cursor.primaryKey))
          if (key.toLowerCase().includes(filter)) {
            if (matches++ >= offset) {
              if (rows.length === limit) {
                done(true)
                return
              }
              rows.push({
                key,
                cells: [
                  text(key),
                  detail(cursor.value).text.replace(/\s+/g, ' ').slice(0, 500),
                ],
              })
            }
          }
          cursor.continue()
        }
      })
    }
    finally {
      db.close()
    }
  }
  if (kind === 'cache' && parts.length === 2) {
    if (!(await caches.keys()).includes(parts[1]))
      throw new Error('缓存已删除，请刷新。')
    const cache = await caches.open(parts[1])
    if (request.action === 'detail') {
      const cachedRequest = JSON.parse(request.key!)
      const response = await cache.match(new Request(cachedRequest.url, { method: cachedRequest.method, headers: cachedRequest.headers }))
      if (!response)
        throw new Error('资源已不存在，请刷新。')
      const headers = Object.fromEntries(response.headers)
      const reader = response.body?.getReader()
      const chunks: number[] = []
      let truncated = false
      try {
        if (reader) {
          while (chunks.length <= 32000) {
            const { value, done } = await reader.read()
            if (done)
              break
            const remaining = 32000 - chunks.length
            for (const byte of value.subarray(0, remaining)) chunks.push(byte)
            if (value.length >= remaining) {
              truncated = true
              break
            }
          }
        }
      }
      finally {
        await reader?.cancel().catch(() => {})
      }
      const mime = response.headers.get('content-type') ?? ''
      const body = /text|json|javascript|xml|svg/.test(mime)
        ? new TextDecoder().decode(new Uint8Array(chunks))
        : `[binary: ${chunks
          .slice(0, 256)
          .map(value => value.toString(16).padStart(2, '0'))
          .join(' ')}${chunks.length > 256 ? ' …' : ''}]`
      return {
        detail: {
          text: JSON.stringify(
            { url: cachedRequest.url, status: response.status, headers, body },
            null,
            2,
          ),
          format: 'json',
          truncated,
        },
        note: '只读取缓存副本；不会发起网络请求。响应体最多显示 32 KB。',
      }
    }
    const keys = (await cache.keys())
      .slice(0, 10000)
      .filter(key => key.url.toLowerCase().includes(filter))
    const rows = []
    for (const key of keys.slice(offset, offset + limit)) {
      const response = await cache.match(key)
      rows.push({
        key: JSON.stringify({ url: key.url, method: key.method, headers: Object.fromEntries(key.headers) }),
        cells: [
          text(key.url),
          key.method,
          String(response?.status ?? ''),
          response?.headers.get('content-type') ?? '',
        ],
      })
    }
    return {
      columns: ['URL', 'Method', 'Status', 'Content-Type'],
      rows,
      hasMore: keys.length > offset + limit,
      note: '按 URL 筛选，最多扫描 10000 项',
    }
  }
  throw new Error('不支持的 Web 存储类型。')
}

export function webStorage(
  cdp: (method: string, params?: Record<string, unknown>) => Promise<any>,
) {
  return async (
    request: PreviewStorageRequest,
  ): Promise<PreviewStorageResult> => {
    const result = await cdp('Runtime.evaluate', {
      expression: `(async()=>{let timer;try{return await Promise.race([(${queryWebStorage.toString()})(${JSON.stringify(request)}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('存储查询超时')),8000)})])}finally{clearTimeout(timer)}})()`,
      awaitPromise: true,
      returnByValue: true,
      timeout: 10000,
    })
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? 'Web 存储读取失败。',
      )
    }
    if (!result.result?.value)
      throw new Error('Web 存储未响应。')
    return result.result.value
  }
}
