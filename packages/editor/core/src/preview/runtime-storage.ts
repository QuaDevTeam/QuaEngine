import type { QuaEngine } from '@quajs/engine'
import type { PreviewMemoryResource, PreviewStorageRequest, PreviewStorageResult } from './storage.js'
import { storageDetail, validateStorageRequest } from './storage.js'

export async function readEngineStorage(
  engine: QuaEngine,
  input: PreviewStorageRequest,
  getResources?: () => readonly PreviewMemoryResource[],
): Promise<PreviewStorageResult> {
  const request = validateStorageRequest(input)
  if (request.source === 'renderer:resources') {
    if (!getResources)
      throw new Error('项目未提供渲染资源信息。')
    const entries = getResources().slice(0, 10000)
    if (request.action === 'detail') {
      const entry = entries.find(entry => entry.key === request.key)
      if (!entry)
        throw new Error('资源已释放，请刷新。')
      return { detail: storageDetail(entry) }
    }
    const matches = entries.filter(entry => `${entry.type}/${entry.name}`.toLowerCase().includes(request.filter!.toLowerCase()))
    return {
      columns: ['资源', '估算字节', '引用'],
      hasMore: matches.length > request.offset! + 50,
      warning: entries.length === 10000 ? '仅显示前 10000 个资源句柄' : undefined,
      rows: matches.slice(request.offset!, request.offset! + 50).map(entry => ({ key: entry.key, cells: [`${entry.type}/${entry.name}`, String(entry.estimatedBytes), entry.refs ? String(entry.refs) : '待释放'], resident: true })),
    }
  }
  const storage = await engine.getStore().getStorageManager()
  const backend = storage.getBackend().storageInfo
  const description
    = backend?.persistence === 'session'
      ? '内存后端，预览结束后丢失'
      : `${backend?.driver ?? '未知后端'}，${backend?.namespace ?? ''}，持久性由项目存储适配器决定`
  const tables = [
    ['snapshots', '快照'],
    ['slots', '存档索引'],
    ['payloads', '存档数据'],
  ] as const
  if (request.action === 'catalog') {
    return {
      sources: [...tables.map(([id, label]) => ({
        id: `engine:${id}`,
        group: '引擎存档',
        label,
        description,
      })), ...(getResources ? [{ id: 'renderer:resources', group: 'Renderer', label: '内存资源', description: '资源句柄，编码字节与解码尺寸估算，不含浏览器内部缓存和 GPU 分配' }] : [])],
    }
  }
  const table = request.source?.slice('engine:'.length)
  if (
    !request.source?.startsWith('engine:')
    || !tables.some(([id]) => id === table)
  ) {
    throw new Error('未知的引擎存储表。')
  }
  if (request.action === 'detail') {
    const value
      = table === 'snapshots'
        ? await storage.getSnapshot(request.key!)
        : table === 'slots'
          ? await storage.getGameSlotIndex(request.key!)
          : await storage.getGameSlotPayload(request.key!)
    if (!value)
      throw new Error('记录已不存在，请刷新。')
    return { detail: storageDetail(value), note: description }
  }
  const entries
    = table === 'snapshots'
      ? await storage.listSnapshots()
      : await storage.listGameSlotIndexes()
  const rows = entries.filter(item =>
    JSON.stringify(item).toLowerCase().includes(request.filter!.toLowerCase()),
  )
  return {
    columns: ['记录', '元数据'],
    note: description,
    total: rows.length,
    hasMore: rows.length > request.offset! + 50,
    rows: rows
      .slice(request.offset!, request.offset! + 50)
      .map((item: any) => ({
        key: item.slotId ?? item.id,
        cells: [item.slotId ?? item.id, JSON.stringify(item).slice(0, 500)],
      })),
  }
}
